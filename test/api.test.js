/**
 * test/api.test.js
 * 
 * Integration test suite for Pressure Map API routes.
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const os = require('os');
const fs = require('fs');
const path = require('path');
const app = require('../server.js');

let server;
let baseUrl;
let adminCookie = '';
let workerCookie = '';
let tempDir = '';

describe('Pressure Map API Integration Tests', () => {

  before(async () => {
    // Isolated temporary data directory for tests
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pressure-map-test-api-'));
    fs.copyFileSync(path.join(__dirname, '..', 'data', 'reports.backup.json'), path.join(tempDir, 'reports.json'));
    fs.copyFileSync(path.join(__dirname, '..', 'data', 'workerVoice.backup.json'), path.join(tempDir, 'workerVoice.json'));
    process.env.DATA_DIR = tempDir;

    await new Promise((resolve) => {
      server = app.listen(0, () => {
        const port = server.address().port;
        baseUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });

    // Authenticate as Admin
    const adminRes = await fetch(`${baseUrl}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'PressureMap2026!' })
    });
    adminCookie = adminRes.headers.get('set-cookie')?.split(';')[0] || '';

    // Authenticate as Worker
    const workerRes = await fetch(`${baseUrl}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: 'BLOCK-ALPHA1' })
    });
    workerCookie = workerRes.headers.get('set-cookie')?.split(';')[0] || '';
  });

  after(async () => {
    if (server) await new Promise((resolve) => server.close(resolve));
    if (tempDir && fs.existsSync(tempDir)) {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch {}
    }
  });

  test('GET /api/summary returns valid KPI metrics and filter lists (excluding suppressed groups from counts & filters)', async () => {
    const res = await fetch(`${baseUrl}/api/summary`, {
      headers: { 'Cookie': adminCookie }
    });
    assert.equal(res.status, 200);
    const data = await res.json();

    assert.ok(data.kpi);
    // groupsReviewed excludes suppressed groups
    assert.ok(data.kpi.groupsReviewed >= 20);
    assert.ok(data.kpi.unfairTargets > 0);
    assert.ok(data.kpi.needingReview > 0);
    assert.ok(data.kpi.dataErrors > 0);
    assert.ok(data.kpi.suppressedSmallGroups > 0);

    assert.ok(data.privacyTotals);
    assert.ok(data.privacyTotals.suppressedCount > 0);
    assert.ok(data.privacyTotals.totalEligible > 0);

    assert.ok(Array.isArray(data.filters.districts));
    assert.ok(data.filters.districts.length > 0);
  });

  test('GET /api/chart-data returns district-wise stacked bar datasets and accessibility summary text', async () => {
    const res = await fetch(`${baseUrl}/api/chart-data`, {
      headers: { 'Cookie': adminCookie }
    });
    assert.equal(res.status, 200);
    const data = await res.json();

    assert.ok(Array.isArray(data.labels));
    assert.ok(data.labels.length > 0);
    assert.ok(Array.isArray(data.datasets));
    assert.equal(data.datasets.length, 5); // Data error, Needs review, Unfair target, OK, Inconclusive

    const labels = data.datasets.map(d => d.label);
    assert.ok(labels.includes('Data error'));
    assert.ok(labels.includes('Needs review'));
    assert.ok(labels.includes('Unfair target'));
    assert.ok(labels.includes('OK'));
    assert.ok(labels.includes('Inconclusive'));

    assert.ok(data.summaryText);
    assert.ok(typeof data.summaryText === 'string');
    assert.ok(data.summaryText.length > 0);
  });

  test('GET /api/chart-data returns "No data to display" on empty filter match', async () => {
    const res = await fetch(`${baseUrl}/api/chart-data?district=NonExistentDistrict`, {
      headers: { 'Cookie': adminCookie }
    });
    assert.equal(res.status, 200);
    const data = await res.json();

    assert.equal(data.labels.length, 0);
    assert.equal(data.datasets.length, 0);
    assert.equal(data.summaryText, 'No data to display');
  });

  test('GET /api/map-data returns blocks with coordinates, status, symbols, and labels', async () => {
    const res = await fetch(`${baseUrl}/api/map-data`, {
      headers: { 'Cookie': adminCookie }
    });
    assert.equal(res.status, 200);
    const data = await res.json();

    assert.ok(Array.isArray(data.blocks));
    assert.ok(data.blocks.length >= 8);
    assert.ok(data.notice.includes('Map positions are illustrative'));

    const sample = data.blocks[0];
    assert.ok(sample.district);
    assert.ok(sample.block);
    assert.ok(typeof sample.lat === 'number');
    assert.ok(typeof sample.lng === 'number');
    assert.ok(['red', 'amber', 'green', 'grey'].includes(sample.status));
    assert.ok(['✕', '!', '✓', '–'].includes(sample.symbol));
    assert.ok(sample.reason);
  });

  test('Privacy Assertion: Suppressed groups (<30) never appear in KPI counts, chart data, map numbers, or CSV export', async () => {
    // 1. Check KPI counts: total groups = groupsReviewed + suppressedSmallGroups
    const summaryRes = await fetch(`${baseUrl}/api/summary`, {
      headers: { 'Cookie': adminCookie }
    });
    const summary = await summaryRes.json();
    assert.ok(summary.kpi.suppressedSmallGroups > 0, 'Must have suppressed groups in demo data');
    
    // 2. Check Chart Data: sum of all dataset bars should equal groupsReviewed (strictly excluding suppressed!)
    const chartRes = await fetch(`${baseUrl}/api/chart-data`, {
      headers: { 'Cookie': adminCookie }
    });
    const chartData = await chartRes.json();
    let totalChartBars = 0;
    for (const dataset of chartData.datasets) {
      for (const val of dataset.data) {
        totalChartBars += val;
      }
    }
    assert.equal(totalChartBars, summary.kpi.groupsReviewed, 'Chart bars must strictly equal groupsReviewed, excluding suppressed groups');

    // 3. Check Map Data: suppressed block must have counts === null and values hidden
    const mapRes = await fetch(`${baseUrl}/api/map-data`, {
      headers: { 'Cookie': adminCookie }
    });
    const mapData = await mapRes.json();
    const suppressedMapBlock = mapData.blocks.find(b => b.isSuppressed);
    assert.ok(suppressedMapBlock, 'Expected at least one suppressed block in map');
    assert.equal(suppressedMapBlock.counts, null);
    assert.equal(suppressedMapBlock.status, 'grey');
    assert.equal(suppressedMapBlock.symbol, '–');
    assert.ok(suppressedMapBlock.reason.includes('Suppressed (small group), values hidden'));

    // 4. Check CSV Export: suppressed groups must NOT appear in CSV export
    const exportRes = await fetch(`${baseUrl}/api/export`, {
      headers: { 'Cookie': adminCookie }
    });
    const csvText = await exportRes.text();
    // In reports.json, Block Alpha-4 has eligible = 24 (suppressed)
    assert.ok(!csvText.includes('Block Alpha-4'), 'Suppressed group Block Alpha-4 must be completely excluded from CSV export');
    // Block Beta-5 has eligible = 18 (suppressed)
    assert.ok(!csvText.includes('Block Beta-5'), 'Suppressed group Block Beta-5 must be completely excluded from CSV export');
  });

  test('GET /api/worker-voice enforces anonymity rules: >=5 threshold and never shows suppressed blocks', async () => {
    const res = await fetch(`${baseUrl}/api/worker-voice`, {
      headers: { 'Cookie': adminCookie }
    });
    assert.equal(res.status, 200);
    const data = await res.json();

    assert.ok(Array.isArray(data.results));

    // Rule 1: Blocks with unfair targets have 5+ reports of "Target is unrealistic"
    const unfairBlock = data.results.find(r => r.block === 'Block Alpha-2');
    assert.ok(unfairBlock, 'Expected Block Alpha-2 in worker voice');
    assert.equal(unfairBlock.hasEnoughReports, true);
    assert.ok(unfairBlock.totalReports >= 5);
    assert.ok(unfairBlock.issues['Target is unrealistic'] >= 5);

    // Rule 2: Blocks with < 5 reports show "Not enough reports to display" and counts hidden
    const lowReportBlock = data.results.find(r => r.block === 'Block Beta-1');
    assert.ok(lowReportBlock, 'Expected Block Beta-1 in worker voice');
    assert.equal(lowReportBlock.hasEnoughReports, false);
    assert.equal(lowReportBlock.totalReports, null);
    assert.equal(lowReportBlock.message, 'Not enough reports to display');
    assert.deepEqual(lowReportBlock.issues, {});

    // Rule 3: Suppressed blocks (eligible < 30, e.g. Block Alpha-4) are NEVER shown!
    const suppressedBlock = data.results.find(r => r.block === 'Block Alpha-4');
    assert.equal(suppressedBlock, undefined, 'Suppressed blocks (< 30 eligible) must NEVER be shown in worker voice');
  });

  test('GET /api/findings returns live computed findings with small-group masking (no rule findings, no numbers, status: suppressed)', async () => {
    const res = await fetch(`${baseUrl}/api/findings`, {
      headers: { 'Cookie': adminCookie }
    });
    assert.equal(res.status, 200);
    const data = await res.json();

    assert.ok(Array.isArray(data.results));
    assert.ok(data.results.length > 0);

    const suppressedItem = data.results.find(item => item.row.isSuppressed === true);
    assert.ok(suppressedItem, 'Expected at least one suppressed small group in demo data');

    // Rule-specific findings must be empty
    assert.equal(suppressedItem.findings.length, 0, 'Suppressed group must return NO rule-specific findings');

    // Status metadata must explicitly identify suppression
    assert.equal(suppressedItem.statusInfo.status, 'suppressed');
    assert.equal(suppressedItem.statusInfo.label, 'Suppressed (small group)');
    assert.equal(suppressedItem.statusInfo.icon, '–');

    // All numerical metrics must be masked to string with no values derived from data
    assert.equal(suppressedItem.row.eligible, 'Suppressed (small group)');
    assert.equal(suppressedItem.row.reported, 'Suppressed (small group)');
    assert.equal(suppressedItem.row.target, 'Suppressed (small group)');
    assert.equal(suppressedItem.row.avg, 'Suppressed (small group)');
    assert.equal(suppressedItem.row.sessionsPlanned, 'Suppressed (small group)');
    assert.equal(suppressedItem.row.sessionsHeld, 'Suppressed (small group)');

    // Context derivations must be null
    assert.equal(suppressedItem.suggestedFairTarget, null);
    assert.equal(suppressedItem.workerVoice, null);
  });

  test('POST /api/report rejects personal identifier fields and free-text notes', async () => {
    const badPayload = {
      district: 'North Highlands',
      block: 'Block Alpha-1',
      month: '2026-05',
      indicator: 'DPT3',
      workerName: 'Sister Mary', // FORBIDDEN IDENTIFIER
      eligible: 100,
      reported: 90,
      target: 95
    };

    const res = await fetch(`${baseUrl}/api/report`, {
      method: 'POST',
      headers: {
        'Cookie': workerCookie,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(badPayload)
    });

    assert.equal(res.status, 400);
    const data = await res.json();
    assert.equal(data.success, false);
    assert.ok(data.error.includes('Disallowed field "workerName"'));
  });

  test('POST /api/report accepts valid anonymous group report and replaces duplicate unique key', async () => {
    const initialPayload = {
      district: 'North Highlands',
      block: 'Block Alpha-1',
      month: '2026-07',
      indicator: 'DPT3',
      eligible: 120,
      reported: 100,
      target: 105,
      avg: 95,
      sessionsPlanned: 8,
      sessionsHeld: 8,
      problems: ['Resources are short']
    };

    const res1 = await fetch(`${baseUrl}/api/report`, {
      method: 'POST',
      headers: {
        'Cookie': workerCookie,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(initialPayload)
    });

    assert.equal(res1.status, 201);
    const data1 = await res1.json();
    assert.equal(data1.success, true);
    assert.equal(data1.record.district, 'North Highlands');
    assert.equal(data1.record.block, 'Block Alpha-1');
    assert.equal(data1.record.reported, 100);

    // Now submit updated report for SAME unique key (North Highlands + Block Alpha-1 + 2026-07 + DPT3)
    const updatePayload = {
      district: 'North Highlands',
      block: 'Block Alpha-1',
      month: '2026-07',
      indicator: 'DPT3',
      eligible: 120,
      reported: 110, // updated number
      target: 105,
      avg: 95,
      sessionsPlanned: 8,
      sessionsHeld: 8,
      problems: ['Resources are short']
    };

    const res2 = await fetch(`${baseUrl}/api/report`, {
      method: 'POST',
      headers: {
        'Cookie': workerCookie,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(updatePayload)
    });

    assert.equal(res2.status, 201);
    const data2 = await res2.json();
    assert.equal(data2.record.reported, 110);
    assert.ok(data2.message.includes('replaced prior entry'));
  });

  test('POST /api/upload accepts CSV, rejects duplicate unique keys with clear reasons, and parses double quotes strictly', async () => {
    const csvContent = `district,block,month,indicator,eligible,reported,target,avg,sessionsPlanned,sessionsHeld
"Unique District","Block Upload 1","2026-08","DPT3",150,140,145,130,10,10
"Unique District","Block Upload 1","2026-08","DPT3",150,140,145,130,10,10`;

    const res = await fetch(`${baseUrl}/api/upload`, {
      method: 'POST',
      headers: {
        'Cookie': adminCookie,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ csv: csvContent })
    });

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.success, true);
    assert.equal(data.acceptedCount, 1);
    assert.equal(data.rejectedCount, 1);
    assert.ok(data.rejected[0].reason.includes('Duplicate entry'));
  });

  test('GET /api/export prefixes formula characters (=, +, -, @) with single quote', async () => {
    // Add a record with formula characters into tempDir reports to test injection prevention
    const reportsPath = path.join(tempDir, 'reports.json');
    const reports = JSON.parse(fs.readFileSync(reportsPath, 'utf8'));
    reports.push({
      district: '=SUM(1,2)',
      block: '+InjectedBlock',
      month: '2026-11',
      indicator: '-FormulaIndicator',
      eligible: 100,
      reported: 90,
      target: 95,
      avg: 85
    });
    fs.writeFileSync(reportsPath, JSON.stringify(reports));

    const res = await fetch(`${baseUrl}/api/export`, {
      headers: { 'Cookie': adminCookie }
    });
    assert.equal(res.status, 200);
    const csv = await res.text();
    assert.ok(csv.startsWith('District,Block'));
    // Must contain prefixed formula cells
    assert.ok(csv.includes(`"'=SUM(1,2)"`), 'Cell starting with = must be prefixed with single quote');
    assert.ok(csv.includes(`"'+InjectedBlock"`), 'Cell starting with + must be prefixed with single quote');
    assert.ok(csv.includes(`"'-FormulaIndicator"`), 'Cell starting with - must be prefixed with single quote');
  });

  test('POST /api/reset successfully restores demo data', async () => {
    const res = await fetch(`${baseUrl}/api/reset`, {
      method: 'POST',
      headers: { 'Cookie': adminCookie }
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.success, true);
  });

});
