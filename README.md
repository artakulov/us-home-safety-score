# us-home-safety-score

Compute residential Home Safety Scores (0-100, A-F) from U.S. federal data. Zero dependencies. Works in Node.js 14+.

The **Home Safety Score** is a composite index that evaluates environmental risk for any U.S. ZIP code across four dimensions:

- **Water quality** — EPA SDWIS violation history
- **Lead exposure** — EPA Lead and Copper Rule sampling
- **Radon risk** — EPA county-level radon zones
- **Flood risk** — FEMA NFIP historical claims

Higher score = safer. The algorithm is the same one used on [ZipCheckup.com](https://zipcheckup.com) to score 33,000+ ZIP codes.

## Quick Start

```bash
npm install us-home-safety-score
```

```js
const { computeSafetyScore } = require('us-home-safety-score');

const result = computeSafetyScore({
  totalViolations: 3,
  healthViolations: 1,
  leadLevel: 0.008,     // mg/L (90th percentile)
  radonZone: 2,         // EPA zone: 1=High, 2=Moderate, 3=Low
  floodClaims: 25,      // FEMA NFIP historical claims
});

console.log(result);
// {
//   score: 56,
//   grade: 'C',
//   components: {
//     water: { score: 21, maxPoints: 25, weight: 0.25 },
//     lead:  { score: 18, maxPoints: 25, weight: 0.25 },
//     radon: { score: 13, maxPoints: 25, weight: 0.25 },
//     flood: { score: 15, maxPoints: 25, weight: 0.25 },
//   },
//   componentCount: 4,
// }
```

## Methodology

### Scoring Components

| Component | Weight | Max Points | Source |
|-----------|--------|-----------|--------|
| Water Quality | 25% | 25 | EPA SDWIS (5-year violations) |
| Lead/Copper | 25% | 25 | EPA LCR (90th percentile lead) |
| Radon | 25% | 25 | EPA radon zones (county-level) |
| Flood | 25% | 25 | FEMA NFIP (historical claims) |

When FEMA flood data is unavailable, the score uses a **3-component fallback** where each remaining component contributes up to 33 points (~33% weight).

### Grade Scale

| Grade | Score Range | Meaning |
|-------|-----------|---------|
| A | 85-100 | Low risk |
| B | 70-84 | Below-average risk |
| C | 55-69 | Moderate risk |
| D | 40-54 | Elevated risk |
| F | 0-39 | High risk |

### Resolved Violation Decay

Violations that have been resolved (returned to compliance) are weighted at **0.25x** instead of 1.0x. This reflects that the system corrected the issue, while still penalizing historical infrastructure problems.

For the complete methodology with formulas, rationale, limitations, and validation cases, see [METHODOLOGY.md](METHODOLOGY.md).

## API

### `computeSafetyScore(data)`

Compute the composite Home Safety Score.

**Parameters:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `totalViolations` | `number` | Yes | Total SDWIS violations (past 5 years) |
| `healthViolations` | `number` | Yes | Health-based violations (past 5 years) |
| `resolvedViolations` | `number` | No (default 0) | Resolved total violations |
| `resolvedHealthViolations` | `number` | No (default 0) | Resolved health violations |
| `leadLevel` | `number\|null` | No | 90th-percentile lead level (mg/L) |
| `radonZone` | `1\|2\|3\|null` | No | EPA radon zone |
| `floodClaims` | `number\|null` | No | FEMA NFIP historical claims count |

**Returns:** `{ score, grade, components, componentCount }`

### `computeLeadRisk(data)`

Evaluate lead exposure risk from LCR sampling data.

```js
const { computeLeadRisk } = require('us-home-safety-score');

computeLeadRisk({ leadLevel: 0.012 });
// { risk: 'elevated', probability: 0.55, exceedsActionLevel: false,
//   description: 'Lead level is near the EPA action level of 15 ppb...' }
```

**Returns:** `{ risk, probability, exceedsActionLevel, description }`

### `computeFloodRisk(data)`

Evaluate flood risk from FEMA NFIP claims.

```js
const { computeFloodRisk } = require('us-home-safety-score');

computeFloodRisk({ floodClaims: 500, floodAvgPaid: 45000 });
// { risk: 'high', estimatedAnnualCost: 750000, claims: 500, description: '...' }
```

**Returns:** `{ risk, estimatedAnnualCost, claims, description }`

### `computeComplianceRisk(data)`

Evaluate water system regulatory compliance.

```js
const { computeComplianceRisk } = require('us-home-safety-score');

computeComplianceRisk({ totalViolations: 8, healthViolations: 3, unresolvedViolations: 2 });
// { risk: 'poor', score: 28, unresolved: 2, description: '...' }
```

**Returns:** `{ risk, score, unresolved, description }`

### `computeEnergyBurden(data)`

Compute energy cost as a percentage of household income.

```js
const { computeEnergyBurden } = require('us-home-safety-score');

computeEnergyBurden({ annualEnergyCost: 3600, medianIncome: 45000 });
// { burden: 8, risk: 'high', description: '...' }
```

**Returns:** `{ burden, risk, description }`

### `scoreToGrade(score)`

Convert a numeric score (0-100) to a letter grade.

```js
scoreToGrade(72); // 'B'
scoreToGrade(38); // 'F'
```

## Data Sources

| # | Source | Agency | What It Provides |
|---|--------|--------|-----------------|
| 1 | [SDWIS](https://www.epa.gov/enviro/sdwis-search) | EPA | Water system violations |
| 2 | [Lead & Copper Rule](https://www.epa.gov/dwreginfo/lead-and-copper-rule) | EPA | 90th-percentile lead/copper levels |
| 3 | [Radon Zones](https://www.epa.gov/radon/epa-map-radon-zones) | EPA | County-level radon classification |
| 4 | [NFIP Claims](https://www.fema.gov/about/openfema/data-sets) | FEMA | Flood insurance claims by ZIP |
| 5 | [ECHO](https://echo.epa.gov/) | EPA | Enforcement actions |
| 6 | [CCR Data](https://www.epa.gov/ccr) | EPA | Consumer Confidence Reports |
| 7 | [Census ACS](https://data.census.gov/) | Census | Median income, demographics |
| 8 | [EIA SEDS](https://www.eia.gov/state/seds/) | EIA | State energy costs |
| 9 | [NWS API](https://www.weather.gov/documentation/services-web-api) | NOAA | Active weather alerts |
| 10 | [TIGER/Line](https://www.census.gov/geographies/mapping-files/time-series/geo/tiger-line-file.html) | Census | ZIP boundaries, coordinates |
| 11 | [ZIP-County Crosswalk](https://www.huduser.gov/portal/datasets/usps_crosswalk.html) | HUD | ZIP-to-county mapping |
| 12 | [Contaminant MCLs](https://www.epa.gov/ground-water-and-drinking-water/national-primary-drinking-water-regulations) | EPA | Maximum contaminant levels |
| 13 | [SDWA Compliance](https://echo.epa.gov/tools/data-downloads/sdwa-download-summary) | EPA | Safe Drinking Water Act data |
| 14 | [LCRR](https://www.epa.gov/ground-water-and-drinking-water/revised-lead-and-copper-rule) | EPA | Revised Lead and Copper Rule |
| 15 | [County FIPS](https://www.census.gov/library/reference/code-lists/ansi.html) | Census | County identification codes |

## Tests

```bash
node test.js
```

Tests cover:
- Flint, MI scenario (expected: F grade)
- Clean suburb scenario (expected: A, score 100)
- 3-component fallback (no flood data)
- Missing data defaults
- Resolved violation decay
- Lead/flood/compliance risk tiers
- Energy burden calculation
- Grade boundary values
- Error handling

## Contributing

Contributions are welcome. Please:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/improvement`)
3. Add tests for any new functionality
4. Ensure `node test.js` passes
5. Submit a pull request

For methodology changes, please open an issue first to discuss the rationale.

## Links

- **Live scores:** [ZipCheckup.com](https://zipcheckup.com) — Home Safety Scores for 33,000+ U.S. ZIP codes
- **Open dataset:** [zipcheckup.com/data/open-dataset/](https://zipcheckup.com/data/open-dataset/) — downloadable CSV/JSON (CC-BY-4.0)
- **Methodology:** [zipcheckup.com/about/home-safety-score/](https://zipcheckup.com/about/home-safety-score/)

## License

MIT. See [LICENSE](LICENSE).

---

Built by [ZipCheckup](https://zipcheckup.com). Federal data, zero opinions.
