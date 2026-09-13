const { isSubsetMatch, jaccardSimilarity, skillKey, singularSkillKey, isUuid } =
    require('../utils/skillNormalizer');

function tierMatch(reqSkill, empSkill) {
    if (skillKey(reqSkill) === skillKey(empSkill)) return 'EXACT';
    if (singularSkillKey(reqSkill) === singularSkillKey(empSkill)) return 'EXACT (plural-insensitive)';
    if (isSubsetMatch(reqSkill, empSkill)) return 'SUBSET';
    const sim = jaccardSimilarity(reqSkill, empSkill);
    if (sim >= 0.75) return `JACCARD (${sim.toFixed(2)})`;
    return `NO MATCH (jaccard=${sim.toFixed(2)})`;
}

const shouldMatch = [
    ['gas planning', 'gas and oil planning'],
    ['gas planning', 'oil and gas planning'],
    ['project management', 'agile project management'],
    ['data analysis', 'data analysis and reporting'],
    ['skill', 'skills'],
];
const shouldNotMatch = [
    ['php', 'sap'],
    ['java', 'javascript'],
    ['management', 'risk management'],
    ['react', 'redact'],
    ['sql', 'nosql'],
];

let failed = 0;
console.log('=== MUST MATCH ===');
shouldMatch.forEach(([req, emp]) => {
    const result = tierMatch(req, emp);
    const ok = result !== 'NO MATCH' && !result.startsWith('NO MATCH');
    if (!ok) failed++;
    console.log(`${ok ? '✅' : '❌'} "${req}" vs "${emp}" -> ${result}`);
});
console.log('\n=== MUST NOT MATCH ===');
shouldNotMatch.forEach(([req, emp]) => {
    const result = tierMatch(req, emp);
    const ok = result.startsWith('NO MATCH');
    if (!ok) failed++;
    console.log(`${ok ? '✅' : '❌'} "${req}" vs "${emp}" -> ${result}`);
});

console.log(failed === 0 ? '\n✅ ALL PASSED' : `\n❌ ${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
