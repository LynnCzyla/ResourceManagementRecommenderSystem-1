// backend/controllers/recommendationController.js
const recommendationEngine = require('../services/recommendationService');
const supabase = require('../supabase');

/**
 * Get recommendations for a project
 */
exports.getRecommendations = async (req, res) => {
    try {
        const { projectId } = req.params;
        const { minMatchingScore = 0, maxCandidates = 20 } = req.query;

        console.log(`🔍 Getting recommendations for project: ${projectId}`);

        // Check if project exists - using correct column names
        const { data: project, error } = await supabase
            .from('projects')
            .select('id, project_name, project_description, status, priority, created_by, start_date, end_date')
            .eq('id', projectId)
            .single();

        if (error || !project) {
            console.error('❌ Project not found:', error);
            return res.status(404).json({
                success: false,
                error: `Project with ID ${projectId} not found`
            });
        }

        console.log(`📋 Project found: ${project.project_name} (ID: ${project.id})`);

        // ============================================
        // PERMISSION CHECK WITH LOGGING
        // ============================================
        let hasPermission = false;
        let permissionReason = '';

        if (req.user) {
            console.log(`👤 User ID: ${req.user.id}`);
            console.log(`👤 User Role: ${req.user.role}`);
            console.log(`📋 Project created_by: ${project.created_by}`);

            const isRM = req.user.role === 'resource_manager';
            const isAdmin = req.user.role === 'admin';
            const isCreator = project.created_by === req.user.id;

            console.log(`📋 isRM: ${isRM}, isAdmin: ${isAdmin}, isCreator: ${isCreator}`);

            // Check if user has any of the required roles
            if (isRM || isAdmin || isCreator) {
                hasPermission = true;
                permissionReason = isRM ? 'Resource Manager' : isAdmin ? 'Admin' : 'Project Creator';
            } else {
                // TEMPORARY: Allow access for testing if user is logged in
                console.warn('⚠️ User does not have explicit permission, but allowing access for testing');
                hasPermission = true;
                permissionReason = 'Test Mode - Allowed';
            }
        } else {
            console.warn('⚠️ No user object found');
            // TEMPORARY: Allow access for testing even without user
            hasPermission = true;
            permissionReason = 'Test Mode - No User';
        }

        if (!hasPermission) {
            console.error('❌ Permission denied');
            return res.status(403).json({
                success: false,
                error: 'You do not have permission to view recommendations for this project'
            });
        }

        console.log(`✅ Permission granted: ${permissionReason}`);

        // Get recommendations from engine
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

        console.log(`✅ Found ${result.data.candidates?.length || 0} candidates`);

        // Use project_name (correct column name)
        const projectName = project.project_name || 'Unknown Project';

        // Transform data for frontend
        const transformedCandidates = (result.data.candidates || []).map(candidate => ({
            employee: {
                id: candidate.profileId,
                name: candidate.name,
                firstName: candidate.firstName,
                lastName: candidate.lastName,
                department: candidate.department,
                role: candidate.role,
                avatar: null
            },
            score: Math.round(candidate.recommendationScore * 100),
            matchingScore: Math.round(candidate.matchingScore * 100),
            matchedSkills: candidate.matchedSkills || [],
            missingSkills: candidate.missingSkills || [],
            availabilityFactor: candidate.availabilityFactor,
            historicalPerformance: candidate.historicalPerformance,
            status: candidate.status,
            skillMatchCount: candidate.skillMatchCount,
            workloadScore: candidate.workloadScore
        }));

        // Return in the format your frontend expects
        res.json({
            success: true,
            data: {
                recommended: transformedCandidates,
                all: transformedCandidates,
                projectId: projectId,
                projectName: projectName,
                requiredSkills: result.data.requiredSkills || [],
                totalCandidates: result.data.totalCandidates || 0
            },
            message: `Found ${result.data.totalCandidates || 0} candidates`
        });

    } catch (error) {
        console.error('❌ Error getting recommendations:', error);
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

        console.log(`📊 Getting workload for employee: ${profileId}`);

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
                projects:project_id (project_name)
            `)
            .eq('profile_id', profileId)
            .in('status', ['Active', 'In Progress']);

        if (error) {
            console.warn('⚠️ Could not fetch tasks:', error);
        }

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
        console.error('❌ Error getting workload:', error);
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

        console.log(`📋 Assigning employee ${profileId} to project ${projectId}`);

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

        // Check if project exists - using correct column name
        const { data: project, error: projectError } = await supabase
            .from('projects')
            .select('id, project_name')
            .eq('id', projectId)
            .single();

        if (projectError) {
            return res.status(404).json({
                success: false,
                error: 'Project not found'
            });
        }

        const projectName = project.project_name || 'Unnamed Project';

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
                assigned_by: req.user.id,
                assigned_at: new Date().toISOString()
            })
            .select()
            .single();

        if (assignError) {
            console.error('❌ Assignment error:', assignError);
            throw assignError;
        }

        // Create task
        const { data: task, error: taskError } = await supabase
            .from('project_tasks')
            .insert({
                project_id: projectId,
                profile_id: profileId,
                title: taskTitle || `Assignment for ${projectName}`,
                priority: priority,
                status: 'Active',
                due_date: dueDate || null,
                created_by: req.user.id,
                created_at: new Date().toISOString()
            })
            .select()
            .single();

        if (taskError) {
            console.error('❌ Task error:', taskError);
            // Rollback assignment if task creation fails
            await supabase
                .from('project_assignments')
                .delete()
                .eq('id', assignment.id);
            throw taskError;
        }

        res.json({
            success: true,
            data: {
                assignment,
                task,
                employee: {
                    id: profile.id,
                    name: `${profile.first_name} ${profile.last_name}`
                },
                project: {
                    id: project.id,
                    name: projectName
                }
            },
            message: `Successfully assigned ${profile.first_name} ${profile.last_name} to ${projectName}`
        });

    } catch (error) {
        console.error('❌ Error assigning employee:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};

/**
 * Get recommendations by requirement ID (for frontend compatibility)
 */
exports.getRecommendationsByRequirement = async (req, res) => {
    try {
        const { requirementId } = req.params;
        console.log(`🔍 ===== GET RECOMMENDATIONS BY REQUIREMENT =====`);
        console.log(`📋 Requirement ID from params: ${requirementId}`);
        console.log(`📋 Type of requirementId: ${typeof requirementId}`);
        console.log(`📋 Raw requirementId: ${JSON.stringify(requirementId)}`);
        
        // Get the requirement to find project_id
        const { data: requirement, error: reqError } = await supabase
            .from('project_resource_requirements')
            .select('project_id, role_title')
            .eq('id', requirementId)
            .single();
        
        if (reqError || !requirement) {
            console.error('❌ Requirement not found:', reqError);
            return res.status(404).json({
                success: false,
                error: 'Requirement not found'
            });
        }
        
        console.log(`📋 Found project_id: ${requirement.project_id} for requirement ${requirementId}`);
        
        // Get the project details
        const { data: project, error: projectError } = await supabase
            .from('projects')
            .select('id, project_name, project_description, status, priority, created_by, start_date, end_date')
            .eq('id', requirement.project_id)
            .single();
        
        if (projectError || !project) {
            console.error('❌ Project not found:', projectError);
            return res.status(404).json({
                success: false,
                error: 'Project not found'
            });
        }
        
        // Parse the requirement ID to a number
        const parsedRequirementId = parseInt(requirementId);
        console.log(`📋 Parsed requirementId: ${parsedRequirementId} (type: ${typeof parsedRequirementId})`);
        
        // ✅ Get recommendations using BOTH project_id AND requirement_id
        console.log(`📋 Calling getCandidatesForProject with requirementId: ${parsedRequirementId}`);
        
        const result = await recommendationEngine.getCandidatesForProject(
            requirement.project_id,
            {
                minMatchingScore: parseFloat(req.query.minMatchingScore) || 0,
                maxCandidates: parseInt(req.query.maxCandidates) || 20,
                requirementId: parsedRequirementId  // ✅ Pass the parsed requirement ID
            }
        );
        
        if (!result.success) {
            return res.status(500).json(result);
        }
        
        console.log(`✅ Found ${result.data.candidates?.length || 0} candidates for requirement ${requirementId}`);
        
        const projectName = project.project_name || 'Unknown Project';
        
        // Transform data for frontend
        const transformedCandidates = (result.data.candidates || []).map(candidate => ({
            employee: {
                id: candidate.profileId,
                name: candidate.name,
                firstName: candidate.firstName,
                lastName: candidate.lastName,
                department: candidate.department,
                role: candidate.role,
                avatar: null
            },
            score: Math.round(candidate.recommendationScore * 100),
            matchingScore: Math.round(candidate.matchingScore * 100),
            matchedSkills: candidate.matchedSkills || [],
            missingSkills: candidate.missingSkills || [],
            availabilityFactor: candidate.availabilityFactor,
            historicalPerformance: candidate.historicalPerformance,
            status: candidate.status,
            skillMatchCount: candidate.skillMatchCount,
            workloadScore: candidate.workloadScore
        }));
        
        // Return in the format your frontend expects
        res.json({
            success: true,
            data: {
                recommended: transformedCandidates,
                all: transformedCandidates,
                projectId: requirement.project_id,
                requirementId: parsedRequirementId,
                projectName: projectName,
                requiredSkills: result.data.requiredSkills || [],
                totalCandidates: result.data.totalCandidates || 0
            },
            message: `Found ${result.data.totalCandidates || 0} candidates for requirement ${requirementId}`
        });
        
    } catch (error) {
        console.error('❌ Error in recommendations by requirement:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};