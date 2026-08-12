// backend/controllers/resourceManager/recommendationController.js
const recommendationEngine = require('../services/recommendationService');
const supabase = require('../supabase');

/**
 * Get recommendations for a project
 */
exports.getRecommendations = async (req, res) => {
    try {
        const { projectId } = req.params;
        const { minMatchingScore = 0, maxCandidates = 20 } = req.query;

        // Check if user has permission
        const { data: project, error } = await supabase
            .from('projects')
            .select('project_manager_id')
            .eq('id', projectId)
            .single();

        if (error) {
            return res.status(404).json({
                success: false,
                error: 'Project not found'
            });
        }

        const isPM = project.project_manager_id === req.user.id;
        const isRM = req.user.role === 'resource_manager';
        const isAdmin = req.user.role === 'admin';

        if (!isPM && !isRM && !isAdmin) {
            return res.status(403).json({
                success: false,
                error: 'You do not have permission to view recommendations for this project'
            });
        }

        const result = await recommendationEngine.getCandidatesForProject(
            projectId,
            {
                minMatchingScore: parseFloat(minMatchingScore) || 0,
                maxCandidates: parseInt(maxCandidates) || 20
            }
        );

        if (!result.success) {
            return res.status(500).json(result);
        }

        res.json({
            success: true,
            data: result.data,
            message: `Found ${result.data.totalCandidates} candidates`
        });

    } catch (error) {
        console.error('Error getting recommendations:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};

/**
 * Get employee workload status
 */
exports.getEmployeeWorkload = async (req, res) => {
    try {
        const { profileId } = req.params;

        const workload = await recommendationEngine._getWorkloadScore(profileId);
        const availability = recommendationEngine._calculateAvailability(workload);
        const hp = await recommendationEngine._getHistoricalPerformance(profileId);

        // Get active tasks
        const { data: tasks, error } = await supabase
            .from('project_tasks')
            .select(`
                id, 
                title, 
                priority, 
                due_date, 
                project_id,
                projects (name)
            `)
            .eq('profile_id', profileId)
            .in('status', ['Active', 'In Progress']);

        if (error) throw error;

        res.json({
            success: true,
            data: {
                profileId,
                workload: {
                    currentScore: workload,
                    maxScore: 10,
                    availabilityFactor: Math.round(availability * 1000) / 1000,
                    availabilityPercent: Math.round(availability * 100),
                    status: availability >= 0.3 ? 'Available' : 'Overloaded'
                },
                performance: {
                    historicalPerformance: Math.round(hp * 1000) / 1000,
                    averageRating: Math.round((hp * 5) * 100) / 100
                },
                activeTasks: tasks || [],
                taskCount: (tasks || []).length
            }
        });

    } catch (error) {
        console.error('Error getting workload:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};

/**
 * Assign employee to project
 */
exports.assignEmployee = async (req, res) => {
    try {
        const { projectId } = req.params;
        const { profileId, taskTitle, priority = 'Medium', dueDate } = req.body;

        // Validate
        if (!profileId) {
            return res.status(400).json({
                success: false,
                error: 'profileId is required'
            });
        }

        // Check if employee exists
        const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('id, employee_id, first_name, last_name')
            .eq('id', profileId)
            .single();

        if (profileError) {
            return res.status(404).json({
                success: false,
                error: 'Employee not found'
            });
        }

        // Check if project exists
        const { data: project, error: projectError } = await supabase
            .from('projects')
            .select('id, name')
            .eq('id', projectId)
            .single();

        if (projectError) {
            return res.status(404).json({
                success: false,
                error: 'Project not found'
            });
        }

        // Check if already assigned
        const { data: existing } = await supabase
            .from('project_assignments')
            .select('id')
            .eq('project_id', projectId)
            .eq('profile_id', profileId)
            .in('status', ['Active', 'Assigned'])
            .maybeSingle();

        if (existing) {
            return res.status(400).json({
                success: false,
                error: 'Employee already assigned to this project'
            });
        }

        // Check workload
        const workload = await recommendationEngine._getWorkloadScore(profileId);
        const availability = recommendationEngine._calculateAvailability(workload);

        if (availability < 0.2) {
            return res.status(409).json({
                success: false,
                error: 'Employee is over capacity',
                data: {
                    workloadScore: workload,
                    availabilityFactor: availability
                }
            });
        }

        // Create assignment
        const { data: assignment, error: assignError } = await supabase
            .from('project_assignments')
            .insert({
                project_id: projectId,
                profile_id: profileId,
                status: 'Active',
                assigned_by: req.user.id
            })
            .select()
            .single();

        if (assignError) throw assignError;

        // Create task
        const { data: task, error: taskError } = await supabase
            .from('project_tasks')
            .insert({
                project_id: projectId,
                profile_id: profileId,
                title: taskTitle || `Assignment for ${project.name}`,
                priority: priority,
                status: 'Active',
                due_date: dueDate || null,
                created_by: req.user.id
            })
            .select()
            .single();

        if (taskError) throw taskError;

        res.json({
            success: true,
            data: {
                assignment,
                task,
                employee: profile,
                project
            },
            message: `Successfully assigned ${profile.first_name} ${profile.last_name} to ${project.name}`
        });

    } catch (error) {
        console.error('Error assigning employee:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};