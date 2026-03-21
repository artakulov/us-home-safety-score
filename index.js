'use strict';

/**
 * us-home-safety-score
 *
 * Compute residential Home Safety Scores (0-100, A-F) from federal data sources.
 * The composite score combines up to 4 components: water quality violations,
 * lead/copper levels, EPA radon zones, and FEMA flood claims.
 *
 * Higher score = safer. Grade thresholds: A >= 85, B >= 70, C >= 55, D >= 40, F < 40.
 *
 * @see https://zipcheckup.com/about/home-safety-score/
 * @license MIT
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Resolved violations are decayed to this fraction of an active violation.
 * A system that had issues but returned to compliance still carries some risk,
 * but far less than an active violator.
 */
const RESOLVED_DECAY = 0.25;

/**
 * Grade thresholds (lower bound, inclusive).
 * @type {Array<[number, string]>}
 */
const GRADE_THRESHOLDS = [
  [85, 'A'],
  [70, 'B'],
  [55, 'C'],
  [40, 'D'],
  [0,  'F'],
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Convert a numeric score (0-100) to a letter grade.
 *
 * | Range   | Grade |
 * |---------|-------|
 * | 85-100  | A     |
 * | 70-84   | B     |
 * | 55-69   | C     |
 * | 40-54   | D     |
 * | 0-39    | F     |
 *
 * @param {number} score - Integer 0-100.
 * @returns {string} One of 'A', 'B', 'C', 'D', 'F'.
 */
function scoreToGrade(score) {
  for (const [threshold, grade] of GRADE_THRESHOLDS) {
    if (score >= threshold) return grade;
  }
  return 'F';
}

/**
 * Clamp a value between min and max.
 * @param {number} val
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

// ---------------------------------------------------------------------------
// Component scorers
// ---------------------------------------------------------------------------

/**
 * Compute the water quality component score.
 *
 * Evaluates EPA SDWIS violation history over the past 5 years.
 * Health-based violations (MCL, treatment technique) weigh more heavily
 * than monitoring/reporting violations.
 *
 * Resolved violations are decayed by `RESOLVED_DECAY` (0.25x) to reflect
 * that the system identified and fixed the issue, while still penalizing
 * historical infrastructure risk.
 *
 * @param {object} data
 * @param {number} data.totalViolations       - Total violations in past 5 years.
 * @param {number} data.healthViolations      - Health-based violations in past 5 years.
 * @param {number} [data.resolvedViolations=0]      - Resolved (returned to compliance) violations.
 * @param {number} [data.resolvedHealthViolations=0] - Resolved health-based violations.
 * @param {number} maxPoints - Maximum points for this component (25 or 33).
 * @returns {number} Score from 0 to maxPoints.
 */
function waterQualityScore(data, maxPoints) {
  const totalViolations = data.totalViolations || 0;
  const healthViolations = data.healthViolations || 0;
  const resolvedViolations = data.resolvedViolations || 0;
  const resolvedHealthViolations = data.resolvedHealthViolations || 0;

  // Effective counts: active at 1.0x + resolved at RESOLVED_DECAY
  const activeTotal = totalViolations - resolvedViolations;
  const activeHealth = healthViolations - resolvedHealthViolations;
  const effectiveTotal = activeTotal + resolvedViolations * RESOLVED_DECAY;
  const effectiveHealth = activeHealth + resolvedHealthViolations * RESOLVED_DECAY;

  if (effectiveHealth > 0) {
    const penalty = maxPoints === 25 ? 4 : 5;
    return clamp(maxPoints - effectiveHealth * penalty, 0, maxPoints);
  }

  if (effectiveTotal > 0) {
    const floor = Math.round(maxPoints * 0.45);
    return Math.max(floor, maxPoints - effectiveTotal * 2);
  }

  return maxPoints;
}

/**
 * Compute the lead/copper risk component score.
 *
 * Uses the 90th-percentile lead level from EPA Lead and Copper Rule (LCR)
 * sampling data. The EPA action level is 0.015 mg/L (15 ppb).
 *
 * - Below 0.005 mg/L (5 ppb): full points (very low risk).
 * - Between 0.005 and 0.015: linear interpolation.
 * - Above 0.015 (action level exceeded): 0 points.
 * - No data: 2/3 of max points (neutral assumption).
 *
 * @param {object} data
 * @param {number|null} data.leadLevel - 90th-percentile lead level in mg/L, or null.
 * @param {number} maxPoints - Maximum points for this component (25 or 33).
 * @returns {number} Score from 0 to maxPoints.
 */
function leadRiskScore(data, maxPoints) {
  const leadLevel = data.leadLevel;

  if (leadLevel === null || leadLevel === undefined) {
    // No data — neutral assumption
    return Math.round(maxPoints * 2 / 3);
  }

  if (leadLevel > 0.015) return 0;
  if (leadLevel <= 0.005) return maxPoints;

  // Linear interpolation between 0.005 and 0.015
  return Math.round(maxPoints * (1 - (leadLevel - 0.005) / 0.010));
}

/**
 * Compute the radon risk component score.
 *
 * Based on EPA radon zone classification at the county level:
 * - Zone 1 (High, predicted avg >= 4 pCi/L): 0 points.
 * - Zone 2 (Moderate, predicted avg 2-4 pCi/L): ~52% of max points.
 * - Zone 3 (Low, predicted avg < 2 pCi/L): full points.
 * - No data: 2/3 of max points (neutral assumption).
 *
 * @param {object} data
 * @param {number|null} data.radonZone - EPA radon zone (1, 2, or 3), or null.
 * @param {number} maxPoints - Maximum points for this component (25 or 33).
 * @returns {number} Score from 0 to maxPoints.
 */
function radonRiskScore(data, maxPoints) {
  const zone = data.radonZone;

  if (zone === 3) return maxPoints;
  if (zone === 2) return Math.round(maxPoints * 0.52);
  if (zone === 1) return 0;

  // No data — neutral
  return Math.round(maxPoints * 2 / 3);
}

/**
 * Compute the flood risk component score.
 *
 * Based on FEMA National Flood Insurance Program (NFIP) historical claims
 * count for the ZIP code. More claims indicate higher flood exposure.
 *
 * | Claims     | Points (out of 25) |
 * |------------|-------------------|
 * | 0          | 25                |
 * | 1-10       | 20                |
 * | 11-50      | 15                |
 * | 51-200     | 10                |
 * | 201-1000   | 5                 |
 * | > 1000     | 0                 |
 *
 * Returns `null` when no FEMA data is available, which triggers the
 * 3-component fallback in the composite score.
 *
 * @param {object} data
 * @param {number|null} data.floodClaims - FEMA NFIP claims count, or null.
 * @returns {number|null} Score 0-25, or null if no data.
 */
function floodRiskScore(data) {
  const claims = data.floodClaims;

  if (claims === null || claims === undefined) return null;
  if (claims === 0)    return 25;
  if (claims <= 10)    return 20;
  if (claims <= 50)    return 15;
  if (claims <= 200)   return 10;
  if (claims <= 1000)  return 5;
  return 0;
}

// ---------------------------------------------------------------------------
// Composite score
// ---------------------------------------------------------------------------

/**
 * Compute the composite Home Safety Score.
 *
 * Combines 3 or 4 components into a single 0-100 score with a letter grade.
 *
 * **4-component mode** (when FEMA flood data is available):
 * Each component contributes up to 25 points (25% weight):
 * - Water quality (EPA SDWIS violations)
 * - Lead/copper risk (EPA LCR sampling)
 * - Radon risk (EPA radon zones)
 * - Flood risk (FEMA NFIP claims)
 *
 * **3-component fallback** (when no FEMA data):
 * Each component contributes up to 33 points (~33% weight):
 * - Water quality, lead/copper risk, radon risk
 *
 * @param {object} data - Input data object.
 * @param {number}      data.totalViolations             - Total SDWIS violations (past 5 years).
 * @param {number}      data.healthViolations            - Health-based violations (past 5 years).
 * @param {number}      [data.resolvedViolations=0]      - Resolved total violations.
 * @param {number}      [data.resolvedHealthViolations=0] - Resolved health violations.
 * @param {number|null} [data.leadLevel=null]            - 90th-percentile lead level (mg/L).
 * @param {number|null} [data.radonZone=null]            - EPA radon zone (1, 2, or 3).
 * @param {number|null} [data.floodClaims=null]          - FEMA NFIP historical claims count.
 * @returns {HomeSafetyResult} Score result with grade and component breakdown.
 */
function computeSafetyScore(data) {
  if (!data || typeof data !== 'object') {
    throw new TypeError('computeSafetyScore requires a data object');
  }

  const flood = floodRiskScore(data);
  const hasFlood = flood !== null;
  const maxPer = hasFlood ? 25 : 33;

  const water = waterQualityScore(data, maxPer);
  const lead  = leadRiskScore(data, maxPer);
  const radon = radonRiskScore(data, maxPer);

  const total = Math.round(water + lead + radon + (hasFlood ? flood : 0));
  const score = clamp(total, 0, 100);
  const grade = scoreToGrade(score);

  const result = {
    score,
    grade,
    components: {
      water:  { score: water, maxPoints: maxPer, weight: hasFlood ? 0.25 : 0.33 },
      lead:   { score: lead,  maxPoints: maxPer, weight: hasFlood ? 0.25 : 0.33 },
      radon:  { score: radon, maxPoints: maxPer, weight: hasFlood ? 0.25 : 0.33 },
    },
    componentCount: hasFlood ? 4 : 3,
  };

  if (hasFlood) {
    result.components.flood = { score: flood, maxPoints: 25, weight: 0.25 };
  }

  return result;
}

// ---------------------------------------------------------------------------
// Convenience functions
// ---------------------------------------------------------------------------

/**
 * Compute lead exposure risk probability.
 *
 * Returns a risk level string and probability estimate based on the
 * 90th-percentile lead level from LCR sampling.
 *
 * @param {object} data
 * @param {number|null} data.leadLevel - 90th-percentile lead in mg/L.
 * @returns {{ risk: string, probability: number, exceedsActionLevel: boolean, description: string }}
 */
function computeLeadRisk(data) {
  const level = (data && data.leadLevel) || null;

  if (level === null || level === undefined) {
    return {
      risk: 'unknown',
      probability: null,
      exceedsActionLevel: false,
      description: 'No lead sampling data available for this location.',
    };
  }

  const exceedsActionLevel = level > 0.015;

  if (level <= 0.001) {
    return {
      risk: 'very-low',
      probability: 0.02,
      exceedsActionLevel,
      description: 'Lead level is well below detectable limits. Very low exposure risk.',
    };
  }

  if (level <= 0.005) {
    return {
      risk: 'low',
      probability: 0.10,
      exceedsActionLevel,
      description: 'Lead level is below half the EPA action level. Low exposure risk.',
    };
  }

  if (level <= 0.010) {
    return {
      risk: 'moderate',
      probability: 0.30,
      exceedsActionLevel,
      description: 'Lead level is approaching the EPA action level. Consider testing your home.',
    };
  }

  if (level <= 0.015) {
    return {
      risk: 'elevated',
      probability: 0.55,
      exceedsActionLevel,
      description: 'Lead level is near the EPA action level of 15 ppb. Home testing recommended.',
    };
  }

  return {
    risk: 'high',
    probability: 0.85,
    exceedsActionLevel,
    description: 'Lead level exceeds the EPA action level (15 ppb). Immediate home testing strongly recommended.',
  };
}

/**
 * Compute estimated annual flood cost based on FEMA NFIP claims data.
 *
 * @param {object} data
 * @param {number|null} data.floodClaims     - Historical NFIP claims count.
 * @param {number|null} [data.floodAvgPaid]  - Average NFIP payment in dollars.
 * @returns {{ risk: string, estimatedAnnualCost: number|null, claims: number|null, description: string }}
 */
function computeFloodRisk(data) {
  const claims = (data && data.floodClaims != null) ? data.floodClaims : null;
  const avgPaid = (data && data.floodAvgPaid != null) ? data.floodAvgPaid : null;

  if (claims === null || claims === undefined) {
    return {
      risk: 'unknown',
      estimatedAnnualCost: null,
      claims: null,
      description: 'No FEMA flood insurance data available for this ZIP code.',
    };
  }

  const annualCost = (avgPaid !== null && claims > 0)
    ? Math.round(avgPaid * claims / 30)  // rough annualized over ~30 years of NFIP data
    : null;

  if (claims === 0) {
    return { risk: 'very-low', estimatedAnnualCost: 0, claims, description: 'No historical flood insurance claims.' };
  }
  if (claims <= 10) {
    return { risk: 'low', estimatedAnnualCost: annualCost, claims, description: 'Minimal flood claim history.' };
  }
  if (claims <= 50) {
    return { risk: 'moderate', estimatedAnnualCost: annualCost, claims, description: 'Some flood claim history. Consider flood insurance.' };
  }
  if (claims <= 200) {
    return { risk: 'elevated', estimatedAnnualCost: annualCost, claims, description: 'Significant flood claim history. Flood insurance recommended.' };
  }
  if (claims <= 1000) {
    return { risk: 'high', estimatedAnnualCost: annualCost, claims, description: 'High flood claim history. Flood insurance strongly recommended.' };
  }

  return {
    risk: 'severe',
    estimatedAnnualCost: annualCost,
    claims,
    description: 'Extremely high flood claim history. This area has severe flood exposure.',
  };
}

/**
 * Compute compliance risk based on violation history.
 *
 * Evaluates the water system's regulatory compliance track record
 * using EPA SDWIS data.
 *
 * @param {object} data
 * @param {number} data.totalViolations              - Total violations.
 * @param {number} data.healthViolations             - Health-based violations.
 * @param {number} [data.resolvedViolations=0]       - Resolved violations.
 * @param {number} [data.unresolvedViolations=0]     - Currently unresolved violations.
 * @returns {{ risk: string, score: number, unresolved: number, description: string }}
 */
function computeComplianceRisk(data) {
  const total = (data && data.totalViolations) || 0;
  const health = (data && data.healthViolations) || 0;
  const resolved = (data && data.resolvedViolations) || 0;
  const unresolved = (data && data.unresolvedViolations) || 0;

  // Score 0-100, higher = better compliance
  let score = 100;

  // Penalize health violations heavily
  score -= health * 12;

  // Penalize other violations
  score -= (total - health) * 3;

  // Bonus for resolved violations (partial credit back)
  score += resolved * 2;

  // Extra penalty for unresolved
  score -= unresolved * 15;

  score = clamp(Math.round(score), 0, 100);

  let risk, description;

  if (score >= 90) {
    risk = 'excellent';
    description = 'Excellent compliance record. No or minimal violations.';
  } else if (score >= 70) {
    risk = 'good';
    description = 'Good compliance with minor violations that have been addressed.';
  } else if (score >= 50) {
    risk = 'moderate';
    description = 'Moderate compliance concerns. Some health-based violations in history.';
  } else if (score >= 30) {
    risk = 'poor';
    description = 'Poor compliance record. Multiple health-based violations detected.';
  } else {
    risk = 'critical';
    description = 'Critical compliance failures. Significant ongoing violations.';
  }

  return { risk, score, unresolved, description };
}

/**
 * Compute energy burden as a percentage of income.
 *
 * Energy burden = annual energy cost / household income * 100.
 * The DOE defines "high" energy burden as > 6% of income.
 *
 * @param {object} data
 * @param {number|null} data.annualEnergyCost  - Estimated annual energy cost ($).
 * @param {number|null} data.medianIncome      - Area median household income ($).
 * @returns {{ burden: number|null, risk: string, description: string }}
 */
function computeEnergyBurden(data) {
  const cost = (data && data.annualEnergyCost) || null;
  const income = (data && data.medianIncome) || null;

  if (cost === null || income === null || income === 0) {
    return {
      burden: null,
      risk: 'unknown',
      description: 'Insufficient data to compute energy burden.',
    };
  }

  const burden = Math.round((cost / income) * 10000) / 100; // 2 decimal places

  let risk, description;

  if (burden <= 3) {
    risk = 'low';
    description = 'Energy costs are a small share of household income.';
  } else if (burden <= 6) {
    risk = 'moderate';
    description = 'Energy burden is moderate. Near the DOE threshold of 6%.';
  } else if (burden <= 10) {
    risk = 'high';
    description = 'High energy burden (> 6% of income). Exceeds DOE threshold.';
  } else {
    risk = 'severe';
    description = 'Severe energy burden (> 10% of income). Significant financial strain.';
  }

  return { burden, risk, description };
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  computeSafetyScore,
  computeLeadRisk,
  computeFloodRisk,
  computeComplianceRisk,
  computeEnergyBurden,
  scoreToGrade,

  // Constants (for advanced users)
  RESOLVED_DECAY,
  GRADE_THRESHOLDS,
};
