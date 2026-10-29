/**
 * logic/mapStatus.js
 * 
 * Pure functions for calculating block-level status for the Pressure Map.
 * Core Principle: "Find Unfair Targets, Not Faulty Workers."
 * Worst status among findings:
 *   red   = data error / impossible number
 *   amber = needs review (spike, session mismatch) or unfair target
 *   green = no issues (OK)
 *   grey  = inconclusive or suppressed
 */

const { checkRow } = require('./checks.js');
const { isSmallGroup } = require('./privacy.js');

/**
 * Priority rank for status (higher number = worse status)
 * red (4) > amber (3) > grey/inconclusive (2) > green/ok (1)
 */
const STATUS_RANK = {
  red: 4,
  amber: 3,
  grey: 2,
  green: 1
};

/**
 * Calculates the aggregate map status for a single block across its rows.
 * 
 * @param {Array<object>} rows - Array of raw rows for this block
 * @param {object} [options] - Optional configurations
 * @returns {object} { status, color, symbol, label, reason, counts, isSuppressed }
 */
function calculateBlockStatus(rows, options = {}) {
  // Edge case: Empty data
  if (!Array.isArray(rows) || rows.length === 0) {
    return {
      status: 'grey',
      color: 'grey',
      symbol: '–',
      label: 'No Data',
      reason: 'No reporting records found for selected period.',
      counts: null,
      isSuppressed: false
    };
  }

  // Check if any row in the block is small-group suppressed (< 30 eligible)
  const hasSuppression = rows.some(r => isSmallGroup(r) || r.isSuppressed);
  if (hasSuppression) {
    return {
      status: 'grey',
      color: 'grey',
      symbol: '–',
      label: 'Suppressed (small group)',
      reason: 'Suppressed (small group), values hidden',
      counts: null, // Strictly NO numbers in popup or tooltip!
      isSuppressed: true
    };
  }

  // Evaluate findings across all visible rows for this block
  let worstColor = 'green';
  let worstSymbol = '✓';
  let worstLabel = 'OK';
  let primaryReason = 'Target aligned with demographic cohort; no systemic bottlenecks identified.';

  let totalEligible = 0;
  let totalReported = 0;
  let totalTarget = 0;
  const reasonList = [];

  for (const row of rows) {
    const findings = checkRow(row);

    const eligible = Number(row.eligible) || 0;
    const reported = Number(row.reported) || 0;
    const target = Number(row.target) || 0;

    totalEligible += eligible;
    totalReported += reported;
    totalTarget += target;

    for (const f of findings) {
      if (f.rule === 'IMPOSSIBLE_NUMBER' || f.rule === 'MALFORMED_DATA' || f.severity === 'error') {
        // RED: Data error
        if (STATUS_RANK['red'] > STATUS_RANK[worstColor]) {
          worstColor = 'red';
          worstSymbol = '✕';
          worstLabel = 'Data Error';
          primaryReason = f.explanation;
        }
        reasonList.push(f.explanation);
      } else if (f.rule === 'UNFAIR_TARGET' || f.severity === 'feasibility') {
        // AMBER: Unfair target / feasibility
        if (STATUS_RANK['amber'] > STATUS_RANK[worstColor]) {
          worstColor = 'amber';
          worstSymbol = '!';
          worstLabel = 'Unfair Target';
          primaryReason = f.explanation;
        }
        reasonList.push(f.explanation);
      } else if (f.severity === 'review' || f.rule === 'SPIKE' || f.rule === 'SESSION_MISMATCH') {
        // AMBER: Needs review
        if (STATUS_RANK['amber'] > STATUS_RANK[worstColor]) {
          worstColor = 'amber';
          worstSymbol = '!';
          worstLabel = 'Needs Review';
          primaryReason = f.explanation;
        }
        reasonList.push(f.explanation);
      } else if (f.severity === 'inconclusive' || f.rule === 'INCONCLUSIVE') {
        // GREY: Inconclusive
        if (STATUS_RANK['grey'] > STATUS_RANK[worstColor]) {
          worstColor = 'grey';
          worstSymbol = '–';
          worstLabel = 'Inconclusive';
          primaryReason = f.explanation;
        }
        reasonList.push(f.explanation);
      }
    }
  }

  // Guarantee never NaN
  if (Number.isNaN(totalEligible)) totalEligible = 0;
  if (Number.isNaN(totalReported)) totalReported = 0;
  if (Number.isNaN(totalTarget)) totalTarget = 0;

  return {
    status: worstColor,
    color: worstColor,
    symbol: worstSymbol,
    label: worstLabel,
    reason: primaryReason,
    allReasons: reasonList.length > 0 ? reasonList : [primaryReason],
    counts: {
      eligible: totalEligible,
      reported: totalReported,
      target: totalTarget
    },
    isSuppressed: false
  };
}

module.exports = {
  calculateBlockStatus,
  STATUS_RANK
};
