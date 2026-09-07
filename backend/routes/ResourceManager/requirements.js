// backend/routes/ResourceManager/requirements.js
const express = require('express');
const router = express.Router();
const supabase = require('../../supabase');

console.log('✅ requirements route loaded');

// GET /api/rm/requirements - WITH BRANCH FILTERING
router.get('/', async (req, res) => {
    console.log('📋 Fetching requirements...');
    try {
        const userBranchId = req.user?.branch_id;
        const isSuperAdmin = req.user?.is_super_admin || false;
        const userId = req.user?.id;

        console.log(`📋 Fetching requirements for user ${userId}`);
        console.log(`🏢 Branch filter: ${isSuperAdmin ? 'ALL' : userBranchId}`);

        // For Super Admin, get all requirements
        if (isSuperAdmin) {
            const { data, error } = await supabase
                .from('project_resource_requirements')
                .select(`
                    *,
                    projects:project_id (
                        id,
                        project_name,
                        project_code,
                        status,
                        created_by,
                        profiles:created_by (
                            id,
                            first_name,
                            last_name,
                            branch_id
                        )
                    )
                `)
                .not('status', 'in', '("Cancelled","Canceled","Completed","Done")')
                .order('created_at', { ascending: false });

            if (error) {
                console.error('❌ Error fetching requirements:', error);
                return res.status(500).json({
                    success: false,
                    error: error.message
                });
            }

            // Transform data
            const transformedData = await transformRequirements(data);
            console.log(`✅ Found ${transformedData.length} requirements (Super Admin)`);
            return res.json(transformedData);
        }

        // For non-super admins, get requirements from their branch
        // Step 1: Get all users in this branch
        const { data: branchUsers, error: userError } = await supabase
            .from('profiles')
            .select('id')
            .eq('branch_id', userBranchId)
            .eq('status', 'Active');

        if (userError) {
            console.error('❌ Error fetching branch users:', userError);
            return res.status(500).json({
                success: false,
                error: userError.message
            });
        }

        const userIds = branchUsers.map(u => u.id);
        console.log(`📁 Found ${userIds.length} users in branch`);

        if (userIds.length === 0) {
            console.log('✅ No users found in branch');
            return res.json([]);
        }

        // Step 2: Get active projects created by users in this branch
        const { data: branchProjects, error: projectError } = await supabase
            .from('projects')
            .select('id, status')
            .in('created_by', userIds)
            .neq('status', 'Completed')
            .neq('status', 'Archived');

        if (projectError) {
            console.error('❌ Error fetching branch projects:', projectError);
            return res.status(500).json({
                success: false,
                error: projectError.message
            });
        }

        const projectIds = (branchProjects || []).map(p => p.id);
        console.log(`📁 Found ${projectIds.length} active projects in branch`);

        if (projectIds.length === 0) {
            console.log('✅ No active projects found in branch');
            return res.json([]);
        }

        // Step 3: Get requirements for these projects
        const { data, error } = await supabase
            .from('project_resource_requirements')
            .select(`
                *,
                projects:project_id (
                    id,
                    project_name,
                    project_code,
                    status,
                    created_by,
                    profiles:created_by (
                        id,
                        first_name,
                        last_name,
                        branch_id
                    )
                )
            `)
            .in('project_id', projectIds)
            .not('status', 'in', '("Cancelled","Canceled","Completed","Done")')
            .order('created_at', { ascending: false });

        if (error) {
            console.error('❌ Error fetching requirements:', error);
            return res.status(500).json({
                success: false,
                error: error.message
            });
        }

        // Transform data
        const transformedData = await transformRequirements(data || []);
        console.log(`✅ Found ${transformedData.length} requirements for branch ${userBranchId}`);

        res.json(transformedData);
    } catch (error) {
        console.error('❌ Error in requirements route:', error);
        res.status(500).json({
            success: false,
            error: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
});

// Helper function to transform requirements data
async function transformRequirements(data) {
    if (!data || data.length === 0) return [];

    // Filter out requirements for completed or archived projects or completed/cancelled requirements
    const activeData = (data || []).filter(item => {
        const projStatus = item.projects?.status;
        if (projStatus === 'Completed' || projStatus === 'Archived') return false;
        if (['Cancelled', 'Canceled', 'Completed', 'Done'].includes(item.status)) return false;
        return true;
    });

    if (activeData.length === 0) return [];

    const transformedData = await Promise.all(activeData.map(async (item) => {
        // Get skills for this requirement
        let skills = [];
        try {
            const { data: skillsData } = await supabase
                .from('requirement_skills')
                .select('skills')
                .eq('requirement_id', item.id);
            skills = skillsData?.map(s => s.skills).filter(Boolean) || [];
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
            priority: item.priority || 'Medium',
            created_at: item.created_at || null,
            updated_at: item.updated_at || null,
            created_by: item.created_by || null,
            projectName: item.projects?.project_name || null,
            projectCode: item.projects?.project_code || null,
            projectStatus: item.projects?.status || null,
            skills: skills,
            // Include branch info for debugging
            _branchId: item.projects?.profiles?.branch_id || null,
            _createdBy: item.projects?.created_by || null
        };
    }));

    return transformedData;
}

// GET /api/rm/requirements/:id - WITH BRANCH CHECK
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const userBranchId = req.user?.branch_id;
        const isSuperAdmin = req.user?.is_super_admin || false;
        
        console.log(`📋 Fetching requirement ${id}...`);
        console.log(`🏢 User branch: ${isSuperAdmin ? 'ALL' : userBranchId}`);
        
        const { data, error } = await supabase
            .from('project_resource_requirements')
            .select(`
                *,
                projects:project_id (
                    id,
                    project_name,
                    project_code,
                    created_by,
                    profiles:created_by (
                        id,
                        first_name,
                        last_name,
                        branch_id
                    )
                )
            `)
            .eq('id', id)
            .single();

        if (error) {
            console.error('❌ Error fetching requirement:', error);
            return res.status(500).json({ 
                success: false,
                error: error.message 
            });
        }

        if (!data) {
            return res.status(404).json({ 
                success: false,
                error: 'Requirement not found' 
            });
        }

        const projectBranchId = data.projects?.profiles?.branch_id;

        // ✅ Check if user has access to this requirement
        if (!isSuperAdmin && projectBranchId !== userBranchId) {
            console.warn(`❌ Access denied: Project branch ${projectBranchId} != User branch ${userBranchId}`);
            return res.status(403).json({
                success: false,
                error: 'You do not have permission to view this requirement'
            });
        }

        // Get skills
        let skills = [];
        const { data: skillsData } = await supabase
            .from('requirement_skills')
            .select('skills')
            .eq('requirement_id', data.id);
        skills = skillsData?.map(s => s.skills).filter(Boolean) || [];

        const transformedData = {
            id: data.id,
            project_id: data.project_id,
            quantity: data.quantity_needed || data.quantity || 1,
            role_title: data.role_title || null,
            justification: data.justification || null,
            start_date: data.start_date || null,
            end_date: data.end_date || null,
            status: data.status || 'Pending',
            priority: data.priority || 'Medium',
            created_at: data.created_at || null,
            updated_at: data.updated_at || null,
            created_by: data.created_by || null,
            projectName: data.projects?.project_name || null,
            projectCode: data.projects?.project_code || null,
            skills: skills,
            // Include branch info
            branchId: projectBranchId
        };

        console.log(`✅ Requirement ${id} fetched successfully`);
        res.json(transformedData);
    } catch (error) {
        console.error('❌ Error fetching requirement:', error);
        res.status(500).json({ 
            success: false,
            error: error.message 
        });
    }
});

// PUT /api/rm/requirements/:id/status - WITH BRANCH CHECK
router.put('/:id/status', async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        const userBranchId = req.user?.branch_id;
        const isSuperAdmin = req.user?.is_super_admin || false;
        
        console.log(`📋 Updating requirement ${id} to ${status}...`);
        
        // First, check if user has access to this requirement
        const { data: requirement, error: reqError } = await supabase
            .from('project_resource_requirements')
            .select(`
                id,
                projects:project_id (
                    created_by,
                    profiles:created_by (
                        branch_id
                    )
                )
            `)
            .eq('id', id)
            .single();

        if (reqError || !requirement) {
            return res.status(404).json({ 
                success: false,
                error: 'Requirement not found' 
            });
        }

        const projectBranchId = requirement.projects?.profiles?.branch_id;

        // ✅ Check if user has access to update this requirement
        if (!isSuperAdmin && projectBranchId !== userBranchId) {
            console.warn(`❌ Access denied: Project branch ${projectBranchId} != User branch ${userBranchId}`);
            return res.status(403).json({
                success: false,
                error: 'You do not have permission to update this requirement'
            });
        }
        
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
            return res.status(500).json({ 
                success: false,
                error: error.message 
            });
        }

        console.log(`✅ Requirement ${id} updated to ${status}`);
        res.json({
            success: true,
            data: data,
            message: `Requirement status updated to ${status}`
        });
    } catch (error) {
        console.error('❌ Error updating requirement:', error);
        res.status(500).json({ 
            success: false,
            error: error.message 
        });
    }
});

// POST /api/rm/requirements - Create requirement WITH BRANCH CHECK
router.post('/', async (req, res) => {
    try {
        const { project_id, role_title, quantity, skills, justification, priority } = req.body;
        const userId = req.user?.id;
        const userBranchId = req.user?.branch_id;
        const isSuperAdmin = req.user?.is_super_admin || false;

        console.log(`📋 Creating requirement for project ${project_id}`);

        if (!project_id || !role_title || !quantity) {
            return res.status(400).json({
                success: false,
                error: 'Project ID, role title, and quantity are required'
            });
        }

        // Check if project exists and user has access
        const { data: project, error: projectError } = await supabase
            .from('projects')
            .select(`
                id,
                created_by,
                profiles:created_by (
                    branch_id
                )
            `)
            .eq('id', project_id)
            .single();

        if (projectError || !project) {
            return res.status(404).json({
                success: false,
                error: 'Project not found'
            });
        }

        const projectBranchId = project.profiles?.branch_id;

        // ✅ Check if user has access to create requirements for this project
        if (!isSuperAdmin && projectBranchId !== userBranchId) {
            console.warn(`❌ Access denied: Project branch ${projectBranchId} != User branch ${userBranchId}`);
            return res.status(403).json({
                success: false,
                error: 'You do not have permission to create requirements for this project'
            });
        }

        const { data, error } = await supabase
            .from('project_resource_requirements')
            .insert({
                project_id,
                role_title,
                quantity_needed: quantity,
                justification: justification || null,
                priority: priority || 'Medium',
                status: 'Open',
                created_by: userId,
                created_at: new Date().toISOString()
            })
            .select()
            .single();

        if (error) {
            console.error('❌ Error creating requirement:', error);
            return res.status(500).json({
                success: false,
                error: error.message
            });
        }

        // If skills provided, add them
        if (skills && skills.length > 0) {
            const skillInserts = skills.map(skill => ({
                requirement_id: data.id,
                skills: skill
            }));

            const { error: skillError } = await supabase
                .from('requirement_skills')
                .insert(skillInserts);

            if (skillError) {
                console.error('❌ Error adding skills:', skillError);
                // Don't fail the whole request, just log the error
            }
        }

        console.log(`✅ Requirement created with ID: ${data.id}`);
        res.json({
            success: true,
            data: data,
            message: 'Requirement created successfully'
        });
    } catch (error) {
        console.error('❌ Error creating requirement:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// DELETE /api/rm/requirements/:id - WITH BRANCH CHECK
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const userBranchId = req.user?.branch_id;
        const isSuperAdmin = req.user?.is_super_admin || false;

        // First, check if user has access to this requirement
        const { data: requirement, error: reqError } = await supabase
            .from('project_resource_requirements')
            .select(`
                id,
                projects:project_id (
                    created_by,
                    profiles:created_by (
                        branch_id
                    )
                )
            `)
            .eq('id', id)
            .single();

        if (reqError || !requirement) {
            return res.status(404).json({
                success: false,
                error: 'Requirement not found'
            });
        }

        const projectBranchId = requirement.projects?.profiles?.branch_id;

        // ✅ Check if user has access to delete this requirement
        if (!isSuperAdmin && projectBranchId !== userBranchId) {
            console.warn(`❌ Access denied: Project branch ${projectBranchId} != User branch ${userBranchId}`);
            return res.status(403).json({
                success: false,
                error: 'You do not have permission to delete this requirement'
            });
        }

        // Delete skills first (foreign key constraint)
        await supabase
            .from('requirement_skills')
            .delete()
            .eq('requirement_id', id);

        // Delete requirement
        const { error } = await supabase
            .from('project_resource_requirements')
            .delete()
            .eq('id', id);

        if (error) {
            console.error('❌ Error deleting requirement:', error);
            return res.status(500).json({
                success: false,
                error: error.message
            });
        }

        console.log(`✅ Requirement ${id} deleted`);
        res.json({
            success: true,
            message: 'Requirement deleted successfully'
        });
    } catch (error) {
        console.error('❌ Error deleting requirement:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

module.exports = router;