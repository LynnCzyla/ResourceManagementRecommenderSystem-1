// backend/tests/comprehensive_audit.js
// Full audit of the recommendation engine against live Supabase data
const supabase = require('../supabase');
const engine = require('../services/recommendationService');
const { skillKey, isSubsetMatch, jaccardSimilarity, isUuid, singularSkillKey, tokenizeSkill } = require('../utils/skillNormalizer');

const PASS = '✅';
const FAIL = '❌';
const WARN = '⚠️';
let totalTests = 0, passed = 0, failed = 0, warnings = 0;
const issues = [];

function test(label, ok, detail = '') {
    totalTests++;
    if (ok) { passed++; console.log(`  ${PASS} ${label}`); }
    else { failed++; console.log(`  ${FAIL} ${label}${detail ? ' — ' + detail : ''}`); issues.push({ label, detail }); }
}
function warn(label, detail = '') {
    warnings++;
    console.log(`  ${WARN} ${label}${detail ? ' — ' + detail : ''}`);
}

async function run() {
    console.log('\n' + '='.repeat(70));
    console.log('  RMRS RECOMMENDATION ENGINE — COMPREHENSIVE AUDIT');
    console.log('='.repeat(70));

    // ═══════════════════════════════════════════════════════
    // SECTION 1: skillNormalizer.js unit tests
    // ═══════════════════════════════════════════════════════
    console.log('\n--- SECTION 1: skillNormalizer.js ---');

    // 1a. skillKey
    test('skillKey basic', skillKey('  Gas  Planning ') === 'gas planning');
    test('skillKey collapses whitespace', skillKey('a   b   c') === 'a b c');

    // 1b. singularSkillKey
    test('singularSkillKey "skills"→"skill"', singularSkillKey('skills') === 'skill');
    test('singularSkillKey "activities"→"activity"', singularSkillKey('activities') === 'activity');
    test('singularSkillKey short word unchanged', singularSkillKey('gas') === 'gas');

    // 1c. isSubsetMatch — MUST match
    test('subset: gas planning ⊆ gas and oil planning', isSubsetMatch('gas planning', 'gas and oil planning'));
    test('subset: gas planning ⊆ oil and gas planning', isSubsetMatch('gas planning', 'oil and gas planning'));
    test('subset: project management ⊆ agile project management', isSubsetMatch('project management', 'agile project management'));
    test('subset: data analysis ⊆ data analysis and reporting', isSubsetMatch('data analysis', 'data analysis and reporting'));

    // 1d. isSubsetMatch — MUST NOT match
    test('no subset: php vs sap', !isSubsetMatch('php', 'sap'));
    test('no subset: java vs javascript', !isSubsetMatch('java', 'javascript'));
    test('no subset: management vs risk management (single token guard)', !isSubsetMatch('management', 'risk management'));
    test('no subset: react vs redact', !isSubsetMatch('react', 'redact'));

    // 1e. jaccardSimilarity
    test('jaccard: identical = 1.0', jaccardSimilarity('gas planning', 'gas planning') === 1.0);
    test('jaccard: completely different = 0', jaccardSimilarity('php', 'sap') === 0);
    test('jaccard: java vs javascript < 0.75', jaccardSimilarity('java', 'javascript') < 0.75);

    // 1f. isUuid
    test('isUuid valid', isUuid('609b4ff7-e328-4c9a-bc97-2c5e5a4bfcb6'));
    test('isUuid invalid', !isUuid('not-a-uuid'));
    test('isUuid null', !isUuid(null));
    test('isUuid number', !isUuid(123));

    // 1g. tokenizeSkill
    test('tokenize removes stopwords', !tokenizeSkill('gas and oil planning').includes('and'));
    test('tokenize singularizes', tokenizeSkill('engineers').includes('engineer'));

    // ═══════════════════════════════════════════════════════
    // SECTION 2: Engine configuration sanity
    // ═══════════════════════════════════════════════════════
    console.log('\n--- SECTION 2: Engine Configuration ---');

    const w = engine.COMPOSITE_WEIGHTS;
    test('COMPOSITE_WEIGHTS sum = 1.0', Math.abs(w.skill + w.availability + w.performance - 1.0) < 0.001,
        `sum=${(w.skill + w.availability + w.performance).toFixed(3)}`);
    test('COMPOSITE_WEIGHTS skill is dominant', w.skill > w.availability && w.skill > w.performance);
    test('SKILL_TYPE_WEIGHTS primary > secondary', engine.SKILL_TYPE_WEIGHTS.primary > engine.SKILL_TYPE_WEIGHTS.secondary);

    // Sigmoid availability
    const avail0 = engine._calculateAvailability(0);
    const avail5 = engine._calculateAvailability(5);
    const avail7 = engine._calculateAvailability(7);
    const avail10 = engine._calculateAvailability(10);
    test('availability(0) > 0.9', avail0 > 0.9, `got ${avail0.toFixed(3)}`);
    test('availability(7) ≈ 0.5', Math.abs(avail7 - 0.5) < 0.05, `got ${avail7.toFixed(3)}`);
    test('availability(10) < 0.25', avail10 < 0.25, `got ${avail10.toFixed(3)}`);
    test('availability monotonically decreasing', avail0 > avail5 && avail5 > avail7 && avail7 > avail10);
    test('availability never reaches 0', engine._calculateAvailability(100) > 0, 'sigmoid must never zero out');

    // Status thresholds
    test('status 0.7+ = Strongly Recommended', engine._getRecommendationStatus(0.7) === 'Strongly Recommended');
    test('status 0.4 = Recommended', engine._getRecommendationStatus(0.4) === 'Recommended');
    test('status 0.2 = Consider', engine._getRecommendationStatus(0.2) === 'Consider');
    test('status 0.1 = Not Recommended', engine._getRecommendationStatus(0.1) === 'Not Recommended');

    // ═══════════════════════════════════════════════════════
    // SECTION 3: Database connectivity & data quality
    // ═══════════════════════════════════════════════════════
    console.log('\n--- SECTION 3: Database & Data Quality ---');

    const { data: profiles } = await supabase.from('profiles').select('id, branch_id, role').eq('status', 'Active').eq('role', 'Employee');
    test('Active employees exist', profiles && profiles.length > 0, `count=${profiles?.length}`);

    const nullBranch = (profiles || []).filter(p => !p.branch_id);
    if (nullBranch.length > 0) warn(`${nullBranch.length} employees with NULL branch_id — they will never appear in branch-filtered results`);

    const { data: aliases } = await supabase.from('skill_aliases').select('id');
    test('Skill aliases table accessible', aliases !== null);
    if (aliases) console.log(`  ℹ️  ${aliases.length} skill alias rows loaded`);

    const { data: skills } = await supabase.from('skills').select('id, skill_name');
    test('Skills table accessible', skills !== null);

    const { data: reqSkills } = await supabase.from('requirement_skills').select('id, skills, skill_type');
    test('Requirement skills table accessible', reqSkills !== null);

    // Check for null skill_type
    const nullType = (reqSkills || []).filter(r => !r.skill_type);
    if (nullType.length > 0) warn(`${nullType.length} requirement_skills rows with NULL skill_type — these default to 'primary'`);

    // ═══════════════════════════════════════════════════════
    // SECTION 4: Security — branch access checks
    // ═══════════════════════════════════════════════════════
    console.log('\n--- SECTION 4: Security (Branch Access) ---');

    const { data: projRow } = await supabase.from('projects').select('id, profiles:created_by(branch_id)').limit(1).single();
    const { data: reqRow } = await supabase.from('project_resource_requirements').select('id, project_id').limit(1).single();
    const { data: profRow } = await supabase.from('profiles').select('id, branch_id').not('branch_id', 'is', null).limit(1).single();

    const controller = require('../controllers/recommendationController');
    const endpointNames = ['getRecommendations', 'getRecommendationsByRequirement', 'getEmployeeWorkload', 'assignEmployee', 'getEmployeePerformance'];

    for (const name of endpointNames) {
        let statusCode = null;
        const req = {
            params: { projectId: projRow?.id, requirementId: reqRow?.id, profileId: profRow?.id },
            query: {},
            body: { profileId: profRow?.id },
            user: { id: 'audit-test', role: 'resource_manager', branch_id: null, is_super_admin: false }
        };
        const res = {
            status(c) { statusCode = c; return this; },
            json() { return this; }
        };
        try { await controller[name](req, res); } catch (e) {}
        test(`${name} blocks null branch_id → 403`, statusCode === 403, `got ${statusCode}`);
    }

    // ═══════════════════════════════════════════════════════
    // SECTION 5: Live recommendation flow — end-to-end
    // ═══════════════════════════════════════════════════════
    console.log('\n--- SECTION 5: Live Recommendation Flow (end-to-end) ---');

    const requirements = await supabase.from('project_resource_requirements').select('id, project_id').limit(3);
    for (const r of (requirements.data || [])) {
        const proj = await supabase.from('projects').select('profiles:created_by(branch_id)').eq('id', r.project_id).single();
        const branchId = proj.data?.profiles?.branch_id;
        if (!branchId) { warn(`Requirement ${r.id}: project ${r.project_id} has no branch — skipping`); continue; }

        try {
            const result = await engine.getCandidatesForProject(r.project_id, { requirementId: r.id, includeAll: true }, branchId, false);
            test(`Req ${r.id}: engine returns success`, result.success === true);
            test(`Req ${r.id}: candidates is array`, Array.isArray(result.data?.candidates));

            const candidates = result.data?.candidates || [];
            // Score bounds
            for (const c of candidates) {
                if (c.matchingScore < 0 || c.matchingScore > 1) {
                    test(`Req ${r.id}: ${c.name} matchingScore in [0,1]`, false, `got ${c.matchingScore}`);
                }
                if (c.recommendationScore < 0 || c.recommendationScore > 1.001) {
                    test(`Req ${r.id}: ${c.name} recommendationScore in [0,1]`, false, `got ${c.recommendationScore}`);
                }
            }
            // Sort order
            let sorted = true;
            for (let i = 1; i < candidates.length; i++) {
                if (candidates[i].recommendationScore > candidates[i-1].recommendationScore + 0.001) {
                    sorted = false; break;
                }
            }
            test(`Req ${r.id}: candidates sorted descending by score`, sorted);

            // Status label consistency
            for (const c of candidates) {
                if (c.missingCoreSkills && c.status !== 'Missing Core Skills') {
                    test(`Req ${r.id}: ${c.name} missingCoreSkills → status`, false, `status="${c.status}"`);
                }
            }

            // prereqFulfillment consistency
            for (const c of candidates) {
                const shouldMiss = c.prereqFulfillment < 50;
                if (shouldMiss !== Boolean(c.missingCoreSkills)) {
                    test(`Req ${r.id}: ${c.name} prereq/missingCoreSkills consistent`, false,
                        `prereq=${c.prereqFulfillment}% missingCore=${c.missingCoreSkills}`);
                }
            }

            // Breakdown present
            if (candidates.length > 0) {
                test(`Req ${r.id}: breakdown object present`, candidates[0].breakdown != null);
                test(`Req ${r.id}: matchDetails present`, Array.isArray(candidates[0].matchDetails));
            }

        } catch (e) {
            test(`Req ${r.id}: no crash`, false, e.message);
        }
    }

    // ═══════════════════════════════════════════════════════
    // SECTION 6: Matching tier coverage check
    // ═══════════════════════════════════════════════════════
    console.log('\n--- SECTION 6: Matching Tier Coverage ---');

    // Run a broader scan across all requirements
    const allReqs = await supabase.from('project_resource_requirements').select('id, project_id');
    const tierCounts = { exact: 0, alias: 0, component: 0, subset: 0, partial: 0, none: 0 };
    let totalMatchDetails = 0;

    for (const r of (allReqs.data || []).slice(0, 10)) {
        try {
            const proj = await supabase.from('projects').select('profiles:created_by(branch_id)').eq('id', r.project_id).single();
            const branchId = proj.data?.profiles?.branch_id;
            if (!branchId) continue;
            const result = await engine.getCandidatesForProject(r.project_id, { requirementId: r.id, includeAll: true }, branchId, false);
            for (const c of (result.data?.candidates || [])) {
                for (const d of (c.matchDetails || [])) {
                    totalMatchDetails++;
                    tierCounts[d.match_type] = (tierCounts[d.match_type] || 0) + 1;
                }
            }
        } catch (e) { /* skip */ }
    }

    console.log(`  ℹ️  Total match evaluations: ${totalMatchDetails}`);
    for (const [tier, count] of Object.entries(tierCounts)) {
        const pct = totalMatchDetails > 0 ? ((count / totalMatchDetails) * 100).toFixed(1) : '0';
        console.log(`      ${tier}: ${count} (${pct}%)`);
    }

    if (tierCounts.exact === 0 && totalMatchDetails > 0) warn('No EXACT matches found — may indicate skill data mismatch');
    if (tierCounts.none > totalMatchDetails * 0.9) warn('Over 90% of skills are unmatched — check skill data quality');

    // ═══════════════════════════════════════════════════════
    // SECTION 7: Known edge case checks
    // ═══════════════════════════════════════════════════════
    console.log('\n--- SECTION 7: Edge Cases ---');

    // _splitSkillIntoComponents
    const comp1 = engine._splitSkillIntoComponents('electrical design and installation');
    test('_splitSkillIntoComponents returns components', comp1.length > 0, `got ${JSON.stringify(comp1)}`);

    const comp2 = engine._splitSkillIntoComponents('python');
    test('_splitSkillIntoComponents single word → []', comp2.length === 0);

    // _normalize delegates to skillKey
    test('_normalize === skillKey', engine._normalize('Test  Skill') === skillKey('Test  Skill'));

    // Dead cache object
    test('this.cache exists (Map)', engine.cache instanceof Map);
    warn('this.cache is unused — dead code, not harmful but clutters constructor');

    // ═══════════════════════════════════════════════════════
    // SUMMARY
    // ═══════════════════════════════════════════════════════
    console.log('\n' + '='.repeat(70));
    console.log(`  AUDIT SUMMARY`);
    console.log(`  Total tests: ${totalTests}`);
    console.log(`  ${PASS} Passed: ${passed}`);
    console.log(`  ${FAIL} Failed: ${failed}`);
    console.log(`  ${WARN} Warnings: ${warnings}`);
    console.log('='.repeat(70));

    if (issues.length > 0) {
        console.log('\n  ISSUES FOUND:');
        issues.forEach((iss, i) => console.log(`  ${i+1}. ${iss.label}${iss.detail ? ': ' + iss.detail : ''}`));
    }

    console.log('');
    process.exit(failed > 0 ? 1 : 0);
}

run().catch(e => { console.error('Audit crashed:', e); process.exit(2); });
