'use strict';

/**
 * Basic tests for us-home-safety-score.
 *
 * Run: node test.js
 */

const {
  computeSafetyScore,
  computeLeadRisk,
  computeFloodRisk,
  computeComplianceRisk,
  computeEnergyBurden,
  scoreToGrade,
} = require('./index');

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    passed++;
    console.log(`  PASS: ${message}`);
  } else {
    failed++;
    console.error(`  FAIL: ${message}`);
  }
}

function assertScore(result, expectedGrade, message) {
  assert(result.grade === expectedGrade,
    `${message} — expected grade ${expectedGrade}, got ${result.grade} (score ${result.score})`);
}

// ---------------------------------------------------------------------------
// Test: Flint, MI scenario (many health violations, high lead, radon zone 1)
// Expected: F grade
// ---------------------------------------------------------------------------
console.log('\n--- Flint, MI scenario (worst case) ---');

const flint = computeSafetyScore({
  totalViolations: 20,
  healthViolations: 12,
  resolvedViolations: 2,
  resolvedHealthViolations: 1,
  leadLevel: 0.025,       // well above action level
  radonZone: 1,           // high radon
  floodClaims: 50,        // some flood history
});

assertScore(flint, 'F', 'Flint-like scenario should be F');
assert(flint.score < 25, `Flint score should be very low, got ${flint.score}`);
assert(flint.componentCount === 4, 'Should use 4 components with flood data');
assert(flint.components.water.score === 0, 'Water score should be 0 with many health violations');
assert(flint.components.lead.score === 0, 'Lead score should be 0 above action level');
assert(flint.components.radon.score === 0, 'Radon score should be 0 for zone 1');

// ---------------------------------------------------------------------------
// Test: Clean suburb scenario (no violations, low lead, zone 3, no floods)
// Expected: A grade
// ---------------------------------------------------------------------------
console.log('\n--- Clean suburb scenario (best case) ---');

const clean = computeSafetyScore({
  totalViolations: 0,
  healthViolations: 0,
  leadLevel: 0.002,       // very low
  radonZone: 3,           // low radon
  floodClaims: 0,         // no floods
});

assertScore(clean, 'A', 'Clean suburb should be A');
assert(clean.score === 100, `Clean suburb should be 100, got ${clean.score}`);
assert(clean.components.water.score === 25, 'Water should be max 25');
assert(clean.components.lead.score === 25, 'Lead should be max 25');
assert(clean.components.radon.score === 25, 'Radon should be max 25');
assert(clean.components.flood.score === 25, 'Flood should be max 25');

// ---------------------------------------------------------------------------
// Test: 3-component fallback (no FEMA data)
// ---------------------------------------------------------------------------
console.log('\n--- 3-component fallback (no flood data) ---');

const noFlood = computeSafetyScore({
  totalViolations: 0,
  healthViolations: 0,
  leadLevel: 0.002,
  radonZone: 3,
  floodClaims: null,
});

assert(noFlood.componentCount === 3, 'Should use 3 components without flood data');
assert(noFlood.components.flood === undefined, 'Flood component should be absent');
assert(noFlood.components.water.maxPoints === 33, 'Max points should be 33 in 3-component mode');
assertScore(noFlood, 'A', '3-component clean should still be A');

// ---------------------------------------------------------------------------
// Test: Missing data defaults (null lead, null radon)
// ---------------------------------------------------------------------------
console.log('\n--- Missing data (null lead and radon) ---');

const missing = computeSafetyScore({
  totalViolations: 0,
  healthViolations: 0,
  leadLevel: null,
  radonZone: null,
  floodClaims: null,
});

assert(missing.score > 50, `Missing data score should be moderate (neutral), got ${missing.score}`);
// With no data: water=33, lead=round(33*2/3)=22, radon=round(33*2/3)=22 → 77 → B
assertScore(missing, 'B', 'All-null non-violation data should get B (neutral defaults)');

// ---------------------------------------------------------------------------
// Test: Zero violations only
// ---------------------------------------------------------------------------
console.log('\n--- Zero everything ---');

const zeros = computeSafetyScore({
  totalViolations: 0,
  healthViolations: 0,
});

assert(zeros.score > 0, `Zero input should still produce a score, got ${zeros.score}`);
assert(zeros.componentCount === 3, 'No flood data → 3 components');

// ---------------------------------------------------------------------------
// Test: Resolved violation decay
// ---------------------------------------------------------------------------
console.log('\n--- Resolved violation decay ---');

const allActive = computeSafetyScore({
  totalViolations: 4,
  healthViolations: 4,
  resolvedViolations: 0,
  resolvedHealthViolations: 0,
  leadLevel: 0.002,
  radonZone: 3,
  floodClaims: 0,
});

const allResolved = computeSafetyScore({
  totalViolations: 4,
  healthViolations: 4,
  resolvedViolations: 4,
  resolvedHealthViolations: 4,
  leadLevel: 0.002,
  radonZone: 3,
  floodClaims: 0,
});

assert(allResolved.score > allActive.score,
  `Resolved violations (${allResolved.score}) should score higher than active (${allActive.score})`);

// ---------------------------------------------------------------------------
// Test: Lead risk tiers
// ---------------------------------------------------------------------------
console.log('\n--- computeLeadRisk ---');

const leadNone = computeLeadRisk({ leadLevel: null });
assert(leadNone.risk === 'unknown', 'Null lead → unknown');

const leadLow = computeLeadRisk({ leadLevel: 0.003 });
assert(leadLow.risk === 'low', `0.003 mg/L → low, got ${leadLow.risk}`);

const leadHigh = computeLeadRisk({ leadLevel: 0.020 });
assert(leadHigh.risk === 'high', `0.020 mg/L → high, got ${leadHigh.risk}`);
assert(leadHigh.exceedsActionLevel === true, 'Above 0.015 should exceed action level');

// ---------------------------------------------------------------------------
// Test: Flood risk tiers
// ---------------------------------------------------------------------------
console.log('\n--- computeFloodRisk ---');

const floodNone = computeFloodRisk({ floodClaims: null });
assert(floodNone.risk === 'unknown', 'Null flood → unknown');

const floodZero = computeFloodRisk({ floodClaims: 0 });
assert(floodZero.risk === 'very-low', '0 claims → very-low');

const floodHigh = computeFloodRisk({ floodClaims: 500 });
assert(floodHigh.risk === 'high', `500 claims → high, got ${floodHigh.risk}`);

// ---------------------------------------------------------------------------
// Test: Compliance risk
// ---------------------------------------------------------------------------
console.log('\n--- computeComplianceRisk ---');

const compClean = computeComplianceRisk({ totalViolations: 0, healthViolations: 0 });
assert(compClean.risk === 'excellent', `0 violations → excellent, got ${compClean.risk}`);

const compBad = computeComplianceRisk({
  totalViolations: 15,
  healthViolations: 8,
  unresolvedViolations: 5,
});
assert(compBad.risk === 'critical', `Many violations → critical, got ${compBad.risk}`);

// ---------------------------------------------------------------------------
// Test: Energy burden
// ---------------------------------------------------------------------------
console.log('\n--- computeEnergyBurden ---');

const eBurdenLow = computeEnergyBurden({ annualEnergyCost: 1500, medianIncome: 75000 });
assert(eBurdenLow.risk === 'low', `2% burden → low, got ${eBurdenLow.risk}`);
assert(eBurdenLow.burden === 2, `Burden should be 2%, got ${eBurdenLow.burden}`);

const eBurdenHigh = computeEnergyBurden({ annualEnergyCost: 3500, medianIncome: 45000 });
assert(eBurdenHigh.risk === 'high', `~7.8% burden → high, got ${eBurdenHigh.risk}`);

const eBurdenNull = computeEnergyBurden({ annualEnergyCost: null, medianIncome: null });
assert(eBurdenNull.risk === 'unknown', 'Null data → unknown');

// ---------------------------------------------------------------------------
// Test: scoreToGrade
// ---------------------------------------------------------------------------
console.log('\n--- scoreToGrade ---');

assert(scoreToGrade(100) === 'A', '100 → A');
assert(scoreToGrade(85) === 'A', '85 → A');
assert(scoreToGrade(84) === 'B', '84 → B');
assert(scoreToGrade(70) === 'B', '70 → B');
assert(scoreToGrade(55) === 'C', '55 → C');
assert(scoreToGrade(40) === 'D', '40 → D');
assert(scoreToGrade(39) === 'F', '39 → F');
assert(scoreToGrade(0) === 'F', '0 → F');

// ---------------------------------------------------------------------------
// Test: Error handling
// ---------------------------------------------------------------------------
console.log('\n--- Error handling ---');

let threw = false;
try {
  computeSafetyScore(null);
} catch (e) {
  threw = true;
  assert(e instanceof TypeError, 'Null input should throw TypeError');
}
assert(threw, 'computeSafetyScore(null) should throw');

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
console.log(`\n${'='.repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed out of ${passed + failed} tests`);

if (failed > 0) {
  process.exit(1);
} else {
  console.log('All tests passed!');
}
