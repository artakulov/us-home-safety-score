/**
 * us-home-safety-score — TypeScript type definitions
 */

/** Component breakdown for a single scoring dimension. */
export interface ComponentScore {
  /** Points earned for this component. */
  score: number;
  /** Maximum possible points (25 in 4-component mode, 33 in 3-component mode). */
  maxPoints: number;
  /** Weight of this component (0.25 or ~0.33). */
  weight: number;
}

/** Component breakdown object. */
export interface Components {
  water: ComponentScore;
  lead: ComponentScore;
  radon: ComponentScore;
  flood?: ComponentScore;
}

/** Result of computeSafetyScore(). */
export interface HomeSafetyResult {
  /** Composite score, 0-100 (higher = safer). */
  score: number;
  /** Letter grade: A, B, C, D, or F. */
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  /** Per-component score breakdown. */
  components: Components;
  /** Number of components used (3 or 4). */
  componentCount: 3 | 4;
}

/** Input data for computeSafetyScore(). */
export interface SafetyScoreInput {
  /** Total SDWIS violations in past 5 years. */
  totalViolations: number;
  /** Health-based violations in past 5 years. */
  healthViolations: number;
  /** Resolved total violations. */
  resolvedViolations?: number;
  /** Resolved health-based violations. */
  resolvedHealthViolations?: number;
  /** 90th-percentile lead level in mg/L, or null if no data. */
  leadLevel?: number | null;
  /** EPA radon zone (1 = High, 2 = Moderate, 3 = Low), or null. */
  radonZone?: 1 | 2 | 3 | null;
  /** FEMA NFIP historical claims count, or null if no data. */
  floodClaims?: number | null;
}

/** Result of computeLeadRisk(). */
export interface LeadRiskResult {
  /** Risk level. */
  risk: 'very-low' | 'low' | 'moderate' | 'elevated' | 'high' | 'unknown';
  /** Estimated probability of lead exposure (0-1), or null. */
  probability: number | null;
  /** Whether lead level exceeds EPA action level (0.015 mg/L). */
  exceedsActionLevel: boolean;
  /** Human-readable description. */
  description: string;
}

/** Input data for computeLeadRisk(). */
export interface LeadRiskInput {
  /** 90th-percentile lead level in mg/L, or null. */
  leadLevel?: number | null;
}

/** Result of computeFloodRisk(). */
export interface FloodRiskResult {
  /** Risk level. */
  risk: 'very-low' | 'low' | 'moderate' | 'elevated' | 'high' | 'severe' | 'unknown';
  /** Rough annualized flood cost in dollars, or null. */
  estimatedAnnualCost: number | null;
  /** Raw claims count, or null. */
  claims: number | null;
  /** Human-readable description. */
  description: string;
}

/** Input data for computeFloodRisk(). */
export interface FloodRiskInput {
  /** FEMA NFIP historical claims count, or null. */
  floodClaims?: number | null;
  /** Average NFIP payment in dollars, or null. */
  floodAvgPaid?: number | null;
}

/** Result of computeComplianceRisk(). */
export interface ComplianceRiskResult {
  /** Risk level. */
  risk: 'excellent' | 'good' | 'moderate' | 'poor' | 'critical';
  /** Compliance score 0-100 (higher = better). */
  score: number;
  /** Number of currently unresolved violations. */
  unresolved: number;
  /** Human-readable description. */
  description: string;
}

/** Input data for computeComplianceRisk(). */
export interface ComplianceRiskInput {
  /** Total violations. */
  totalViolations: number;
  /** Health-based violations. */
  healthViolations: number;
  /** Resolved violations. */
  resolvedViolations?: number;
  /** Currently unresolved violations. */
  unresolvedViolations?: number;
}

/** Result of computeEnergyBurden(). */
export interface EnergyBurdenResult {
  /** Energy cost as percentage of income, or null. */
  burden: number | null;
  /** Risk level. */
  risk: 'low' | 'moderate' | 'high' | 'severe' | 'unknown';
  /** Human-readable description. */
  description: string;
}

/** Input data for computeEnergyBurden(). */
export interface EnergyBurdenInput {
  /** Estimated annual energy cost in dollars, or null. */
  annualEnergyCost?: number | null;
  /** Area median household income in dollars, or null. */
  medianIncome?: number | null;
}

/**
 * Compute the composite Home Safety Score (0-100, A-F).
 *
 * Combines water quality, lead risk, radon risk, and (optionally) flood risk.
 */
export function computeSafetyScore(data: SafetyScoreInput): HomeSafetyResult;

/** Compute lead exposure risk from LCR sampling data. */
export function computeLeadRisk(data: LeadRiskInput): LeadRiskResult;

/** Compute flood risk from FEMA NFIP claims data. */
export function computeFloodRisk(data: FloodRiskInput): FloodRiskResult;

/** Compute compliance risk from violation history. */
export function computeComplianceRisk(data: ComplianceRiskInput): ComplianceRiskResult;

/** Compute energy burden as percentage of income. */
export function computeEnergyBurden(data: EnergyBurdenInput): EnergyBurdenResult;

/** Convert a numeric score (0-100) to a letter grade. */
export function scoreToGrade(score: number): 'A' | 'B' | 'C' | 'D' | 'F';

/** Resolved violation decay factor (0.25). */
export const RESOLVED_DECAY: number;

/** Grade threshold pairs: [minScore, grade]. */
export const GRADE_THRESHOLDS: Array<[number, string]>;
