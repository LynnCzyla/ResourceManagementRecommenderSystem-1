// rmrs_accuracy_test.js  (v3 — full 4-factor context for holistic verification)
// -----------------------------------------------------------------------
// Generates the raw data for "Table 7. Resource Recommendation Accuracy
// Results".
//
// WHY v3
//   RQ4 of the study asks whether the system generates accurate
//   recommendations "based on skill matching, availability, and workload
//   conditions," and the Scope also folds in historical performance.
//   v2 only exported skill-match evidence, which under-covers RQ4.
//   v3 adds the other three factors so the human verifier can judge
//   "meets_requirements" holistically — not skill-only.
//
//   IMPORTANT: "meets_requirements" must be an INDEPENDENT human/domain
//   -expert judgment made by looking at the raw facts below (skills,
//   workload points, availability status, performance rating), NOT by
//   re-deriving the system's own weighted formula. If the verifier just
//   recomputes (skill*0.6 + availability*0.25 + performance*0.15), the
//   result will trivially match the system 100% of the time — that
//   proves the arithmetic works, not that the recommendation is good.
//   The point of this table is the same kind of ground-truth check as
//   Table 6: does a human, looking at the same facts, agree that this
//   employee was a sound recommendation for this project?
//
// SETUP
//   1. backend/scripts/rmrs_accuracy_test.js
//   2. backend/.env needs SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
//   3. node scripts/rmrs_accuracy_test.js
//   4. Fill in "meets_requirements" (YES/NO) per row, save.
//   5. node scripts/rmrs_accuracy_test.js --tally
// -----------------------------------------------------------------------

const fs = require('fs');
const path = require('path');
const supabase = require('../supabase');
const recommendationService = require('../services/recommendationService');

const TEST_PROJECTS = [
  { projectId: 23 },  // WEA-2026-001 — Petron Refinery UPS Maintenance & Compliance Upgrade
  { projectId: 24 },  // WEA-2026-002 — Shell Tabangao Terminal Lighting Design Project
  { projectId: 25 },  // WEA-2026-003 — Petrochemical Plant Electrical Distribution Upgrade
  { projectId: 26 },  // WEA-2026-004 — Chevron Batangas Substation Design & Documentation
  { projectId: 27 },  // Meralco 115kV Substation Protection Relay Upgrade
  { projectId: 28 }, // Autocad Drafting Gas Station   (id 15 dropped — duplicate)
  { projectId: 29 }, // AutoCAD Designing DALI STORE
  { projectId: 30 }, // AutoCAD draft for 711
  { projectId: 31 }, // AutoCAD draft for 711
  { projectId: 32 }, // AutoCAD draft for 711
];

const CSV_PATH = path.join(__dirname, 'rmrs_accuracy_results.csv');
const MAX_CANDIDATES = 5;

const COLUMNS = [
  'test_project', 'employee_name', 'system_status', 'recommendation_score',
  // --- skill factor (60%) ---
  'primary_match', 'secondary_match', 'prereq_fulfillment_pct',
  'missing_core_skills', 'matched_skills', 'missing_primary_skills',
  'missing_secondary_skills',
  // --- availability / workload factor (25%) ---
  'workload_points', 'availability_status', 'availability_pct',
  // --- historical performance factor (15%) ---
  'historical_performance_pct',
  // --- human verification (fill this in) ---
  'meets_requirements'
];

async function resolveLabel(projectId) {
  const { data, error } = await supabase
    .from('projects')
    .select('project_name, project_code')
    .eq('id', projectId)
    .single();

  if (error || !data) return `Project #${projectId}`;
  return data.project_code
    ? `${data.project_name} (${data.project_code})`
    : data.project_name;
}

async function runTests() {
  if (TEST_PROJECTS.length === 0) {
    console.log('TEST_PROJECTS is empty. Add your sample projects first.');
    return;
  }

  const rows = [];

  for (const test of TEST_PROJECTS) {
    const label = test.label || await resolveLabel(test.projectId);
    console.log(`\n=== ${label} (id=${test.projectId}) ===`);
    try {
      const result = await recommendationService.getCandidatesForProject(
        test.projectId,
        {
          maxCandidates: MAX_CANDIDATES,
          requirementId: test.requirementId || null
        },
        null,
        true
      );

      const candidates = result?.data?.candidates || [];
      if (candidates.length === 0) {
        console.log('  (no candidates returned)');
        continue;
      }

      for (const c of candidates) {
        const details = c.matchDetails || [];

        const matched = details
          .filter(d => d.matched)
          .map(d => `${d.reqSkill} <- ${d.matched_employee_skill} (${d.match_type})`)
          .join('; ');

        const missingPrimary = details
          .filter(d => !d.matched && d.skill_type === 'primary')
          .map(d => d.reqSkill)
          .join('; ');

        const missingSecondary = details
          .filter(d => !d.matched && d.skill_type === 'secondary')
          .map(d => d.reqSkill)
          .join('; ');

        console.log(
          `  - ${c.name} (score=${Number(c.recommendationScore).toFixed(3)}, ` +
          `primary=${c.primarySkillMatchCount}, workload=${c.workloadScore}, ` +
          `perf=${Math.round(c.historicalPerformance * 100)}%, status=${c.status})`
        );

        rows.push({
          test_project: label,
          employee_name: c.name,
          system_status: c.status,
          recommendation_score: c.recommendationScore,

          primary_match: c.primarySkillMatchCount,
          secondary_match: c.secondarySkillMatchCount,
          prereq_fulfillment_pct: c.prereqFulfillment,
          missing_core_skills: c.missingCoreSkills ? 'YES' : 'NO',
          matched_skills: matched,
          missing_primary_skills: missingPrimary,
          missing_secondary_skills: missingSecondary,

          workload_points: c.workloadScore,
          availability_status: c.breakdown?.availability?.status || '',
          availability_pct: Math.round((c.availabilityFactor || 0) * 100),

          historical_performance_pct: Math.round((c.historicalPerformance || 0) * 100),

          meets_requirements: '' // <-- human/domain-expert fills in: YES or NO
        });
      }
    } catch (err) {
      console.error(`  Error on project ${test.projectId}:`, err.message);
    }
  }

  writeCsv(rows);
  console.log(`\nWrote ${rows.length} rows to ${CSV_PATH}`);
  console.log('   For each row, judge "meets_requirements" (YES/NO) by looking at');
  console.log('   the skill, workload/availability, and performance columns together —');
  console.log('   not by re-deriving the system\'s own weighted score.');
  console.log('   Then run: node scripts/rmrs_accuracy_test.js --tally');
}

function writeCsv(rows) {
  const escape = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const header = COLUMNS.join(',') + '\n';
  const body = rows
    .map(r => COLUMNS.map(col => escape(r[col])).join(','))
    .join('\n');
  fs.writeFileSync(CSV_PATH, header + body, 'utf8');
}

function parseCsv(text) {
  const rows = [];
  let row = [], field = '', inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (ch !== '\r') field += ch;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

// A row's system_status is a binary prediction: did the engine itself
// consider this candidate qualified, or did it already flag them as
// missing core skills? "Recommended" / "Strongly Recommended" = predicted
// qualified; "Missing Core Skills" = predicted not qualified.
function predictedQualified(status) {
  const s = String(status || '').trim().toLowerCase();
  return s === 'recommended' || s === 'strongly recommended';
}

function tally() {
  if (!fs.existsSync(CSV_PATH)) {
    console.log('No results CSV found yet. Run the script without --tally first.');
    return;
  }
  const rows = parseCsv(fs.readFileSync(CSV_PATH, 'utf8').trim());
  const header = rows.shift();
  const idx = (name) => header.indexOf(name);

  const unfilled = rows.filter(
    r => !['YES', 'NO'].includes(String(r[idx('meets_requirements')]).trim().toUpperCase())
  ).length;
  if (unfilled > 0) {
    console.log(`\n${unfilled} of ${rows.length} rows still have a blank/invalid meets_requirements.`);
    console.log('Fill every row with YES or NO before reporting.\n');
  }

  // ---- Table 7: raw fill-rate per project (candidates returned vs.
  // candidates a human verified as a good fit) ----
  const byProject = {};
  for (const r of rows) {
    const project = r[idx('test_project')];
    const meets = String(r[idx('meets_requirements')]).trim().toUpperCase() === 'YES';

    if (!byProject[project]) byProject[project] = { recommended: 0, verified: 0 };
    byProject[project].recommended += 1;
    if (meets) byProject[project].verified += 1;
  }

  console.log('\n=== Table 7. Resource Recommendation Accuracy Results (fill-rate) ===\n');
  console.log('Test Project | Employees Recommended | Employees Verified to Meet Requirements | Result');

  let totRec = 0, totVer = 0;
  for (const [project, b] of Object.entries(byProject)) {
    const pct = b.recommended ? ((b.verified / b.recommended) * 100).toFixed(1) : '0.0';
    console.log(`${project} | ${b.recommended} | ${b.verified} | ${pct}%`);
    totRec += b.recommended; totVer += b.verified;
  }
  console.log(`\nOverall fill-rate: ${totVer}/${totRec} = ${((totVer / totRec) * 100).toFixed(1)}%`);
  console.log('(This measures how many of the forced top-N slots per project were');
  console.log(' actually good fits — it is diluted whenever fewer than N employees');
  console.log(' in the pool have the required skills at all.)');

  // ---- Precision@K: of the top K ranked candidates per project, what
  // fraction were human-verified as meeting requirements? Uses the CSV's
  // existing row order per project, which reflects the recommendation
  // engine's own ranking (highest recommendation_score first). ----
  const byProjectOrdered = {};
  for (const r of rows) {
    const project = r[idx('test_project')];
    if (!byProjectOrdered[project]) byProjectOrdered[project] = [];
    byProjectOrdered[project].push(
      String(r[idx('meets_requirements')]).trim().toUpperCase() === 'YES'
    );
  }

  const K_VALUES = [1, 3, 5];
  console.log('\n=== Precision@K (ranked top-K per project) ===\n');
  console.log('Test Project | ' + K_VALUES.map(k => `P@${k}`).join(' | '));

  const microHits = {}, microTotal = {};
  K_VALUES.forEach(k => { microHits[k] = 0; microTotal[k] = 0; });

  for (const [project, flags] of Object.entries(byProjectOrdered)) {
    const cells = K_VALUES.map(k => {
      const topK = flags.slice(0, k);
      const hits = topK.filter(Boolean).length;
      microHits[k] += hits;
      microTotal[k] += topK.length;
      return topK.length ? `${hits}/${topK.length} (${((hits / topK.length) * 100).toFixed(0)}%)` : 'n/a';
    });
    console.log(`${project} | ${cells.join(' | ')}`);
  }

  console.log('\nMicro-averaged (pooled across all projects):');
  K_VALUES.forEach(k => {
    const pct = microTotal[k] ? ((microHits[k] / microTotal[k]) * 100).toFixed(1) : '0.0';
    console.log(`  Precision@${k}: ${microHits[k]}/${microTotal[k]} = ${pct}%`);
  });
  console.log('\n(Precision@5 here is the same figure as the Table 7 overall fill-rate —');
  console.log(' same metric, standard IR/recsys name. Precision@1 reflects the realistic');
  console.log(' case of a PM picking just the single top-ranked candidate per project.)');

  // ---- Confusion matrix: system_status (predicted) vs. meets_requirements
  // (ground truth) — this is the "did the engine correctly recognize who's
  // qualified" metric, independent of how many slots got filled. ----
  let tp = 0, tn = 0, fp = 0, fn = 0;
  for (const r of rows) {
    const meets = String(r[idx('meets_requirements')]).trim().toUpperCase() === 'YES';
    const predicted = predictedQualified(r[idx('system_status')]);

    if (predicted && meets) tp++;
    else if (!predicted && !meets) tn++;
    else if (predicted && !meets) fp++;
    else if (!predicted && meets) fn++;
  }
  const total = tp + tn + fp + fn;
  const accuracy = total ? ((tp + tn) / total) * 100 : 0;
  const precision = (tp + fp) ? (tp / (tp + fp)) * 100 : null;
  const recall = (tp + fn) ? (tp / (tp + fn)) * 100 : null;

  console.log('\n=== Status-Label Classification Accuracy (system vs. human judgment) ===\n');
  console.log('Confusion matrix:');
  console.log(`  True Positive  (predicted qualified, verified Yes) : ${tp}`);
  console.log(`  True Negative  (predicted not qualified, verified No) : ${tn}`);
  console.log(`  False Positive (predicted qualified, verified No)  : ${fp}`);
  console.log(`  False Negative (predicted not qualified, verified Yes): ${fn}`);
  console.log(`\nAccuracy:  ${(tp + tn)}/${total} = ${accuracy.toFixed(1)}%`);
  if (precision !== null) console.log(`Precision: ${precision.toFixed(1)}%  (of candidates the system called qualified, % actually were)`);
  if (recall !== null) console.log(`Recall:    ${recall.toFixed(1)}%  (of candidates a human verified as qualified, % the system also called qualified)`);
  console.log('\n(This measures whether the engine\'s own Recommended/Strongly Recommended vs.');
  console.log(' Missing Core Skills label matches human judgment — independent of whether');
  console.log(' enough qualified people existed in the pool to fill every slot.)');
}

if (require.main === module) {
  if (process.argv.includes('--tally')) {
    tally();
  } else {
    runTests().catch(err => {
      console.error('Fatal error:', err);
      process.exit(1);
    });
  }
}