// backend/routes/ResourceManager/assignments.js
const express = require('express');
const router = express.Router();
const supabase = require('../../supabase');

console.log('✅ assignments route loaded');

// GET /api/rm/assignments
router.get('/', async (req, res) => {
    try {
        console.log('📋 Fetching assignments...');
        
        const { data, error } = await supabase
            .from('project_assignments')
            .select(`
                id,
                project_id,
                profile_id,
                requirement_id,
                assigned_role,
                start_date,
                end_date,
                status,
                assigned_by,
                assigned_at
            `)
            .eq('status', 'Assigned')
            .order('assigned_at', { ascending: false });

        if (error) {
            console.error('❌ Error fetching assignments:', error);
            return res.status(500).json({ error: error.message });
        }

        // Transform data
        const transformedData = await Promise.all((data || []).map(async (item) => {
            let projectName = null;
            let employeeName = null;
            let employeeEmail = null;

            // Get project name
            if (item.project_id) {
                const { data: projectData } = await supabase
                    .from('projects')
                    .select('project_name')
                    .eq('id', item.project_id)
                    .single();
                projectName = projectData?.project_name || null;
            }

            // Get employee name
            if (item.profile_id) {
                const { data: profileData } = await supabase
                    .from('profiles')
                    .select('first_name, middle_name, last_name, employee_id')
                    .eq('id', item.profile_id)
                    .single();
                employeeName = profileData
                    ? `${profileData.first_name || ''}${profileData.middle_name ? ` ${profileData.middle_name}` : ''} ${profileData.last_name || ''}`.trim()
                    : null;
                employeeEmail = null;
            }

            return {
                id: item.id,
                project_id: item.project_id,
                profile_id: item.profile_id,
                requirement_id: item.requirement_id,
                assigned_role: item.assigned_role,
                start_date: item.start_date,
                end_date: item.end_date,
                status: item.status,
                assigned_by: item.assigned_by,
                assigned_at: item.assigned_at,
                projectName: projectName,
                employeeName: employeeName,
                employeeEmail: employeeEmail
            };
        }));

        console.log(`✅ Found ${transformedData.length} assignments`);
        res.json(transformedData);
    } catch (error) {
        console.error('❌ Error in assignments route:', error);
        res.status(500).json({ 
            error: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
});

// POST /api/rm/assignments
router.post('/', async (req, res) => {
    try {
        const {
            project_id,
            profile_id,
            requirement_id,
            assigned_role,
            start_date,
            end_date,
            status = 'Assigned'
        } = req.body;

        console.log(`📋 Creating assignment for requirement ${requirement_id}...`);

        // Check if already assigned to this project
        const { data: existing, error: checkError } = await supabase
            .from('project_assignments')
            .select('id')
            .eq('project_id', project_id)
            .eq('profile_id', profile_id)
            .eq('status', 'Assigned');

        if (checkError) {
            console.error('❌ Check error:', checkError);
            return res.status(500).json({ error: checkError.message });
        }

        if (existing && existing.length > 0) {
            return res.status(400).json({ error: 'Employee is already assigned to this project' });
        }

        // Create assignment
        const { data, error } = await supabase
            .from('project_assignments')
            .insert({
                project_id,
                profile_id,
                requirement_id,
                assigned_role,
                start_date,
                end_date,
                status,
                assigned_by: req.user?.id || null,
                assigned_at: new Date().toISOString()
            })
            .select()
            .single();

        if (error) {
            console.error('❌ Insert error:', error);
            return res.status(500).json({ error: error.message });
        }

        // Check if requirement is fully assigned
        const { data: assignments, error: countError } = await supabase
            .from('project_assignments')
            .select('id', { count: 'exact' })
            .eq('requirement_id', requirement_id)
            .eq('status', 'Assigned');

        if (countError) {
            console.error('❌ Count error:', countError);
        } else {
            const assignedCount = assignments.length;

            // Get quantity needed
            const { data: requirement, error: reqError } = await supabase
                .from('project_resource_requirements')
                .select('quantity_needed')
                .eq('id', requirement_id)
                .single();

            if (!reqError && requirement) {
                const quantityNeeded = requirement?.quantity_needed || 1;

                // Mark requirement as Filled if fully assigned
                if (assignedCount >= quantityNeeded) {
                    const { error: updateReqErr } = await supabase
                        .from('project_resource_requirements')
                        .update({ 
                            status: 'Filled'
                        })
                        .eq('id', requirement_id);

                    if (updateReqErr) {
                        console.error('❌ Error updating requirement status to Filled:', updateReqErr);
                    } else {
                        console.log(`✅ Requirement ${requirement_id} marked as Filled`);
                    }
                }
            }
        }

        // Cross-role notifications: notify assigned employee & PM
        try {
            let projectName = 'a project';
            let projectOwner = null;
            if (project_id) {
                const { data: proj } = await supabase
                    .from('projects')
                    .select('project_name, created_by')
                    .eq('id', project_id)
                    .single();
                if (proj) {
                    projectName = proj.project_name;
                    projectOwner = proj.created_by;
                }
            }

            let empName = 'An employee';
            if (profile_id) {
                const { data: empProf } = await supabase
                    .from('profiles')
                    .select('first_name, last_name')
                    .eq('id', profile_id)
                    .single();
                if (empProf) {
                    empName = `${empProf.first_name || ''} ${empProf.last_name || ''}`.trim();
                }
            }

            const notifs = [
                {
                    recipient_id: profile_id,
                    type: 'assignment',
                    text: `You have been assigned to project "${projectName}" as ${assigned_role || 'team member'}.`,
                    read: false
                }
            ];
            if (projectOwner && projectOwner !== req.user?.id) {
                notifs.push({
                    recipient_id: projectOwner,
                    type: 'assignment',
                    text: `${empName} has been assigned to your project "${projectName}" as ${assigned_role || 'team member'}.`,
                    read: false
                });
            }
            await supabase.from('notifications').insert(notifs);
        } catch (notifErr) {
            console.error('Non-fatal error creating assignment notifications:', notifErr.message);
        }

        try {
            const { clearDashboardCache } = require('./Dashboard');
            const { clearEmployeeCache } = require('./Employees');
            const { clearProjectsCache } = require('./Projects');
            if (clearDashboardCache) clearDashboardCache();
            if (clearEmployeeCache) clearEmployeeCache();
            if (clearProjectsCache) clearProjectsCache();
        } catch (cErr) {
            console.warn('Non-fatal cache clearing error in assignments:', cErr.message);
        }

        res.status(201).json(data);
    } catch (error) {
        console.error('❌ Error creating assignment:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;