// backend/routes/ResourceManager/requirements.js
const express = require('express');
const router = express.Router();
const supabase = require('../../supabase');

console.log('✅ requirements route loaded');

// GET /api/rm/requirements
router.get('/', async (req, res) => {
    console.log('📋 Fetching requirements...');
    try {
        // First, try to get requirements without joins
        const { data, error } = await supabase
            .from('project_resource_requirements')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) {
            console.error('❌ Error fetching requirements:', error);
            return res.status(500).json({ error: error.message });
        }

        if (!data || data.length === 0) {
            console.log('✅ No requirements found');
            return res.json([]);
        }

        // Transform the data
        const transformedData = await Promise.all(data.map(async (item) => {
            // Get project name
            let projectName = null;
            if (item.project_id) {
                try {
                    const { data: projectData } = await supabase
                        .from('projects')
                        .select('project_name')
                        .eq('id', item.project_id)
                        .single();
                    projectName = projectData?.project_name || null;
                } catch (err) {
                    console.warn(`⚠️ Could not fetch project for ID ${item.project_id}:`, err.message);
                }
            }

            // Get skills
            let skills = [];
            try {
                const { data: skillsData } = await supabase
                    .from('requirement_skills')
                    .select('skills')
                    .eq('requirement_id', item.id);
                skills = skillsData?.map(s => s.skills) || [];
            } catch (err) {
                console.warn(`⚠️ Could not fetch skills for requirement ${item.id}:`, err.message);
            }

            return {
                id: item.id,
                project_id: item.project_id,
                quantity: item.quantity_needed || item.quantity || 1,
                role_title: item.role_title || null,
                justification: item.justification || null,
                start_date: item.start_date || null,
                end_date: item.end_date || null,
                status: item.status || 'Pending',
                created_at: item.created_at || null,
                projectName: projectName,
                skills: skills
            };
        }));

        console.log(`✅ Found ${transformedData.length} requirements`);
        res.json(transformedData);
    } catch (error) {
        console.error('❌ Error in requirements route:', error);
        res.status(500).json({ 
            error: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
});

// GET /api/rm/requirements/:id
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        console.log(`📋 Fetching requirement ${id}...`);
        
        const { data, error } = await supabase
            .from('project_resource_requirements')
            .select('*')
            .eq('id', id)
            .single();

        if (error) {
            console.error('❌ Error fetching requirement:', error);
            return res.status(500).json({ error: error.message });
        }

        if (!data) {
            return res.status(404).json({ error: 'Requirement not found' });
        }

        // Get project name
        let projectName = null;
        if (data.project_id) {
            const { data: projectData } = await supabase
                .from('projects')
                .select('project_name')
                .eq('id', data.project_id)
                .single();
            projectName = projectData?.project_name || null;
        }

        // Get skills
        let skills = [];
        const { data: skillsData } = await supabase
            .from('requirement_skills')
            .select('skills')
            .eq('requirement_id', data.id);
        skills = skillsData?.map(s => s.skills) || [];

        const transformedData = {
            id: data.id,
            project_id: data.project_id,
            quantity: data.quantity_needed || data.quantity || 1,
            role_title: data.role_title || null,
            justification: data.justification || null,
            start_date: data.start_date || null,
            end_date: data.end_date || null,
            status: data.status || 'Pending',
            created_at: data.created_at || null,
            projectName: projectName,
            skills: skills
        };

        res.json(transformedData);
    } catch (error) {
        console.error('❌ Error fetching requirement:', error);
        res.status(500).json({ error: error.message });
    }
});

// PUT /api/rm/requirements/:id/status
router.put('/:id/status', async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        
        console.log(`📋 Updating requirement ${id} to ${status}...`);
        
        const { data, error } = await supabase
            .from('project_resource_requirements')
            .update({ 
                status: status,
                updated_at: new Date().toISOString()
            })
            .eq('id', id)
            .select()
            .single();

        if (error) {
            console.error('❌ Update error:', error);
            return res.status(500).json({ error: error.message });
        }

        if (!data) {
            return res.status(404).json({ error: 'Requirement not found' });
        }

        console.log(`✅ Requirement ${id} updated to ${status}`);
        res.json(data);
    } catch (error) {
        console.error('❌ Error updating requirement:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;