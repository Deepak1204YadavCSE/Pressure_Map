/**
 * logic/privacy.js
 * 
 * Privacy enforcement and small-group suppression for Pressure Map.
 * Core Principle: "Group totals only, no individual tracking. Protect the people in the system."
 */

// Allowlist of permitted fields in submitted reports and CSV uploads
const ALLOWED_FIELDS = new Set([
  'district',
  'block',
  'month',
  'indicator',
  'eligible',
  'reported',
  'target',
  'avg',
  'sessionsPlanned',
  'sessionsHeld',
  'problems'
]);

// Fixed problem checkbox values accepted by worker voice
const VALID_PROBLEMS = new Set([
  'Target is unrealistic',
  'Resources are short',
  'Population count looks wrong',
  'Severe weather or geography'
]);

// Substrings and patterns that indicate personal or worker identifiers
const FORBIDDEN_IDENTIFIER_PATTERN = /(name|worker|aadhaar|uid|phone|mobile|patient|beneficiary|address|national_id|ssn|contact)/i;

/**
 * Validates an incoming record against the allowlist and forbidden identifier patterns.
 * 
 * @param {object} record - Record to inspect
 * @returns {{ valid: boolean, error?: string }}
 */
function validatePrivacy(record) {
  if (!record || typeof record !== 'object') {
    return { valid: false, error: 'Invalid record payload.' };
  }

  for (const key of Object.keys(record)) {
    // Check key against forbidden identifier patterns
    if (FORBIDDEN_IDENTIFIER_PATTERN.test(key)) {
      return {
        valid: false,
        error: `Privacy violation: Disallowed field "${key}" detected. No worker IDs, names, or patient identifiers are allowed.`
      };
    }

    // Check key against allowlist
    if (!ALLOWED_FIELDS.has(key)) {
      return {
        valid: false,
        error: `Privacy violation: Field "${key}" is not on the permitted group-level reporting allowlist.`
      };
    }
  }

  return { valid: true };
}

/**
 * Checks whether a row meets the small-group privacy suppression threshold (< 30 eligible individuals).
 * 
 * @param {object} row - The data record
 * @returns {boolean}
 */
function isSmallGroup(row) {
  if (!row) return false;
  const eligibleVal = row.eligible;
  if (eligibleVal === undefined || eligibleVal === null || eligibleVal === '') {
    return false;
  }
  const eligible = Number(eligibleVal);
  // Suppress small groups with fewer than 30 eligible individuals
  return !Number.isNaN(eligible) && eligible > 0 && eligible < 30;
}

/**
 * Masks numeric fields in a row if it is a small group (< 30).
 * Required for UI tables, details panels, and CSV export.
 * 
 * @param {object} row - Raw data row
 * @returns {object} Privacy-safe masked copy of row
 */
function maskRowForPrivacy(row) {
  if (!row) return row;
  const copy = { ...row };

  if (isSmallGroup(row)) {
    const suppressionLabel = 'Suppressed (small group)';
    copy.isSuppressed = true;
    copy.eligible = suppressionLabel;
    copy.reported = suppressionLabel;
    copy.target = suppressionLabel;
    copy.avg = suppressionLabel;
    copy.sessionsPlanned = suppressionLabel;
    copy.sessionsHeld = suppressionLabel;
    copy.suppressionNotice = 'Values suppressed (< 30 eligible) to protect privacy of small demographic groups.';
  } else {
    copy.isSuppressed = false;
  }

  return copy;
}

/**
 * Masks findings for a small group to prevent reverse-engineering of cohort counts.
 * Returns empty array for small groups so no rule-specific findings or numbers are exposed.
 * 
 * @param {Array<object>} findings - Array of finding objects
 * @param {object} row - Associated raw row
 * @returns {Array<object>} Masked findings
 */
function maskFindingsForPrivacy(findings, row) {
  if (!findings || !Array.isArray(findings)) return [];
  if (isSmallGroup(row)) return []; // NO rule-specific findings, numbers, or percentages
  return findings;
}

/**
 * Calculates aggregate totals safely by strictly EXCLUDING small-group suppressed rows.
 * 
 * @param {Array<object>} rows - Array of raw data rows
 * @returns {object} Safe totals and suppression count
 */
function calculatePrivacySafeTotals(rows) {
  if (!Array.isArray(rows)) {
    return {
      totalEligible: 0,
      totalReported: 0,
      totalTarget: 0,
      suppressedCount: 0,
      activeCount: 0,
      notice: 'Totals exclude small groups (< 30 eligible) to preserve group privacy.'
    };
  }

  let totalEligible = 0;
  let totalReported = 0;
  let totalTarget = 0;
  let suppressedCount = 0;
  let activeCount = 0;

  for (const row of rows) {
    if (isSmallGroup(row)) {
      suppressedCount++;
      continue; // Strictly omit from numerical totals!
    }

    const eligible = Number(row.eligible);
    if (!Number.isNaN(eligible) && eligible > 0) {
      activeCount++;
      totalEligible += eligible;
      totalReported += Number(row.reported) || 0;
      totalTarget += Number(row.target) || 0;
    }
  }

  return {
    totalEligible,
    totalReported,
    totalTarget,
    suppressedCount,
    activeCount,
    totalRows: rows.length,
    notice: 'Totals exclude small groups (< 30 eligible) to preserve group privacy.'
  };
}

module.exports = {
  ALLOWED_FIELDS,
  VALID_PROBLEMS,
  validatePrivacy,
  isSmallGroup,
  maskRowForPrivacy,
  maskFindingsForPrivacy,
  calculatePrivacySafeTotals
};
