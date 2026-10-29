/**
 * test/checks.test.js
 * 
 * Unit test suite for Pressure Map checks and privacy logic.
 * Run with: npm test (or node --test test/checks.test.js)
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { checkRow, validateRowFormat, getRowStatus } = require('../logic/checks.js');
const { 
  validatePrivacy, 
  isSmallGroup, 
  maskRowForPrivacy, 
  maskFindingsForPrivacy, 
  calculatePrivacySafeTotals 
} = require('../logic/privacy.js');

describe('Pressure Map Logic Checks', () => {

  test('Rule 1: Inconclusive when eligible is 0, negative, or missing (never produces NaN/Infinity)', () => {
    // Eligible is 0
    const rowZero = {
      district: 'North District',
      block: 'Block A',
      month: '2026-05',
      indicator: 'DPT3',
      eligible: 0,
      reported: 10,
      target: 20
    };
    const findingsZero = checkRow(rowZero);
    assert.equal(findingsZero.length, 1);
    assert.equal(findingsZero[0].rule, 'INCONCLUSIVE');
    assert.equal(findingsZero[0].severity, 'inconclusive');
    assert.ok(findingsZero[0].explanation.includes('Eligible count missing or zero'));
    
    // Check no NaN or Infinity is in findings
    const jsonStrZero = JSON.stringify(findingsZero);
    assert.ok(!jsonStrZero.includes('NaN'));
    assert.ok(!jsonStrZero.includes('Infinity'));

    // Eligible is missing
    const rowMissing = {
      district: 'North District',
      block: 'Block B',
      month: '2026-05',
      indicator: 'DPT3',
      reported: 10
    };
    const findingsMissing = checkRow(rowMissing);
    assert.equal(findingsMissing.length, 1);
    assert.equal(findingsMissing[0].rule, 'INCONCLUSIVE');

    // Eligible is negative
    const rowNegative = {
      district: 'North District',
      block: 'Block C',
      month: '2026-05',
      indicator: 'DPT3',
      eligible: -5,
      reported: 10
    };
    const findingsNegative = checkRow(rowNegative);
    assert.equal(findingsNegative.length, 1);
    assert.equal(findingsNegative[0].rule, 'INCONCLUSIVE');
  });

  test('Rule 2: IMPOSSIBLE_NUMBER when reported > eligible', () => {
    const row = {
      district: 'Valley District',
      block: 'Riverdale',
      month: '2026-05',
      indicator: 'DPT3',
      eligible: 100,
      reported: 125,
      target: 90,
      avg: 80
    };

    const findings = checkRow(row);
    const impossibleFinding = findings.find(f => f.rule === 'IMPOSSIBLE_NUMBER');
    assert.ok(impossibleFinding, 'Expected IMPOSSIBLE_NUMBER finding');
    assert.equal(impossibleFinding.severity, 'review');
    assert.equal(impossibleFinding.recommendedAction, 'Verify population count and definitions (cohort, dose, period).');
    assert.ok(impossibleFinding.explanation.includes('Reported service delivery exceeds the recorded eligible population'));
  });

  test('Rule 3: UNFAIR_TARGET when target > eligible', () => {
    const row = {
      district: 'Highland District',
      block: 'Summit Block',
      month: '2026-05',
      indicator: 'DPT3',
      eligible: 80,
      reported: 75,
      target: 110,
      avg: 70
    };

    const findings = checkRow(row);
    const unfairFinding = findings.find(f => f.rule === 'UNFAIR_TARGET');
    assert.ok(unfairFinding, 'Expected UNFAIR_TARGET finding');
    assert.equal(unfairFinding.severity, 'feasibility');
    assert.equal(unfairFinding.recommendedAction, 'Review and revise the target.');
    assert.ok(unfairFinding.explanation.includes('Top-down system target exceeds the total eligible cohort'));
  });

  test('Rule 4: SPIKE only if avg > 0 and (reported - avg)/avg > 0.5', () => {
    // Spike of 80% (avg = 50, reported = 90 -> 40/50 = 80%)
    const spikeRow = {
      district: 'Plains District',
      block: 'Sector 4',
      month: '2026-05',
      indicator: 'DPT3',
      eligible: 150,
      reported: 90,
      target: 60,
      avg: 50
    };

    const findings = checkRow(spikeRow);
    const spikeFinding = findings.find(f => f.rule === 'SPIKE');
    assert.ok(spikeFinding, 'Expected SPIKE finding');
    assert.equal(spikeFinding.severity, 'review');
    assert.equal(spikeFinding.recommendedAction, 'Check for a campaign, catch-up drive or data entry error.');
    assert.ok(spikeFinding.reference.includes('+80%'));

    // No spike if avg = 0
    const noAvgRow = {
      district: 'Plains District',
      block: 'Sector 4',
      month: '2026-05',
      indicator: 'DPT3',
      eligible: 150,
      reported: 90,
      target: 60,
      avg: 0
    };
    const findingsNoAvg = checkRow(noAvgRow);
    assert.ok(!findingsNoAvg.some(f => f.rule === 'SPIKE'), 'Should not trigger SPIKE when avg is 0');

    // Configurable threshold: custom spike threshold of 0.8 should not trigger on 60%
    const findingsConfig = checkRow(spikeRow, { spikeThreshold: 0.9 });
    assert.ok(!findingsConfig.some(f => f.rule === 'SPIKE'), 'Custom threshold of 90% should not trigger at 80%');
  });

  test('Rule 5: SESSION_MISMATCH when sessionsHeld is much lower than sessionsPlanned while reported is high', () => {
    const mismatchRow = {
      district: 'Coastal District',
      block: 'Bay Block',
      month: '2026-05',
      indicator: 'DPT3',
      eligible: 100,
      reported: 85,
      target: 90,
      avg: 80,
      sessionsPlanned: 10,
      sessionsHeld: 2 // only 20% sessions held, but 85 reported
    };

    const findings = checkRow(mismatchRow);
    const sessionFinding = findings.find(f => f.rule === 'SESSION_MISMATCH');
    assert.ok(sessionFinding, 'Expected SESSION_MISMATCH finding');
    assert.equal(sessionFinding.severity, 'review');
    assert.equal(sessionFinding.recommendedAction, 'Verify session log records and community outreach coverage.');
  });

  test('Rule 6: Malformed rows rejection (bad month, negative, non-numeric)', () => {
    // Bad month format
    const badMonth = {
      district: 'Forest District',
      block: 'Woodland',
      month: '2026/05',
      eligible: 50,
      reported: 40
    };
    const findingsBadMonth = checkRow(badMonth);
    assert.equal(findingsBadMonth[0].rule, 'MALFORMED_DATA');
    assert.equal(findingsBadMonth[0].severity, 'error');

    // Negative reported count
    const negativeReported = {
      district: 'Forest District',
      block: 'Woodland',
      month: '2026-05',
      eligible: 50,
      reported: -10
    };
    const findingsNegative = checkRow(negativeReported);
    assert.equal(findingsNegative[0].rule, 'MALFORMED_DATA');

    // Non-numeric target
    const nonNumericTarget = {
      district: 'Forest District',
      block: 'Woodland',
      month: '2026-05',
      eligible: 50,
      reported: 30,
      target: 'one-hundred'
    };
    const findingsNonNumeric = checkRow(nonNumericTarget);
    assert.equal(findingsNonNumeric[0].rule, 'MALFORMED_DATA');
  });

  test('Row Status Assessment: Clean row returns OK', () => {
    const cleanRow = {
      district: 'Central District',
      block: 'Metro North',
      month: '2026-05',
      indicator: 'DPT3',
      eligible: 120,
      reported: 95,
      target: 100,
      avg: 90,
      sessionsPlanned: 8,
      sessionsHeld: 8
    };

    const findings = checkRow(cleanRow);
    assert.equal(findings.length, 0);
    const status = getRowStatus(findings);
    assert.equal(status.status, 'ok');
    assert.equal(status.label, 'Target Feasible');
  });

  test('Tone and Language: Words like fraud, cheating, or faulty worker must never appear', () => {
    // Generate findings across varied scenarios
    const testCases = [
      { district: 'D1', block: 'B1', month: '2026-05', eligible: 50, reported: 90, target: 40, avg: 30 },
      { district: 'D2', block: 'B2', month: '2026-05', eligible: 50, reported: 40, target: 80, avg: 40 },
      { district: 'D3', block: 'B3', month: '2026-05', eligible: 0, reported: 20 },
      { district: 'D4', block: 'B4', month: '2026-05', eligible: 100, reported: 80, sessionsPlanned: 10, sessionsHeld: 1 }
    ];

    const forbiddenWords = ['fraud', 'cheating', 'faulty worker', 'lazy', 'punish', 'culprit', 'fake tally'];

    for (const tc of testCases) {
      const findings = checkRow(tc);
      const text = JSON.stringify(findings).toLowerCase();
      for (const word of forbiddenWords) {
        assert.ok(!text.includes(word), `Finding text must never contain blaming word: "${word}"`);
      }
    }
  });

});

describe('Privacy and Small-Group Suppression Logic', () => {

  test('validatePrivacy rejects identifier fields', () => {
    const piiPayload = {
      district: 'North District',
      block: 'Block A',
      month: '2026-05',
      workerName: 'Jane Doe',
      reported: 45
    };
    const res = validatePrivacy(piiPayload);
    assert.equal(res.valid, false);
    assert.ok(res.error.includes('Disallowed field "workerName"'));

    const aadhaarPayload = {
      district: 'North District',
      block: 'Block A',
      month: '2026-05',
      patient_aadhaar: '123456789012'
    };
    assert.equal(validatePrivacy(aadhaarPayload).valid, false);

    const validPayload = {
      district: 'North District',
      block: 'Block A',
      month: '2026-05',
      indicator: 'DPT3',
      eligible: 100,
      reported: 85,
      target: 90
    };
    assert.equal(validatePrivacy(validPayload).valid, true);
  });

  test('isSmallGroup correctly flags groups with eligible < 30', () => {
    assert.equal(isSmallGroup({ eligible: 24 }), true);
    assert.equal(isSmallGroup({ eligible: 29 }), true);
    assert.equal(isSmallGroup({ eligible: 30 }), false);
    assert.equal(isSmallGroup({ eligible: 150 }), false);
    assert.equal(isSmallGroup({ eligible: 0 }), false); // Inconclusive, not suppressed small group
  });

  test('maskRowForPrivacy replaces numbers with "Suppressed (small group)"', () => {
    const smallRow = {
      district: 'Valley District',
      block: 'Isolated Hamlet',
      month: '2026-05',
      eligible: 18,
      reported: 15,
      target: 16,
      avg: 14,
      sessionsPlanned: 2,
      sessionsHeld: 2
    };

    const masked = maskRowForPrivacy(smallRow);
    assert.equal(masked.isSuppressed, true);
    assert.equal(masked.eligible, 'Suppressed (small group)');
    assert.equal(masked.reported, 'Suppressed (small group)');
    assert.equal(masked.target, 'Suppressed (small group)');

    // Normal row remains intact
    const normalRow = {
      district: 'Valley District',
      block: 'Town Center',
      month: '2026-05',
      eligible: 150,
      reported: 120
    };
    const normalMasked = maskRowForPrivacy(normalRow);
    assert.equal(normalMasked.isSuppressed, false);
    assert.equal(normalMasked.eligible, 150);
  });

  test('calculatePrivacySafeTotals strictly excludes small groups from numeric totals', () => {
    const dataset = [
      { district: 'D1', block: 'B1', eligible: 100, reported: 90, target: 95 },
      { district: 'D1', block: 'B2', eligible: 25, reported: 20, target: 22 }, // SMALL GROUP (<30)
      { district: 'D1', block: 'B3', eligible: 200, reported: 180, target: 190 },
      { district: 'D1', block: 'B4', eligible: 15, reported: 12, target: 15 }  // SMALL GROUP (<30)
    ];

    const totals = calculatePrivacySafeTotals(dataset);
    assert.equal(totals.suppressedCount, 2);
    assert.equal(totals.activeCount, 2);
    // 100 + 200 = 300 (25 and 15 excluded!)
    assert.equal(totals.totalEligible, 300);
    // 90 + 180 = 270 (20 and 12 excluded!)
    assert.equal(totals.totalReported, 270);
    // 95 + 190 = 285 (22 and 15 excluded!)
    assert.equal(totals.totalTarget, 285);
  });

});
