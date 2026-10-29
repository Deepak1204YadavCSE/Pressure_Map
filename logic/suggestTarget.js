/**
 * logic/suggestTarget.js
 * 
 * Pure function for calculating suggested fair target ranges.
 * Core Principle: "Find Unfair Targets, Not Faulty Workers."
 * 
 * Rules:
 * - low = historical average (rounded)
 * - high = 90% of eligible population (rounded)
 * - If avg or eligible is missing/zero or low > high, return Inconclusive with a reason.
 * - Never produce NaN or Infinity.
 */

/**
 * Suggests a fair target range for a given health reporting record.
 * 
 * @param {object} row - Reporting record with eligible and avg
 * @returns {{ low: number|null, high: number|null, status: string, explanation: string }}
 */
function suggestTargetRange(row) {
  if (!row || typeof row !== 'object') {
    return {
      low: null,
      high: null,
      status: 'inconclusive',
      explanation: 'Inconclusive: Invalid reporting record.'
    };
  }

  const eligibleRaw = row.eligible;
  const avgRaw = row.avg;

  // Validate presence and numbers
  if (eligibleRaw === undefined || eligibleRaw === null || eligibleRaw === '' ||
      avgRaw === undefined || avgRaw === null || avgRaw === '') {
    return {
      low: null,
      high: null,
      status: 'inconclusive',
      explanation: 'Inconclusive: Baseline figures missing. Both historical average and eligible population are required.'
    };
  }

  const eligible = Number(eligibleRaw);
  const avg = Number(avgRaw);

  if (Number.isNaN(eligible) || Number.isNaN(avg)) {
    return {
      low: null,
      high: null,
      status: 'inconclusive',
      explanation: 'Inconclusive: Non-numeric baseline values provided.'
    };
  }

  // Must be positive numbers (> 0)
  if (eligible <= 0 || avg <= 0) {
    return {
      low: null,
      high: null,
      status: 'inconclusive',
      explanation: 'Inconclusive: Eligible population and historical average must both be greater than zero.'
    };
  }

  const low = Math.round(avg);
  const high = Math.round(0.9 * eligible);

  // If historical average already exceeds 90% of the eligible population
  if (low > high) {
    return {
      low: null,
      high: null,
      status: 'inconclusive',
      explanation: `Inconclusive: Historical average (${low}) exceeds 90% of the eligible population ceiling (${high}). Denominator survey and facility catchment review recommended.`
    };
  }

  return {
    low,
    high,
    status: 'ok',
    explanation: 'Suggested fair range between historical baseline output and 90% demographic ceiling.'
  };
}

module.exports = {
  suggestTargetRange
};
