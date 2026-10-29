/**
 * test/mapStatus.test.js
 * 
 * Unit tests for logic/mapStatus.js
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { calculateBlockStatus } = require('../logic/mapStatus.js');

describe('Block Map Status Logic (logic/mapStatus.js)', () => {

  test('Worst-status selection: red (data error / impossible number) overrides amber and green', () => {
    const rows = [
      // Normal clean row (green)
      { district: 'D1', block: 'B1', month: '2026-05', eligible: 100, reported: 90, target: 95 },
      // Unfair target (amber)
      { district: 'D1', block: 'B1', month: '2026-04', eligible: 100, reported: 90, target: 120 },
      // Impossible number (red)
      { district: 'D1', block: 'B1', month: '2026-03', eligible: 100, reported: 140, target: 95 }
    ];

    const result = calculateBlockStatus(rows);
    assert.equal(result.status, 'red');
    assert.equal(result.color, 'red');
    assert.equal(result.symbol, '✕');
    assert.equal(result.label, 'Data Error');
    assert.ok(result.reason.includes('Reported service delivery exceeds the recorded eligible population'));
  });

  test('Worst-status selection: amber (needs review / unfair target) overrides green', () => {
    const rows = [
      // Clean row (green)
      { district: 'D1', block: 'B2', month: '2026-05', eligible: 100, reported: 85, target: 90 },
      // Spike row (amber)
      { district: 'D1', block: 'B2', month: '2026-04', eligible: 100, reported: 95, target: 90, avg: 50 }
    ];

    const result = calculateBlockStatus(rows);
    assert.equal(result.status, 'amber');
    assert.equal(result.color, 'amber');
    assert.equal(result.symbol, '!');
    assert.ok(result.reason.includes('Reported service count is') || result.reason.includes('Feasibility conflict'));
  });

  test('Worst-status selection: clean rows return green with symbol ✓', () => {
    const rows = [
      { district: 'D1', block: 'B3', month: '2026-05', eligible: 150, reported: 130, target: 140, avg: 125, sessionsPlanned: 8, sessionsHeld: 8 }
    ];

    const result = calculateBlockStatus(rows);
    assert.equal(result.status, 'green');
    assert.equal(result.color, 'green');
    assert.equal(result.symbol, '✓');
    assert.equal(result.label, 'OK');
  });

  test('Suppressed block (< 30 eligible) returns grey with symbol – and strictly NO numbers', () => {
    const rows = [
      { district: 'D1', block: 'Small Hamlet', month: '2026-05', eligible: 22, reported: 18, target: 20 }
    ];

    const result = calculateBlockStatus(rows);
    assert.equal(result.status, 'grey');
    assert.equal(result.color, 'grey');
    assert.equal(result.symbol, '–');
    assert.equal(result.label, 'Suppressed (small group)');
    assert.equal(result.reason, 'Suppressed (small group), values hidden');
    assert.equal(result.counts, null); // Strictly null, NO numbers!
    assert.equal(result.isSuppressed, true);

    // Verify string serialization contains no raw counts
    const jsonStr = JSON.stringify(result);
    assert.ok(!jsonStr.includes('"eligible":22'));
    assert.ok(!jsonStr.includes('"reported":18'));
  });

  test('Empty data returns empty/neutral status without errors or NaN', () => {
    const emptyResult = calculateBlockStatus([]);
    assert.equal(emptyResult.status, 'grey');
    assert.equal(emptyResult.color, 'grey');
    assert.equal(emptyResult.symbol, '–');
    assert.equal(emptyResult.counts, null);
    assert.equal(emptyResult.isSuppressed, false);

    const nullResult = calculateBlockStatus(null);
    assert.equal(nullResult.status, 'grey');
  });

  test('Calculations never produce NaN even with malformed or missing fields', () => {
    const messyRows = [
      { district: 'D1', block: 'B4', month: '2026-05', eligible: 'invalid', reported: null, target: undefined }
    ];

    const result = calculateBlockStatus(messyRows);
    const jsonStr = JSON.stringify(result);
    assert.ok(!jsonStr.includes('NaN'));
    assert.ok(!jsonStr.includes('Infinity'));
  });

});
