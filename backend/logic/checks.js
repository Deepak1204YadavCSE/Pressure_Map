/**
 * logic/checks.js
 * 
 * Pure functions for Pressure Map health reporting checks.
 * Core Principle: "Find Unfair Targets, Not Faulty Workers."
 * All messages blame the system, target methodology, or denominator data,
 * NEVER the frontline health worker. Words like "fraud", "cheating", or 
 * "faulty worker" are strictly prohibited.
 */

/**
 * Validates whether the row has correct types, valid month, and non-negative numbers.
 * Never silently turns missing values into 0.
 * 
 * @param {object} row - The reporting record.
 * @returns {object|null} - Finding object if malformed, or null if valid.
 */
function validateRowFormat(row) {
  if (!row || typeof row !== 'object') {
    return {
      id: `MALFORMED_${Date.now()}`,
      rule: 'MALFORMED_DATA',
      district: 'Unknown',
      block: 'Unknown',
      month: 'Unknown',
      severity: 'error',
      observed: 'Invalid row object',
      reference: 'Valid JSON record expected',
      explanation: 'System data ingestion error: The supplied record is not a valid object.',
      alternativeExplanations: ['File format corruption during transmission', 'Incomplete data upload batch'],
      recommendedAction: 'Verify data formatting and resubmit clean record.'
    };
  }

  const district = (row.district && String(row.district).trim()) || 'Unknown';
  const block = (row.block && String(row.block).trim()) || 'Unknown';
  const month = (row.month && String(row.month).trim()) || 'Unknown';

  // Check month format YYYY-MM
  const monthRegex = /^\d{4}-(0[1-9]|1[0-2])$/;
  if (!monthRegex.test(month)) {
    return {
      id: `MALFORMED_MONTH_${district}_${block}_${month}`,
      rule: 'MALFORMED_DATA',
      district,
      block,
      month,
      severity: 'error',
      observed: `Month: "${month}"`,
      reference: 'Format YYYY-MM (e.g., 2026-05)',
      explanation: 'System data format error: The reporting period does not match the standard YYYY-MM calendar format.',
      alternativeExplanations: ['Spreadsheet auto-formatted date as text', 'Regional calendar variation in export'],
      recommendedAction: 'Standardize the date format in the submission source.'
    };
  }

  // Validate non-numeric or negative values for numeric fields
  const numericFields = ['reported', 'target', 'avg', 'sessionsPlanned', 'sessionsHeld'];
  for (const field of numericFields) {
    if (row[field] !== undefined && row[field] !== null && row[field] !== '') {
      const num = Number(row[field]);
      if (Number.isNaN(num) || typeof row[field] === 'boolean') {
        return {
          id: `MALFORMED_NUMERIC_${district}_${block}_${field}`,
          rule: 'MALFORMED_DATA',
          district,
          block,
          month,
          severity: 'error',
          observed: `${field}: "${row[field]}"`,
          reference: 'Valid non-negative integer or number',
          explanation: `System data type error: Field "${field}" contains a non-numeric value.`,
          alternativeExplanations: ['Text entry in a numeric cell', 'Corrupted file column mapping'],
          recommendedAction: 'Check cell data types in source file and correct non-numeric values.'
        };
      }
      if (num < 0) {
        return {
          id: `MALFORMED_NEGATIVE_${district}_${block}_${field}`,
          rule: 'MALFORMED_DATA',
          district,
          block,
          month,
          severity: 'error',
          observed: `${field}: ${num}`,
          reference: 'Values must be >= 0',
          explanation: `System data constraint violation: Field "${field}" contains a negative value, which is physically impossible.`,
          alternativeExplanations: ['Negative adjustment entry entered directly', 'Accounting ledger notation mismatch'],
          recommendedAction: 'Correct the source entry to reflect actual positive volume or explicit cancellation notes.'
        };
      }
    }
  }

  return null;
}

/**
 * Checks a single reporting row and returns an array of findings.
 * Never produces NaN or Infinity.
 * 
 * @param {object} row - Reporting record
 * @param {object} [options] - Optional configurations (e.g. spikeThreshold)
 * @returns {Array<object>} Array of findings (empty if row is normal)
 */
function checkRow(row, options = {}) {
  const findings = [];
  const spikeThreshold = typeof options.spikeThreshold === 'number' ? options.spikeThreshold : 0.5;

  // 1. Format & Schema Validation
  const formatError = validateRowFormat(row);
  if (formatError) {
    findings.push(formatError);
    return findings; // Stop further math on invalid schema
  }

  const district = String(row.district).trim();
  const block = String(row.block).trim();
  const month = String(row.month).trim();
  const indicator = row.indicator ? String(row.indicator).trim() : 'Health Indicator';

  // Parse numeric values safely without silently converting missing to 0 where prohibited
  const eligibleRaw = row.eligible;
  const isEligibleMissing = eligibleRaw === undefined || eligibleRaw === null || eligibleRaw === '' || Number.isNaN(Number(eligibleRaw));
  const eligible = isEligibleMissing ? null : Number(eligibleRaw);

  // Check 1: Inconclusive if eligible is missing, 0, or negative
  if (isEligibleMissing || eligible <= 0) {
    findings.push({
      id: `INCONCLUSIVE_${district}_${block}_${month}`,
      rule: 'INCONCLUSIVE',
      district,
      block,
      month,
      severity: 'inconclusive',
      observed: isEligibleMissing ? 'Eligible: Missing' : `Eligible: ${eligible}`,
      reference: 'Eligible population > 0 required for coverage denominator',
      explanation: 'Eligible count missing or zero. Feasibility and coverage rates cannot be calculated without a valid demographic baseline.',
      alternativeExplanations: [
        'Denominator census survey pending for this catchment area',
        'Newly established administrative boundary without published population data',
        'Reporting group inactive or merged into adjacent health post'
      ],
      recommendedAction: 'Update local denominator census records before setting operational quotas.'
    });

    // When eligible is missing or 0, we cannot evaluate IMPOSSIBLE_NUMBER or UNFAIR_TARGET
    // to prevent division by zero, NaN, or Infinity.
    return findings;
  }

  const reported = (row.reported !== undefined && row.reported !== null && row.reported !== '') ? Number(row.reported) : 0;
  const target = (row.target !== undefined && row.target !== null && row.target !== '') ? Number(row.target) : 0;
  const avg = (row.avg !== undefined && row.avg !== null && row.avg !== '') ? Number(row.avg) : 0;
  const sessionsPlanned = (row.sessionsPlanned !== undefined && row.sessionsPlanned !== null && row.sessionsPlanned !== '') ? Number(row.sessionsPlanned) : null;
  const sessionsHeld = (row.sessionsHeld !== undefined && row.sessionsHeld !== null && row.sessionsHeld !== '') ? Number(row.sessionsHeld) : null;

  // Check 2: IMPOSSIBLE_NUMBER (reported > eligible)
  if (reported > eligible) {
    const excess = reported - eligible;
    findings.push({
      id: `IMPOSSIBLE_NUMBER_${district}_${block}_${month}`,
      rule: 'IMPOSSIBLE_NUMBER',
      district,
      block,
      month,
      severity: 'review',
      observed: `Reported: ${reported}`,
      reference: `Eligible: ${eligible} (Over-reported by +${excess})`,
      explanation: 'System definition mismatch: Reported service delivery exceeds the recorded eligible population for this catchment area.',
      alternativeExplanations: [
        'Beneficiaries from neighbouring villages or mobile populations crossed catchment boundaries for care',
        'Outdated census denominator undercounting actual resident population',
        'Repeat booster doses or catch-up doses counted within primary series tally'
      ],
      recommendedAction: 'Verify population count and definitions (cohort, dose, period).'
    });
  }

  // Check 3: UNFAIR_TARGET (target > eligible)
  if (target > eligible) {
    const gap = target - eligible;
    findings.push({
      id: `UNFAIR_TARGET_${district}_${block}_${month}`,
      rule: 'UNFAIR_TARGET',
      district,
      block,
      month,
      severity: 'feasibility',
      observed: `Target: ${target}`,
      reference: `Eligible: ${eligible} (Target exceeds eligible cohort by +${gap})`,
      explanation: 'Feasibility conflict: Top-down system target exceeds the total eligible cohort, setting an unachievable quota that pressures health teams.',
      alternativeExplanations: [
        'Target was calculated from obsolete population projections rather than local micro-plan tallies',
        'Target was allocated without adjusting for population migration or recent boundary redistricting'
      ],
      recommendedAction: 'Review and revise the target.'
    });
  }

  // Check 4: SPIKE (reported exceeds historical average by more than spikeThreshold, only when avg > 0)
  if (avg > 0) {
    const increaseRatio = (reported - avg) / avg;
    if (increaseRatio > spikeThreshold) {
      const pctFormatted = Math.round(increaseRatio * 100);
      findings.push({
        id: `SPIKE_${district}_${block}_${month}`,
        rule: 'SPIKE',
        district,
        block,
        month,
        severity: 'review',
        observed: `Reported: ${reported}`,
        reference: `Historical Average: ${avg} (+${pctFormatted}% change)`,
        explanation: `Volume anomaly: Reported service count is ${pctFormatted}% higher than the 3-month baseline average.`,
        alternativeExplanations: [
          'A special catch-up drive, intensified immunization week, or mobile health camp occurred',
          'Previous stock-out was resolved, creating a concentrated batch of delayed vaccinations',
          'Seasonal influx of seasonal agricultural workers or festival gathering',
          'Data entry transposition or clerical tally accumulation'
        ],
        recommendedAction: 'Check for a campaign, catch-up drive or data entry error.'
      });
    }
  }

  // Check 5: SESSION_MISMATCH (sessionsHeld much lower than sessionsPlanned while reported count is high)
  if (sessionsPlanned !== null && sessionsHeld !== null && sessionsPlanned > 0) {
    // If sessions held is less than 50% of planned, but reported delivery is substantial (>= 70% of target or eligible)
    const benchmark = target > 0 ? target : eligible;
    const sessionCompletionRate = sessionsHeld / sessionsPlanned;
    if (sessionCompletionRate < 0.5 && reported >= benchmark * 0.7 && reported > 0) {
      const heldPct = Math.round(sessionCompletionRate * 100);
      findings.push({
        id: `SESSION_MISMATCH_${district}_${block}_${month}`,
        rule: 'SESSION_MISMATCH',
        district,
        block,
        month,
        severity: 'review',
        observed: `Sessions Held: ${sessionsHeld} of ${sessionsPlanned} planned (${heldPct}%)`,
        reference: `Reported Volume: ${reported}`,
        explanation: 'Contextual divergence: High service delivery numbers reported despite less than half of scheduled outreach sessions being recorded as completed.',
        alternativeExplanations: [
          'Multiple smaller sessions were consolidated into high-turnout central community camps',
          'Health facility fixed-site delivery absorbed the load when field sessions were rained out',
          'Session completion registers were logged on a delayed cycle while vaccine tally was immediate'
        ],
        recommendedAction: 'Verify session log records and community outreach coverage.'
      });
    }
  }

  return findings;
}

/**
 * Summarizes the overall status of a row based on its findings.
 * 
 * @param {Array<object>} findings - Output from checkRow
 * @returns {object} Status metadata { status, label, badgeClass }
 */
function getRowStatus(findings) {
  if (!findings || findings.length === 0) {
    return {
      status: 'ok',
      label: 'Within eligible population',
      badgeClass: 'status-ok',
      icon: '✓'
    };
  }

  // Priority 1: Data error (schema error or impossible number where reported > eligible)
  if (findings.some(f => f.severity === 'error' || f.rule === 'MALFORMED_DATA' || f.rule === 'IMPOSSIBLE_NUMBER')) {
    return {
      status: 'error',
      label: 'Data Error',
      badgeClass: 'status-error',
      icon: '✕'
    };
  }

  // Priority 2: Unfair target / feasibility issue
  if (findings.some(f => f.rule === 'UNFAIR_TARGET')) {
    return {
      status: 'feasibility',
      label: 'Unfair Target',
      badgeClass: 'status-feasibility',
      icon: '▲'
    };
  }

  // Priority 3: Review needed (impossible number, spike, session mismatch)
  if (findings.some(f => f.severity === 'review')) {
    return {
      status: 'review',
      label: 'Needs Review',
      badgeClass: 'status-review',
      icon: '!'
    };
  }

  // Priority 4: Inconclusive
  if (findings.some(f => f.severity === 'inconclusive')) {
    return {
      status: 'inconclusive',
      label: 'Inconclusive',
      badgeClass: 'status-inconclusive',
      icon: '?'
    };
  }

  return {
    status: 'ok',
    label: 'Within eligible population',
    badgeClass: 'status-ok',
    icon: '✓'
  };
}

module.exports = {
  checkRow,
  validateRowFormat,
  getRowStatus
};
