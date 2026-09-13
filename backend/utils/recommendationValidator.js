// backend/utils/recommendationValidator.js
// =============================================================
// OPTIONAL, SELF-CONTAINED, SAFE-TO-DELETE MONITORING TOOL
// =============================================================
// WHAT THIS IS:
//   Every time recommendations are generated, this re-checks the
//   engine's OWN math against the candidates it just produced —
//   score bounds, weight totals, status thresholds, the "Missing
//   Core Skills" flag, and the availability-vs-workload direction.
//   It prints a terminal-style report so you can eyeball, in real
//   time, on real data, whether anything looks broken.
//
// WHAT THIS IS NOT:
//   This is NOT the same as the offline rmrs_accuracy_test.py suite.
//   That script checks the engine against KNOWN CORRECT ANSWERS
//   (ground truth) you supply — true accuracy/precision/recall.
//   This live tool has no ground truth to compare against (a brand
//   new requirement has no "known correct" candidate list), so it
//   can only catch INTERNAL INCONSISTENCIES — cases where the
//   engine's output contradicts its own rules. A 100% score here
//   means "the math is behaving as designed", not "the ranking is
//   the best possible ranking."
//
// HOW TO TURN OFF WITHOUT DELETING:
//   Set ENABLE_RECOMMENDATION_VALIDATOR=false in your .env file.
//
// HOW TO DELETE COMPLETELY, ANY TIME:
//   1. Delete this file.
//   2. Delete the 4 lines marked "VALIDATOR HOOK" in
//      recommendationService.js.
//   The hook is wrapped in try/catch around a require() call, so if
//   you delete this file WITHOUT touching recommendationService.js,
//   nothing breaks — it just silently stops printing.
// =============================================================

const ENABLED = process.env.ENABLE_RECOMMENDATION_VALIDATOR !== 'false';

function validateAndPrint(projectName, requiredSkills, candidates, compositeWeights) {
    if (!ENABLED) return;
    if (!candidates || candidates.length === 0) return;

    const checks = [];
    const record = (label, passed, detail = '') => checks.push({ label, passed, detail });

    // 1. Composite weights must sum to 1.0 (60% + 25% + 15%)
    const wsum = compositeWeights.skill + compositeWeights.availability + compositeWeights.performance;
    record('Composite weights sum to 1.0', Math.abs(wsum - 1.0) < 0.001, `sum=${wsum.toFixed(3)}`);

    // 2. Every score field must stay within [0,1] — a value outside
    // this range means a formula bug slipped through.
    let boundsOk = true;
    for (const c of candidates) {
        for (const field of ['matchingScore', 'availabilityFactor', 'historicalPerformance', 'recommendationScore']) {
            const v = c[field];
            if (typeof v !== 'number' || v < 0 || v > 1) {
                boundsOk = false;
                console.log(`   \u26A0\uFE0F  ${c.name}: ${field}=${v} is OUT OF BOUNDS [0,1]`);
            }
        }
    }
    record('All scores within [0,1] bounds', boundsOk);

    // 3. Status label must match the score thresholds, UNLESS the
    // "Missing Core Skills" override is legitimately active.
    let statusOk = true;
    for (const c of candidates) {
        const expected =
            c.recommendationScore >= 0.7 ? 'Strongly Recommended' :
            c.recommendationScore >= 0.4 ? 'Recommended' :
            c.recommendationScore >= 0.2 ? 'Consider' : 'Not Recommended';
        if (!c.missingCoreSkills && c.status !== expected) {
            statusOk = false;
            console.log(`   \u26A0\uFE0F  ${c.name}: status="${c.status}" but score=${c.recommendationScore} implies "${expected}"`);
        }
    }
    record('Status labels match score thresholds', statusOk);

    // 4. "Missing Core Skills" flag must match prereqFulfillment < 50%
    let coreSkillsOk = true;
    for (const c of candidates) {
        const shouldBeMissing = c.prereqFulfillment < 50;
        if (shouldBeMissing !== Boolean(c.missingCoreSkills)) {
            coreSkillsOk = false;
            console.log(`   \u26A0\uFE0F  ${c.name}: prereqFulfillment=${c.prereqFulfillment}% but missingCoreSkills=${c.missingCoreSkills}`);
        }
    }
    record('"Missing Core Skills" flag matches prereq %', coreSkillsOk);

    // 5. Availability must never INCREASE as workload increases
    // (sigmoid must stay monotonic on the actual returned candidates)
    const sorted = [...candidates].sort((a, b) => a.workloadScore - b.workloadScore);
    let monotonic = true;
    for (let i = 1; i < sorted.length; i++) {
        if (sorted[i].workloadScore > sorted[i - 1].workloadScore &&
            sorted[i].availabilityFactor > sorted[i - 1].availabilityFactor + 0.001) {
            monotonic = false;
        }
    }
    record('Availability decreases as workload increases', monotonic);

    // 6. Informational only — shows which matching tier is doing the
    // work right now (exact / alias / component / subset / partial).
    // Not pass/fail — just useful to watch for drift over time.
    const tierCounts = {};
    for (const c of candidates) {
        for (const d of (c.matchDetails || [])) {
            if (d.matched) tierCounts[d.match_type] = (tierCounts[d.match_type] || 0) + 1;
        }
    }

    // ---- PRINT REPORT ----
    console.log('\n' + '='.repeat(60));
    console.log(`\uD83D\uDCCB RECOMMENDATION SELF-CHECK \u2014 ${projectName || 'Unknown Project'}`);
    console.log('='.repeat(60));
    console.log(`   Candidates evaluated: ${candidates.length}`);
    console.log(`   Required skills: ${requiredSkills.length}`);
    console.log('');
    for (const c of checks) {
        console.log(`   ${c.passed ? '\u2705' : '\u274C'} ${c.label}${c.detail ? ' (' + c.detail + ')' : ''}`);
    }
    console.log('');
    console.log('   Match type distribution this run:');
    if (Object.keys(tierCounts).length === 0) {
        console.log('     (no matches found)');
    } else {
        for (const [tier, count] of Object.entries(tierCounts)) {
            console.log(`     ${tier}: ${count}`);
        }
    }
    const passCount = checks.filter(c => c.passed).length;
    const consistencyScore = Math.round((passCount / checks.length) * 100);
    console.log('');
    console.log(`   \uD83C\uDFC1 SYSTEM CONSISTENCY SCORE: ${consistencyScore}%  ` +
        (consistencyScore === 100 ? '(all internal checks passed)' : '(INVESTIGATE FAILURES ABOVE)'));
    console.log('   Note: checks the engine\'s math against ITSELF, not against a');
    console.log('   known-correct answer key. For true ground-truth accuracy, run');
    console.log('   the offline rmrs_accuracy_test.py suite instead.');
    console.log('='.repeat(60) + '\n');
}

module.exports = { validateAndPrint };
