// rating_ranking_demo.js
// -----------------------------------------------------------------------
// SOP 5 mini-experiment, part 2:
// "Show an example where the PM RATING changed the ranking."
//
// For each test project we rank the candidates two ways:
//   BEFORE = as if no PM ratings existed (everyone gets the default
//            performance value, 0.70)
//   AFTER  = the real ranking, using project-manager ratings from
//            performance_records (rating / 5)
// Same skill score + same availability in both. ONLY the performance part
// differs, so any rank change is caused by the PM ratings.
//
// Read-only. Writes nothing to Supabase.
//
// RUN (from the backend folder):
//   node scripts/rating_ranking_demo.js
//   node scripts/rating_ranking_demo.js 23 24 25      (pick project ids)
// Output: printed tables + scripts/rating_ranking_results.csv
// -----------------------------------------------------------------------
const fs = require('fs');
const path = require('path');
const recommendationService = require('../services/recommendationService');

const DEFAULT_PROJECTS = [23, 24, 25, 26, 27, 28, 29, 30, 31, 32];
const MAX_CANDIDATES = 100;
const CSV_PATH = path.join(__dirname, 'rating_ranking_results.csv');

const projectIds = process.argv.slice(2).map(Number).filter(Boolean);
const PROJECTS = projectIds.length ? projectIds : DEFAULT_PROJECTS;

const W = recommendationService.COMPOSITE_WEIGHTS;
const DEFAULT_HP = recommendationService.DEFAULT_HP;

const pct = (x) => `${(x * 100).toFixed(0)}%`;
const f3 = (x) => x.toFixed(3);

function rankWithout(cands) {
  // Same skill + availability, performance replaced by the default value.
  return cands
    .map((c) => ({
      ...c,
      scoreBefore: W.skill * c.matchingScore + W.availability * c.availabilityFactor + W.performance * DEFAULT_HP,
    }))
    .sort((a, b) => b.scoreBefore - a.scoreBefore || a.name.localeCompare(b.name));
}

(async () => {
  const csvRows = [['project_id', 'employee', 'rank_before_no_rating', 'rank_after_with_rating',
    'rank_change', 'pm_rating_avg_of_5', 'perf_before', 'perf_after', 'score_before', 'score_after']];
  const examples = [];
  let projectsChanged = 0;

  for (const pid of PROJECTS) {
    try {
      const res = await recommendationService.getCandidatesForProject(
        pid, { maxCandidates: MAX_CANDIDATES, includeAll: true }, null, true);
      const cands = res?.data?.candidates || [];
      if (cands.length < 2) { console.log(`Project ${pid}: not enough candidates, skipped`); continue; }

      const after = [...cands].sort((a, b) => b.recommendationScore - a.recommendationScore || a.name.localeCompare(b.name));
      const before = rankWithout(cands);
      const rb = new Map(before.map((c, i) => [c.profileId, i + 1]));
      const ra = new Map(after.map((c, i) => [c.profileId, i + 1]));

      let changed = 0;
      for (const c of after) {
        const change = rb.get(c.profileId) - ra.get(c.profileId); // + = moved UP
        if (change !== 0) changed++;
        const sb = before.find((x) => x.profileId === c.profileId).scoreBefore;
        csvRows.push([pid, c.name, rb.get(c.profileId), ra.get(c.profileId), change,
          (c.historicalPerformance * 5).toFixed(2), DEFAULT_HP, c.historicalPerformance, f3(sb), f3(c.recommendationScore)]);
        examples.push({ pid, name: c.name, change, rankBefore: rb.get(c.profileId), rankAfter: ra.get(c.profileId),
          ratingOf5: c.historicalPerformance * 5, hpAfter: c.historicalPerformance,
          scoreBefore: sb, scoreAfter: c.recommendationScore });
      }
      if (changed > 0) projectsChanged++;

      console.log(`\n=== Project ${pid}: ${changed} of ${after.length} candidates changed rank ===`);
      console.log(`${'Employee'.padEnd(26)}${'Before'.padStart(7)}${'After'.padStart(7)}${'Move'.padStart(6)}${'Rating'.padStart(8)}${'Perf%'.padStart(7)}${'ScoreB'.padStart(8)}${'ScoreA'.padStart(8)}`);
      for (const c of after.slice(0, 8)) {
        const ch = rb.get(c.profileId) - ra.get(c.profileId);
        console.log(`${c.name.slice(0, 25).padEnd(26)}${String(rb.get(c.profileId)).padStart(7)}${String(ra.get(c.profileId)).padStart(7)}` +
          `${(ch > 0 ? '+' + ch : String(ch)).padStart(6)}${((c.historicalPerformance * 5).toFixed(1) + '/5').padStart(8)}` +
          `${pct(c.historicalPerformance).padStart(7)}${f3(before.find((x) => x.profileId === c.profileId).scoreBefore).padStart(8)}${f3(c.recommendationScore).padStart(8)}`);
      }
    } catch (e) {
      console.log(`Project ${pid}: error - ${e.message}`);
    }
  }

  fs.writeFileSync(CSV_PATH, csvRows.map((r) => r.map(x => `"${String(x).replace(/"/g, '""')}"`).join(',')).join('\n'));

  const movers = examples.filter((e) => e.change !== 0).sort((a, b) => Math.abs(b.change) - Math.abs(a.change));
  console.log('\n' + '='.repeat(70));
  console.log(`Projects where PM ratings changed the ranking: ${projectsChanged} of ${PROJECTS.length}`);
  if (movers.length) {
    const e = movers[0];
    console.log('\nBEST EXAMPLE FOR THE PAPER:');
    console.log(`  Project ${e.pid}: ${e.name} moved from rank ${e.rankBefore} to rank ${e.rankAfter}`);
    console.log(`  PM rating ${e.ratingOf5.toFixed(1)}/5 -> performance ${pct(e.hpAfter)} (default without ratings: ${pct(DEFAULT_HP)})`);
    console.log(`  Recommendation score ${f3(e.scoreBefore)} -> ${f3(e.scoreAfter)}`);
  } else {
    console.log('No rank changes found. Either no PM ratings are submitted yet for these employees, or the skill gap is too big for the 15% performance weight to matter. Try other projects.');
  }
  console.log(`\nFull rows saved: ${CSV_PATH}`);
  process.exit(0);
})();