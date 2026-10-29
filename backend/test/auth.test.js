/**
 * test/auth.test.js
 * 
 * Unit & Integration tests for Pressure Map role-based authentication & permissions.
 * Principle: "Strengthen the system; protect the people in it."
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const os = require('os');
const fs = require('fs');
const path = require('path');
const app = require('../server.js');

let server;
let baseUrl;
let cachedWorkerCookie = '';
let cachedAdminCookie = '';
let tempDir = '';

describe('Role-Based Demo Access & Permissions', () => {

  before(async () => {
    // Isolated temporary data directory for tests
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pressure-map-test-auth-'));
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
  });

  after(async () => {
    if (server) await new Promise((resolve) => server.close(resolve));
    if (tempDir && fs.existsSync(tempDir)) {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch {}
    }
  });

  // Helper: Extract cookie value from response
  function extractCookie(res) {
    const raw = res.headers.get('set-cookie');
    return raw ? raw.split(';')[0] : '';
  }

  test('POST /api/login: worker logs in with block access code only', async () => {
    const res = await fetch(`${baseUrl}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: 'BLOCK-ALPHA1' })
    });

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.success, true);
    assert.equal(data.role, 'worker');
    assert.equal(data.block, 'Block Alpha-1');
    assert.equal(data.district, 'North Highlands');

    // Cookie is set
    cachedWorkerCookie = extractCookie(res);
    assert.ok(cachedWorkerCookie.startsWith('session_token='));
  });

  test('POST /api/login: admin logs in with username and password', async () => {
    const res = await fetch(`${baseUrl}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'PressureMap2026!' })
    });

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.success, true);
    assert.equal(data.role, 'admin');
    assert.equal(data.block, null);

    cachedAdminCookie = extractCookie(res);
    assert.ok(cachedAdminCookie.startsWith('session_token='));
  });

  test('POST /api/login: rejects invalid block code (401)', async () => {
    const res = await fetch(`${baseUrl}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: 'INVALID-CODE-999' })
    });

    assert.equal(res.status, 401);
    const data = await res.json();
    assert.equal(data.success, false);
    assert.ok(data.error.includes('Invalid block access code'));
  });

  test('POST /api/login: rejects invalid admin credentials (401)', async () => {
    const res = await fetch(`${baseUrl}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'WrongPassword!' })
    });

    assert.equal(res.status, 401);
    const data = await res.json();
    assert.equal(data.success, false);
    assert.ok(data.error.includes('Invalid username or password'));
  });

  test('GET /api/me returns 401 when no session exists', async () => {
    const res = await fetch(`${baseUrl}/api/me`);
    assert.equal(res.status, 401);
  });

  test('GET /api/me returns worker role and block info with valid session', async () => {
    const meRes = await fetch(`${baseUrl}/api/me`, {
      headers: { 'Cookie': cachedWorkerCookie }
    });
    assert.equal(meRes.status, 200);
    const data = await meRes.json();
    assert.equal(data.role, 'worker');
    assert.equal(data.block, 'Block Alpha-1');
    assert.equal(data.district, 'North Highlands');
  });

  test('GET /api/me returns admin role with valid session', async () => {
    const meRes = await fetch(`${baseUrl}/api/me`, {
      headers: { 'Cookie': cachedAdminCookie }
    });
    assert.equal(meRes.status, 200);
    const data = await meRes.json();
    assert.equal(data.role, 'admin');
    assert.equal(data.block, null);
  });

  test('Unauthenticated request to protected routes returns 401', async () => {
    // Admin routes
    const findingsRes = await fetch(`${baseUrl}/api/findings`);
    assert.equal(findingsRes.status, 401);

    const summaryRes = await fetch(`${baseUrl}/api/summary`);
    assert.equal(summaryRes.status, 401);

    const chartRes = await fetch(`${baseUrl}/api/chart-data`);
    assert.equal(chartRes.status, 401);

    const mapRes = await fetch(`${baseUrl}/api/map-data`);
    assert.equal(mapRes.status, 401);

    const workerVoiceRes = await fetch(`${baseUrl}/api/worker-voice`);
    assert.equal(workerVoiceRes.status, 401);

    // Worker route
    const reportRes = await fetch(`${baseUrl}/api/report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ district: 'North Highlands', block: 'Block Alpha-1', month: '2026-05', eligible: 50, reported: 40, target: 45 })
    });
    assert.equal(reportRes.status, 401);
  });

  test('Worker cannot call admin routes (403 Forbidden)', async () => {
    // Test each admin route using cachedWorkerCookie
    const findingsRes = await fetch(`${baseUrl}/api/findings`, { headers: { 'Cookie': cachedWorkerCookie } });
    assert.equal(findingsRes.status, 403, 'Worker must get 403 on /api/findings');

    const summaryRes = await fetch(`${baseUrl}/api/summary`, { headers: { 'Cookie': cachedWorkerCookie } });
    assert.equal(summaryRes.status, 403, 'Worker must get 403 on /api/summary');

    const chartRes = await fetch(`${baseUrl}/api/chart-data`, { headers: { 'Cookie': cachedWorkerCookie } });
    assert.equal(chartRes.status, 403, 'Worker must get 403 on /api/chart-data');

    const mapRes = await fetch(`${baseUrl}/api/map-data`, { headers: { 'Cookie': cachedWorkerCookie } });
    assert.equal(mapRes.status, 403, 'Worker must get 403 on /api/map-data');

    const workerVoiceRes = await fetch(`${baseUrl}/api/worker-voice`, { headers: { 'Cookie': cachedWorkerCookie } });
    assert.equal(workerVoiceRes.status, 403, 'Worker must get 403 on /api/worker-voice');

    const uploadRes = await fetch(`${baseUrl}/api/upload`, {
      method: 'POST',
      headers: { 'Cookie': cachedWorkerCookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ csv: 'dummy' })
    });
    assert.equal(uploadRes.status, 403, 'Worker must get 403 on /api/upload');

    const resetRes = await fetch(`${baseUrl}/api/reset`, {
      method: 'POST',
      headers: { 'Cookie': cachedWorkerCookie }
    });
    assert.equal(resetRes.status, 403, 'Worker must get 403 on /api/reset');

    const exportRes = await fetch(`${baseUrl}/api/export`, { headers: { 'Cookie': cachedWorkerCookie } });
    assert.equal(exportRes.status, 403, 'Worker must get 403 on /api/export');
  });

  test('Admin cannot post worker reports (403 Forbidden)', async () => {
    const reportRes = await fetch(`${baseUrl}/api/report`, {
      method: 'POST',
      headers: { 'Cookie': cachedAdminCookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        district: 'North Highlands',
        block: 'Block Alpha-1',
        month: '2026-05',
        eligible: 100,
        reported: 90,
        target: 95
      })
    });

    assert.equal(reportRes.status, 403, 'Admin must get 403 on POST /api/report');
    const data = await reportRes.json();
    assert.ok(data.error.includes('worker role required'));
  });

  test('The report block comes strictly from the SESSION (prevents cross-block reporting)', async () => {
    // cachedWorkerCookie belongs to Block Alpha-1
    // Worker attempts to submit a report claiming to be "Block Delta-5"
    const submitRes = await fetch(`${baseUrl}/api/report`, {
      method: 'POST',
      headers: { 'Cookie': cachedWorkerCookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        district: 'Coastal Delta',
        block: 'Block Delta-5', // Attempted spoofed block!
        month: '2026-06',
        indicator: 'DPT3',
        eligible: 150,
        reported: 140,
        target: 145,
        avg: 130
      })
    });

    assert.equal(submitRes.status, 201);
    const data = await submitRes.json();
    assert.equal(data.success, true);
    // Block MUST be Block Alpha-1 (from session), NOT the submitted Block Delta-5!
    assert.equal(data.record.block, 'Block Alpha-1');
  });

  test('Worker Voice must count at most one report per block+month per session', async () => {
    // Submit 1st report with problem for Block Alpha-1 (month: 2026-10)
    const res1 = await fetch(`${baseUrl}/api/report`, {
      method: 'POST',
      headers: { 'Cookie': cachedWorkerCookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        month: '2026-10',
        indicator: 'DPT3',
        eligible: 100,
        reported: 80,
        target: 90,
        problems: ['Target is unrealistic']
      })
    });
    assert.equal(res1.status, 201);

    // Read worker voice tallies
    const wvData1 = JSON.parse(fs.readFileSync(path.join(tempDir, 'workerVoice.json'), 'utf8'));
    const entry1 = wvData1.find(w => w.block === 'Block Alpha-1' && w.month === '2026-10');
    assert.ok(entry1);
    const countAfterFirst = entry1.totalReports;

    // Submit 2nd report within the SAME session for SAME block+month
    const res2 = await fetch(`${baseUrl}/api/report`, {
      method: 'POST',
      headers: { 'Cookie': cachedWorkerCookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        month: '2026-10',
        indicator: 'Measles-Rubella',
        eligible: 100,
        reported: 85,
        target: 90,
        problems: ['Target is unrealistic']
      })
    });
    assert.equal(res2.status, 201);

    // Worker Voice totalReports must NOT have incremented a second time
    const wvData2 = JSON.parse(fs.readFileSync(path.join(tempDir, 'workerVoice.json'), 'utf8'));
    const entry2 = wvData2.find(w => w.block === 'Block Alpha-1' && w.month === '2026-10');
    assert.equal(entry2.totalReports, countAfterFirst, 'Second submission in same session must not double-count in worker voice');
  });

  test('Stored reports contain no identifying fields (strict privacy enforcement)', async () => {
    // Attempt to submit report with forbidden personal identifier fields
    const disallowedPayloads = [
      { workerName: 'Sister Mary' },
      { patientName: 'John Doe' },
      { aadhaarNumber: '123456789012' },
      { phoneNumber: '9876543210' },
      { staffId: 'EMP1001' }
    ];

    for (const badField of disallowedPayloads) {
      const res = await fetch(`${baseUrl}/api/report`, {
        method: 'POST',
        headers: { 'Cookie': cachedWorkerCookie, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          month: '2026-06',
          eligible: 100,
          reported: 95,
          target: 95,
          ...badField
        })
      });

      assert.equal(res.status, 400, `Payload with ${Object.keys(badField)[0]} must be rejected with 400`);
      const data = await res.json();
      assert.equal(data.success, false);
      assert.ok(data.error.includes('Privacy violation'));
    }

    // Verify stored reports in temporary data file contain no forbidden identifier fields
    const reportsPath = path.join(tempDir, 'reports.json');
    const reports = JSON.parse(fs.readFileSync(reportsPath, 'utf8'));
    const forbiddenPattern = /(name|worker|aadhaar|uid|phone|mobile|patient|beneficiary|address|national_id|ssn|contact|staffId|notes)/i;

    for (const row of reports) {
      for (const key of Object.keys(row)) {
        assert.ok(!forbiddenPattern.test(key), `Stored record must never contain identifier key "${key}"`);
      }
    }
  });

  test('POST /api/logout clears session', async () => {
    // Perform a dedicated login to test logout
    const loginRes = await fetch(`${baseUrl}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: 'BLOCK-BETA1' })
    });
    const tempCookie = extractCookie(loginRes);

    const logoutRes = await fetch(`${baseUrl}/api/logout`, {
      method: 'POST',
      headers: { 'Cookie': tempCookie }
    });
    assert.equal(logoutRes.status, 200);

    // Session is now invalidated in memory
    const meRes = await fetch(`${baseUrl}/api/me`, {
      headers: { 'Cookie': tempCookie }
    });
    assert.equal(meRes.status, 401);
  });

  test('POST /api/login: rate limits excessive attempts per minute per IP (returns 429)', async () => {
    let got429 = false;
    for (let i = 0; i < 12; i++) {
      const res = await fetch(`${baseUrl}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: 'RATE-LIMIT-PROBE' })
      });
      if (res.status === 429) {
        got429 = true;
        const data = await res.json();
        assert.ok(data.error.includes('Too many login attempts'));
        break;
      }
    }
    assert.equal(got429, true, 'Expected 429 response when rate limit threshold exceeded');
  });

});
