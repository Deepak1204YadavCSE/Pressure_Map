/**
 * test/suggestTarget.test.js
 * 
 * Unit tests for logic/suggestTarget.js
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { suggestTargetRange } = require('../logic/suggestTarget.js');

describe('Suggested Fair Target Logic (logic/suggestTarget.js)', () => {

  test('Valid row returns rounded low (avg) and high (90% of eligible)', () => {
    const row = { eligible: 100, avg: 72.4 };
    const res = suggestTargetRange(row);

    assert.equal(res.status, 'ok');
    assert.equal(res.low, 72);
    assert.equal(res.high, 90);
    assert.ok(res.explanation);
  });

  test('Rounds correctly for fractional values', () => {
    // 90% of 85 is 76.5 -> rounds to 77
    const row = { eligible: 85, avg: 69.8 };
    const res = suggestTargetRange(row);

    assert.equal(res.status, 'ok');
    assert.equal(res.low, 70);
    assert.equal(res.high, 77);
  });

  test('Returns Inconclusive when eligible is missing or zero', () => {
    const rowZero = { eligible: 0, avg: 50 };
    const resZero = suggestTargetRange(rowZero);
    assert.equal(resZero.status, 'inconclusive');
    assert.equal(resZero.low, null);
    assert.equal(resZero.high, null);
    assert.ok(resZero.explanation.toLowerCase().includes('inconclusive'));

    const rowMissing = { avg: 50 };
    const resMissing = suggestTargetRange(rowMissing);
    assert.equal(resMissing.status, 'inconclusive');
    assert.equal(resMissing.low, null);
    assert.equal(resMissing.high, null);
  });

  test('Returns Inconclusive when avg is missing or zero', () => {
    const rowZeroAvg = { eligible: 100, avg: 0 };
    const resZeroAvg = suggestTargetRange(rowZeroAvg);
    assert.equal(resZeroAvg.status, 'inconclusive');
    assert.equal(resZeroAvg.low, null);
    assert.equal(resZeroAvg.high, null);

    const rowMissingAvg = { eligible: 100 };
    const resMissingAvg = suggestTargetRange(rowMissingAvg);
    assert.equal(resMissingAvg.status, 'inconclusive');
    assert.equal(resMissingAvg.low, null);
    assert.equal(resMissingAvg.high, null);
  });

  test('Returns Inconclusive when low > high (historical average exceeds 90% eligible ceiling)', () => {
    // 90% of 60 = 54; avg = 58 -> low (58) > high (54)
    const row = { eligible: 60, avg: 58 };
    const res = suggestTargetRange(row);

    assert.equal(res.status, 'inconclusive');
    assert.equal(res.low, null);
    assert.equal(res.high, null);
    assert.ok(res.explanation.includes('Historical average (58) exceeds 90% of the eligible population ceiling (54)'));
  });

  test('Never produces NaN or Infinity', () => {
    const badCases = [
      { eligible: 'abc', avg: 'xyz' },
      { eligible: null, avg: undefined },
      { eligible: -10, avg: -5 },
      {},
      null,
      undefined
    ];

    for (const c of badCases) {
      const res = suggestTargetRange(c);
      const str = JSON.stringify(res);
      assert.ok(!str.includes('NaN'), `Must not produce NaN for input ${JSON.stringify(c)}`);
      assert.ok(!str.includes('Infinity'), `Must not produce Infinity for input ${JSON.stringify(c)}`);
      assert.equal(res.status, 'inconclusive');
      assert.equal(res.low, null);
      assert.equal(res.high, null);
    }
  });

});
