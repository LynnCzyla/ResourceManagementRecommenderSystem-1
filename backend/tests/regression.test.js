const supabase = require('../supabase');
const recommendationEngine = require('../services/recommendationService');

async function checkRegression() {
    const reqs = await supabase.from('project_resource_requirements').select('id, project_id').limit(3);
    console.log('Testing requirements:', reqs.data);

    for (const r of reqs.data) {
        try {
            const proj = await supabase
                .from('projects')
                .select('profiles:created_by(branch_id)')
                .eq('id', r.project_id)
                .single();
            const branchId = proj.data?.profiles?.branch_id;
            console.log(`\nEvaluating Requirement ID ${r.id}, Project ${r.project_id}, Branch: ${branchId}`);
            const result = await recommendationEngine.getCandidatesForProject(
                r.project_id,
                { requirementId: r.id },
                branchId,
                false
            );
            console.log(`Requirement ${r.id} success! Total candidates: ${result.data?.candidates?.length}, Top matches: ${result.data?.topCandidates?.length}`);
            if (result.data?.candidates && result.data.candidates.length > 0) {
                console.log(`Top candidate: ${result.data.candidates[0].name}, Score: ${result.data.candidates[0].score}`);
            }
        } catch (e) {
            console.error(`Error for requirement ${r.id}:`, e.message);
        }
    }
}

checkRegression();
