// rmrs_fairness_test.js
// -----------------------------------------------------------------------
// Measures FAIRNESS of the recommendations (RQ4: "accurate and fair").
// Reads the SAME CSV produced by rmrs_accuracy_test.js -- no database needed.
//
// Fairness here = how evenly the recommendation slots are spread among the
// candidates, instead of the same few employees being picked every time.
//
// Metrics:
//   - Distinct employees recommended (Top-1 and Top-5)
//   - Top-1 share of the most-picked employee
//   - Gini coefficient (0 = perfectly even, 1 = all slots to one employee)
//   - Tied-score rate (candidates with identical scores in the same project)
//   - Workload spread of recommended employees (does availability differentiate?)
//
// USAGE:  put this in backend/scripts/ then run
//         node scripts/rmrs_fairness_test.js
// -----------------------------------------------------------------------

const fs = require('fs');
const path = require('path');

const CSV_PATH = path.join(__dirname, 'rmrs_accuracy_results.csv');

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

function gini(values) {
  const v = [...values].sort((a, b) => a - b);
  const n = v.length;
  const total = v.reduce((s, x) => s + x, 0);
  if (n === 0 || total === 0) return 0;
  let acc = 0;
  v.forEach((x, i) => { acc += (2 * (i + 1) - n - 1) * x; });
  return acc / (n * total);
}

function pct(x) { return (x * 100).toFixed(1) + '%'; }

function main() {
  if (!fs.existsSync(CSV_PATH)) {
    console.log('No rmrs_accuracy_results.csv found. Run rmrs_accuracy_test.js first.');
    return;
  }
  const rows = parseCsv(fs.readFileSync(CSV_PATH, 'utf8').trim());
  const header = rows[0];
  const idx = (name) => header.indexOf(name);
  const iProj = idx('test_project');
  const iEmp = idx('employee_name');
  const iScore = idx('recommendation_score');
  const iWork = idx('workload_points');

  // Group rows by project, keeping the CSV order (= rank order from the engine)
  const byProject = new Map();
  for (const r of rows.slice(1)) {
    if (!r[iProj]) continue;
    if (!byProject.has(r[iProj])) byProject.set(r[iProj], []);
    byProject.get(r[iProj]).push({
      emp: r[iEmp],
      score: parseFloat(r[iScore]),
      workload: parseFloat(r[iWork]),
    });
  }

  const allEmployees = new Set();
  const top1 = {};
  const top5 = {};
  let tiedCandidates = 0;
  let totalCandidates = 0;
  const workloads = [];

  for (const [, list] of byProject) {
    list.forEach((c, i) => {
      allEmployees.add(c.emp);
      top5[c.emp] = (top5[c.emp] || 0) + 1;
      if (i === 0) top1[c.emp] = (top1[c.emp] || 0) + 1;
      workloads.push(c.workload);
      totalCandidates++;
    });
    const counts = {};
    list.forEach((c) => { counts[c.score] = (counts[c.score] || 0) + 1; });
    list.forEach((c) => { if (counts[c.score] > 1) tiedCandidates++; });
  }

  const nProjects = byProject.size;
  const pool = [...allEmployees];
  const top1Vals = pool.map((e) => top1[e] || 0);
  const top5Vals = pool.map((e) => top5[e] || 0);
  const totalTop5 = top5Vals.reduce((s, x) => s + x, 0);

  const maxTop1 = Math.max(...top1Vals);
  const maxTop5 = Math.max(...top5Vals);
  const distinctTop1 = top1Vals.filter((x) => x > 0).length;

  console.log('\n=== RMRS FAIRNESS TEST ===');
  console.log(`Projects: ${nProjects} | Candidate slots: ${totalCandidates} | Distinct employees: ${pool.length}\n`);

  console.log('-- Top-1 distribution --');
  Object.entries(top1).sort((a, b) => b[1] - a[1]).forEach(([e, c]) => console.log(`  ${e}: ${c}`));
  console.log(`  Distinct employees as Top-1: ${distinctTop1} of ${pool.length}`);
  console.log(`  Most-picked Top-1 share: ${pct(maxTop1 / nProjects)}`);
  console.log(`  Gini (Top-1): ${gini(top1Vals).toFixed(3)}\n`);

  console.log('-- Top-5 distribution (all slots) --');
  Object.entries(top5).sort((a, b) => b[1] - a[1]).forEach(([e, c]) =>
    console.log(`  ${e}: ${c} of ${nProjects} projects (${pct(c / nProjects)})`));
  console.log(`  Most-picked Top-5 share of all slots: ${pct(maxTop5 / totalTop5)}`);
  console.log(`  Gini (Top-5): ${gini(top5Vals).toFixed(3)}\n`);

  console.log('-- Tie / workload diagnostics --');
  console.log(`  Candidates sharing an identical score with another in the same project: ${tiedCandidates}/${totalCandidates} (${pct(tiedCandidates / totalCandidates)})`);
  const wMin = Math.min(...workloads), wMax = Math.max(...workloads);
  console.log(`  Workload points among recommended employees: min ${wMin}, max ${wMax}`);
  if (wMin === wMax) {
    console.log('  NOTE: all candidates have the same workload, so the Availability Factor');
    console.log('        did not differentiate anyone in this test run.');
  }
  console.log('');
}

main();
