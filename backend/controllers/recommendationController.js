// backend/controllers/recommendationController.js
const recommendationEngine = require('../services/recommendationService');
const supabase = require('../supabase');

/**
 * ✅ NEW: single source of truth for "does this user have branch access to
 * this resource" — used by every endpoint below instead of each endpoint
 * re-implementing its own (previously inconsistent) check.
 *
 * Returns { allowed: true } or { allowed: false, statusCode, error }.
 *
 * Critical fix vs. the old per-endpoint checks: this ALWAYS evaluates the
 * branch comparison for non-super-admins. The old pattern
 * `if (!isSuperAdmin && userBranchId) { ...check... }` silently skipped
 * the entire check — and therefore granted access — whenever the
 * requesting user had no branch_id assigned (null/undefined). That is
 * closed here: no userBranchId now results in an explicit denial.
 */
function checkBranchAccess({ isSuperAdmin, userBranchId, resourceBranchId, resourceLabel = 'resource' }) {
    if (isSuperAdmin) {
        return { allowed: true, reason: 'Super Admin' };
    }
    if (!resourceBranchId) {
        return {
            allowed: false,
            statusCode: 403,
            error: `This ${resourceLabel}'s owner is not assigned to any branch. Please contact an administrator.`
        };
    }
    if (!userBranchId) {
        return {
            allowed: false,
            statusCode: 403,
            error: 'Your account is not assigned to any branch. Please contact an administrator.'
        };
    }
    if (resourceBranchId !== userBranchId) {
        return {
            allowed: false,
            statusCode: 403,
            error: `You can only access ${resourceLabel}s from your branch`
        };
    }
    return { allowed: true, reason: 'Same Branch' };
}

/**
 * Get recommendations for a project
 */
exports.getRecommendations = async (req, res) => {
    try {
        const { projectId } = req.params;
        const { minMatchingScore = 0, maxCandidates = 20 } = req.query;

        console.log(`🔍 Getting recommendations for project: ${projectId}`);

        const userBranchId = req.user?.branch_id;
        const isSuperAdmin = req.user?.is_super_admin || false;
        const userRole = req.user?.role;

        console.log(`👤 User: ${req.user?.employee_id} (${userRole})`);
        console.log(`🏢 User Branch: ${isSuperAdmin ? 'ALL' : userBranchId}`);

        if (!req.user) {
            console.warn('⚠️ No user authenticated');
            return res.status(401).json({
                success: false,
                error: 'Authentication required'
            });
        }

        const { data: project, error } = await supabase
            .from('projects')
            .select(`
                id, 
                project_name, 
                project_description, 
                status, 
                priority, 
                created_by, 
                start_date, 
                end_date,
                profiles:created_by (
                    branch_id
                )
            `)
            .eq('id', projectId)
            .single();

        if (error || !project) {
            console.error('❌ Project not found:', error);
            return res.status(404).json({
                success: false,
                error: `Project with ID ${projectId} not found`
            });
        }

        const projectBranchId = project.profiles?.branch_id;
        const projectCreatorId = project.created_by;

        console.log(`📋 Project found: ${project.project_name} (ID: ${project.id})`);
        console.log(`🏢 Project creator's branch: ${projectBranchId || 'No branch assigned'}`);

        // ============================================
        // ✅ UNIFIED PERMISSION CHECK (see checkBranchAccess above)
        // ============================================
        let hasPermission = false;
        let permissionReason = '';

        if (isSuperAdmin) {
            hasPermission = true;
            permissionReason = 'Super Admin';
            console.log('✅ Super Admin - Full access');
        } else if (userRole === 'resource_manager' || userRole === 'admin' || userRole === 'Administrator') {
            const access = checkBranchAccess({
                isSuperAdmin,
                userBranchId,
                resourceBranchId: projectBranchId,
                resourceLabel: 'project'
            });
            if (!access.allowed) {
                console.warn(`❌ ${userRole} denied: ${access.error}`);
                return res.status(access.statusCode).json({
                    success: false,
                    error: access.error
                });
            }
            hasPermission = true;
            permissionReason = `${userRole} (Same Branch)`;
            console.log(`✅ ${userRole} - Same branch access`);
        } else if (projectCreatorId === req.user.id) {
            hasPermission = true;
            permissionReason = 'Project Creator';
            console.log('✅ Project Creator - Own project access');
        } else {
            console.warn(`❌ Access denied for user ${req.user.id} to project ${projectId}`);
            return res.status(403).json({
                success: false,
                error: 'You do not have permission to view recommendations for this project'
            });
        }

        console.log(`✅ Permission granted: ${permissionReason}`);

        const result = await recommendationEngine.getCandidatesForProject(
            projectId,
            {
                minMatchingScore: parseFloat(minMatchingScore) || 0,
                maxCandidates: parseInt(maxCandidates) || 20
            },
            userBranchId,
            isSuperAdmin
        );

        if (!result.success) {
            return res.status(500).json(result);
        }

        console.log(`✅ Found ${result.data.candidates?.length || 0} candidates`);

        const projectName = project.project_name || 'Unknown Project';

        const transformedCandidates = (result.data.candidates || []).map(candidate => ({
            employee: {
                id: candidate.profileId,
                name: candidate.name,
                firstName: candidate.firstName,
                lastName: candidate.lastName,
                department: candidate.department,
                role: candidate.role,
                avatar: null,
                branchId: candidate.branchId
            },
            score: Math.round(candidate.recommendationScore * 100),
            matchingScore: Math.round(candidate.matchingScore * 100),
            matchedSkills: candidate.matchedSkills || [],
            missingSkills: candidate.missingSkills || [],
            availabilityFactor: candidate.availabilityFactor,
            historicalPerformance: candidate.historicalPerformance,
            status: candidate.status,
            skillMatchCount: candidate.skillMatchCount,
            workloadScore: candidate.workloadScore,
            breakdown: candidate.breakdown || null,
            prereqFulfillment: candidate.prereqFulfillment ?? 100,
            missingCoreSkills: Boolean(candidate.missingCoreSkills)
        }));

        res.json({
            success: true,
            data: {
                recommended: transformedCandidates,
                all: transformedCandidates,
                projectId: projectId,
                projectName: projectName,
                requiredSkills: result.data.requiredSkills || [],
                totalCandidates: result.data.totalCandidates || 0,
                branchId: projectBranchId
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
 * Get recommendations by requirement ID
 */
exports.getRecommendationsByRequirement = async (req, res) => {
    try {
        const { requirementId } = req.params;
        console.log(`🔍 ===== GET RECOMMENDATIONS BY REQUIREMENT =====`);
        console.log(`📋 Requirement ID from params: ${requirementId}`);

        const userBranchId = req.user?.branch_id;
        const isSuperAdmin = req.user?.is_super_admin || false;

        if (!req.user) {
            return res.status(401).json({
                success: false,
                error: 'Authentication required'
            });
        }

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

        const { data: project, error: projectError } = await supabase
            .from('projects')
            .select(`
                id, 
                project_name, 
                project_description, 
                status, 
                priority, 
                created_by, 
                start_date, 
                end_date,
                profiles:created_by (
                    branch_id
                )
            `)
            .eq('id', requirement.project_id)
            .single();

        if (projectError || !project) {
            console.error('❌ Project not found:', projectError);
            return res.status(404).json({
                success: false,
                error: 'Project not found'
            });
        }

        const projectBranchId = project.profiles?.branch_id;

        // ✅ SAME helper as getRecommendations above — previously this
        // endpoint had its own, looser inline check
        // (`projectBranchId !== userBranchId`) that granted access when
        // BOTH were null/undefined (null !== null is false). Now it goes
        // through the identical, explicit checkBranchAccess() logic.
        const access = checkBranchAccess({
            isSuperAdmin,
            userBranchId,
            resourceBranchId: projectBranchId,
            resourceLabel: 'project'
        });
        if (!access.allowed) {
            console.warn(`❌ Access denied: ${access.error}`);
            return res.status(access.statusCode).json({
                success: false,
                error: access.error
            });
        }

        const parsedRequirementId = parseInt(requirementId);
        console.log(`📋 Parsed requirementId: ${parsedRequirementId}`);

        const result = await recommendationEngine.getCandidatesForProject(
            requirement.project_id,
            {
                minMatchingScore: parseFloat(req.query.minMatchingScore) || 0,
                maxCandidates: parseInt(req.query.maxCandidates) || 20,
                requirementId: parsedRequirementId
            },
            userBranchId,
            isSuperAdmin
        );

        if (!result.success) {
            return res.status(500).json(result);
        }

        console.log(`✅ Found ${result.data.candidates?.length || 0} candidates for requirement ${requirementId}`);

        const projectName = project.project_name || 'Unknown Project';

        const transformedCandidates = (result.data.candidates || []).map(candidate => ({
            employee: {
                id: candidate.profileId,
                name: candidate.name,
                firstName: candidate.firstName,
                lastName: candidate.lastName,
                department: candidate.department,
                role: candidate.role,
                avatar: null,
                branchId: candidate.branchId
            },
            score: Math.round(candidate.recommendationScore * 100),
            matchingScore: Math.round(candidate.matchingScore * 100),
            matchedSkills: candidate.matchedSkills || [],
            missingSkills: candidate.missingSkills || [],
            availabilityFactor: candidate.availabilityFactor,
            historicalPerformance: candidate.historicalPerformance,
            status: candidate.status,
            skillMatchCount: candidate.skillMatchCount,
            workloadScore: candidate.workloadScore,
            breakdown: candidate.breakdown || null,
            prereqFulfillment: candidate.prereqFulfillment ?? 100,
            missingCoreSkills: Boolean(candidate.missingCoreSkills)
        }));

        res.json({
            success: true,
            data: {
                recommended: transformedCandidates,
                all: transformedCandidates,
                projectId: requirement.project_id,
                requirementId: parsedRequirementId,
                projectName: projectName,
                requiredSkills: result.data.requiredSkills || [],
                totalCandidates: result.data.totalCandidates || 0,
                branchId: projectBranchId
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

/**
 * Get employee workload status
 */
exports.getEmployeeWorkload = async (req, res) => {
    try {
        const { profileId } = req.params;

        console.log(`📊 Getting workload for employee: ${profileId}`);

        const userBranchId = req.user?.branch_id;
        const isSuperAdmin = req.user?.is_super_admin || false;

        // ✅ FIXED: same class of bug as the project checks — previously
        // `if (!isSuperAdmin && userBranchId)` skipped the check entirely
        // (and therefore allowed access) when the requester had no branch.
        if (!isSuperAdmin) {
            const { data: profile } = await supabase
                .from('profiles')
                .select('branch_id')
                .eq('id', profileId)
                .single();

            const access = checkBranchAccess({
                isSuperAdmin,
                userBranchId,
                resourceBranchId: profile?.branch_id,
                resourceLabel: "employee's workload"
            });
            if (!access.allowed) {
                return res.status(access.statusCode).json({
                    success: false,
                    error: access.error
                });
            }
        }

        const workload = await recommendationEngine._getWorkloadScore(profileId);
        const availability = recommendationEngine._calculateAvailability(workload);
        const hp = await recommendationEngine._getHistoricalPerformance(profileId);

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

        const userBranchId = req.user?.branch_id;
        const isSuperAdmin = req.user?.is_super_admin || false;

        if (!profileId) {
            return res.status(400).json({
                success: false,
                error: 'profileId is required'
            });
        }

        const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('id, employee_id, first_name, last_name, branch_id')
            .eq('id', profileId)
            .single();

        if (profileError) {
            return res.status(404).json({
                success: false,
                error: 'Employee not found'
            });
        }

        // ✅ FIXED: unified helper, no more silent bypass when userBranchId is null
        const employeeAccess = checkBranchAccess({
            isSuperAdmin,
            userBranchId,
            resourceBranchId: profile.branch_id,
            resourceLabel: 'employee'
        });
        if (!employeeAccess.allowed) {
            return res.status(employeeAccess.statusCode).json({
                success: false,
                error: employeeAccess.error
            });
        }

        const { data: project, error: projectError } = await supabase
            .from('projects')
            .select(`
                id, 
                project_name,
                profiles:created_by (
                    branch_id
                )
            `)
            .eq('id', projectId)
            .single();

        if (projectError) {
            return res.status(404).json({
                success: false,
                error: 'Project not found'
            });
        }

        const projectBranchId = project.profiles?.branch_id;

        // ✅ FIXED: unified helper here too
        const projectAccess = checkBranchAccess({
            isSuperAdmin,
            userBranchId,
            resourceBranchId: projectBranchId,
            resourceLabel: 'project'
        });
        if (!projectAccess.allowed) {
            return res.status(projectAccess.statusCode).json({
                success: false,
                error: projectAccess.error
            });
        }

        const projectName = project.project_name || 'Unnamed Project';

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
 * Get employee performance details for profile modal
 */
exports.getEmployeePerformance = async (req, res) => {
    try {
        const { profileId } = req.params;

        const userBranchId = req.user?.branch_id;
        const isSuperAdmin = req.user?.is_super_admin || false;

        // ✅ FIXED: same unified helper
        if (!isSuperAdmin) {
            const { data: profile } = await supabase
                .from('profiles')
                .select('branch_id')
                .eq('id', profileId)
                .single();

            const access = checkBranchAccess({
                isSuperAdmin,
                userBranchId,
                resourceBranchId: profile?.branch_id,
                resourceLabel: "employee's performance"
            });
            if (!access.allowed) {
                return res.status(access.statusCode).json({
                    success: false,
                    error: access.error
                });
            }
        }

        console.log(`📊 Getting performance details for employee: ${profileId}`);

        const performance = await recommendationEngine._getPerformanceDetails(profileId);

        res.json({
            success: true,
            data: performance
        });
    } catch (error) {
        console.error('❌ Error getting performance:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};
