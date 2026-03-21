# Home Safety Score Methodology

## Overview

The Home Safety Score is a composite index (0-100) that evaluates residential environmental risk across four dimensions using exclusively federal data sources. Higher scores indicate safer conditions. Each ZIP code receives a letter grade from A (safest) to F (most concerning).

The score is designed to be **transparent, reproducible, and bias-free** — anyone can verify the inputs and recalculate the output.

## Components

The score combines 3 or 4 components depending on data availability:

### 4-Component Mode (FEMA flood data available)

Each component contributes up to **25 points** (25% weight):

| Component | Max Points | Data Source |
|-----------|-----------|-------------|
| Water Quality | 25 | EPA SDWIS violations (5-year history) |
| Lead/Copper Risk | 25 | EPA Lead and Copper Rule sampling |
| Radon Risk | 25 | EPA county-level radon zones |
| Flood Risk | 25 | FEMA NFIP historical claims |

### 3-Component Fallback (no FEMA data)

When FEMA flood data is unavailable for a ZIP code, the remaining three components are rescaled to ~33 points each:

| Component | Max Points | Data Source |
|-----------|-----------|-------------|
| Water Quality | 33 | EPA SDWIS violations (5-year history) |
| Lead/Copper Risk | 33 | EPA Lead and Copper Rule sampling |
| Radon Risk | 33 | EPA county-level radon zones |

This ensures scores remain comparable regardless of flood data availability (max possible is 99 instead of 100 due to rounding).

## Component Formulas

### 1. Water Quality (0-25 or 0-33 points)

Evaluates the drinking water system's regulatory compliance history from the EPA Safe Drinking Water Information System (SDWIS).

**Inputs:**
- `totalViolations` — total violations in the past 5 years
- `healthViolations` — health-based violations (MCL exceedances, treatment technique violations)
- `resolvedViolations` — violations that have returned to compliance
- `resolvedHealthViolations` — resolved health-based violations

**Resolved Violation Decay:**
Active violations count at full weight (1.0x). Resolved violations are decayed to 0.25x, reflecting that the system identified and corrected the issue, while still penalizing historical infrastructure risk.

```
effectiveHealth = activeHealth + resolvedHealth * 0.25
effectiveTotal  = activeTotal  + resolvedTotal  * 0.25
```

**Scoring logic:**
- If `effectiveHealth > 0`: `score = max(0, maxPoints - effectiveHealth * penalty)`
  - `penalty` = 4 (in 25-point mode) or 5 (in 33-point mode)
- Else if `effectiveTotal > 0`: `score = max(floor, maxPoints - effectiveTotal * 2)`
  - `floor` = 45% of maxPoints (non-health violations can't drive score below this)
- Else: full points (no violations)

**Rationale:** Health-based violations (MCL exceedances, treatment failures) are weighted 2x more heavily than monitoring/reporting violations because they indicate actual contaminant exposure, not just administrative lapses.

### 2. Lead/Copper Risk (0-25 or 0-33 points)

Uses the 90th-percentile lead level from EPA Lead and Copper Rule (LCR) sampling.

**Input:** `leadLevel` — 90th-percentile lead concentration in mg/L (ppm).

**Key thresholds:**
- EPA action level: 0.015 mg/L (15 ppb)
- Half action level: 0.005 mg/L (5 ppb)

**Scoring logic:**
- `leadLevel <= 0.005`: full points
- `0.005 < leadLevel <= 0.015`: linear interpolation from full to 0
- `leadLevel > 0.015` (exceeds action level): 0 points
- No data available: 2/3 of max points (neutral assumption)

```
score = maxPoints * (1 - (leadLevel - 0.005) / 0.010)
```

**Rationale:** The linear interpolation between the half-action-level and the action level reflects increasing concern as lead approaches the regulatory threshold. The neutral default (67% of max) avoids penalizing areas simply for lacking sampling data.

### 3. Radon Risk (0-25 or 0-33 points)

Based on EPA's county-level radon zone classification.

**Input:** `radonZone` — EPA zone (1, 2, or 3).

| Zone | Predicted Average | Score |
|------|------------------|-------|
| Zone 3 (Low) | < 2 pCi/L | Full points |
| Zone 2 (Moderate) | 2-4 pCi/L | 52% of max |
| Zone 1 (High) | >= 4 pCi/L | 0 points |
| No data | — | 67% of max (neutral) |

**Rationale:** The EPA action level for radon is 4 pCi/L. Zone 1 counties have predicted averages at or above this level. The 52% weight for Zone 2 reflects moderate concern — elevated but below the action level.

### 4. Flood Risk (0-25 points, optional)

Based on FEMA National Flood Insurance Program (NFIP) historical claims data.

**Input:** `floodClaims` — total historical NFIP claims for the ZIP code.

| Claims Range | Score |
|-------------|-------|
| 0 | 25 |
| 1-10 | 20 |
| 11-50 | 15 |
| 51-200 | 10 |
| 201-1000 | 5 |
| > 1000 | 0 |

**Rationale:** Claims count is a strong empirical proxy for flood risk — it captures actual historical damage events. The step function (rather than continuous) reflects the inherent uncertainty in using historical claims as a predictor and avoids implying false precision.

## Grade Mapping

| Score Range | Grade | Interpretation |
|-------------|-------|---------------|
| 85-100 | A | Low risk. Minimal environmental concerns. |
| 70-84 | B | Below-average risk. Some minor concerns. |
| 55-69 | C | Moderate risk. Notable concerns in one or more areas. |
| 40-54 | D | Elevated risk. Significant concerns detected. |
| 0-39 | F | High risk. Critical issues in multiple areas. |

## Data Sources

| Source | Agency | Data | Update Frequency |
|--------|--------|------|-----------------|
| [SDWIS](https://www.epa.gov/enviro/sdwis-search) | EPA | Water system violations | Quarterly |
| [Lead and Copper Rule](https://www.epa.gov/dwreginfo/lead-and-copper-rule) | EPA | 90th-percentile lead/copper levels | Triennial |
| [Radon Zones](https://www.epa.gov/radon/epa-map-radon-zones) | EPA | County-level radon zone classification | Static (2024 update) |
| [NFIP Claims](https://www.fema.gov/about/openfema/data-sets) | FEMA | Flood insurance claims by ZIP | Annual |
| [Enforcement Actions](https://echo.epa.gov/) | EPA | Regulatory enforcement history | Quarterly |
| [CCR Data](https://www.epa.gov/ccr) | EPA | Consumer Confidence Reports | Annual |
| [Census ACS](https://data.census.gov/) | Census Bureau | Median income, demographics | Annual |
| [EIA SEDS](https://www.eia.gov/state/seds/) | EIA | State energy costs | Annual |
| [NWS Alerts](https://www.weather.gov/documentation/services-web-api) | NWS/NOAA | Active weather alerts | Real-time |
| [TIGER/Line](https://www.census.gov/geographies/mapping-files/time-series/geo/tiger-line-file.html) | Census Bureau | ZIP code boundaries, coordinates | Annual |
| [County FIPS](https://www.census.gov/library/reference/code-lists/ansi.html) | Census Bureau | County identification | Static |
| [ZIP-County Crosswalk](https://www.huduser.gov/portal/datasets/usps_crosswalk.html) | HUD | ZIP-to-county mapping | Quarterly |
| [LCRR Sampling](https://www.epa.gov/ground-water-and-drinking-water/revised-lead-and-copper-rule) | EPA | Lead/copper 90th percentile | Triennial |
| [SDWA Compliance](https://echo.epa.gov/tools/data-downloads/sdwa-download-summary) | EPA | Safe Drinking Water Act compliance | Monthly |
| [Contaminant Reference](https://www.epa.gov/ground-water-and-drinking-water/national-primary-drinking-water-regulations) | EPA | MCL values, health effects | Static |

## Limitations and Assumptions

1. **System-level, not tap-level.** The score reflects the water system's compliance record, not the water quality at any individual faucet. Home plumbing (especially pre-1986 solder or lead service lines) can introduce lead exposure not captured by system-level data.

2. **5-year violation window.** Using a 5-year window balances recency with stability. A system that had a major violation 4 years ago and has been clean since will still show some penalty, which we consider appropriate.

3. **Resolved violation decay (0.25x).** This is a judgment call. We chose 0.25x because a resolved violation demonstrates (a) a past infrastructure problem and (b) the system's ability to correct it. Zero weight would ignore history; full weight would unfairly penalize improvement.

4. **Radon is county-level.** EPA radon zones are assigned per county, not per ZIP. Within a county, radon levels can vary significantly based on geology, construction type, and ventilation.

5. **Flood data gaps.** FEMA NFIP data only covers insured properties. Areas with low flood insurance penetration may appear safer than they are. The 3-component fallback handles ZIPs with no FEMA data entirely.

6. **No data ≠ safe.** When lead or radon data is unavailable, we assign neutral scores (67% of max), not full points. This is conservative: we don't assume safety in the absence of evidence.

7. **Equal component weighting.** We weight all components equally (25% each) rather than attempting to quantify relative health impact. This is simpler, more transparent, and avoids politically charged weighting decisions.

8. **Lead data granularity.** LCR sampling is typically triennial and uses the 90th percentile of tap samples. This is a regulatory compliance metric, not a comprehensive exposure assessment.

## Validation

The score has been validated against known cases:

| Location | Expected | Actual | Notes |
|----------|----------|--------|-------|
| Flint, MI (48503) | F | F (score ~15) | Extensive lead and health violations |
| Newark, NJ (07102) | D-F | D-F | Lead service line issues, health violations |
| Jackson, MS (39201) | F | F | Boil water advisories, infrastructure failures |
| Palo Alto, CA (94301) | A | A (score ~90+) | Clean system, low radon, no flood claims |
| Boulder, CO (80302) | B | B | Clean water but Zone 1 radon |

## References

1. EPA. "Safe Drinking Water Information System (SDWIS)." https://www.epa.gov/enviro/sdwis-search
2. EPA. "Lead and Copper Rule." 40 CFR 141.80-141.91.
3. EPA. "EPA Map of Radon Zones." https://www.epa.gov/radon/epa-map-radon-zones
4. FEMA. "OpenFEMA Dataset: FIMA NFIP Redacted Claims." https://www.fema.gov/about/openfema/data-sets
5. EPA. "National Primary Drinking Water Regulations." https://www.epa.gov/ground-water-and-drinking-water/national-primary-drinking-water-regulations
6. DOE. "Low-Income Energy Affordability Data (LEAD) Tool." https://www.energy.gov/eere/slsc/low-income-energy-affordability-data-lead-tool

---

*This methodology is open source. If you find an error or have a suggestion, please open an issue on GitHub.*
