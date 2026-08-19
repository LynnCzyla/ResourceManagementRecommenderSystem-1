// backend/services/recommendationService.js
const supabase = require('../supabase');

class RecommendationEngine {
    constructor() {
        this.WORKLOAD_THRESHOLD = 10;
        this.DEFAULT_HP = 0.70;
        this.PRIORITY_WEIGHTS = {
            'High': 3,
            'Medium': 2,
            'Low': 1
        };
        this.cache = new Map();
    }

    async _getRequiredSkills(requirementId) {
        console.log(`📋 Getting required skills for requirement ${requirementId}`);
        
        try {
            // ✅ Query using requirement_id (correct field)
            const { data, error } = await supabase
                .from('requirement_skills')
                .select('skills')
                .eq('requirement_id', requirementId);

            if (error) {
                console.error('❌ Error fetching requirement skills:', error);
                return [];
            }

            if (!data || data.length === 0) {
                console.log('📋 No skills found for this requirement');
                return [];
            }

            // Extract skills from the skills column
            const allSkills = [];
            data.forEach(item => {
                if (item.skills) {
                    // If skills is a comma-separated string, split it
                    if (typeof item.skills === 'string' && item.skills.includes(',')) {
                        const skillsArray = item.skills.split(',').map(s => s.trim());
                        allSkills.push(...skillsArray);
                    } else {
                        // Single skill
                        const skillValue = typeof item.skills === 'string' ? item.skills.trim() : item.skills;
                        if (skillValue) {
                            allSkills.push(skillValue);
                        }
                    }
                }
            });

            // Remove duplicates and empty values
            const uniqueSkills = [...new Set(allSkills.filter(Boolean))];
            
            console.log(`📋 Found ${uniqueSkills.length} skills for requirement ${requirementId}:`, uniqueSkills);
            return uniqueSkills;
        } catch (error) {
            console.error('❌ Error in _getRequiredSkills:', error);
            return [];
        }
    }


     /**
     * Get required skills for a project (fallback - uses project_id)
     * This is kept for backward compatibility
     */
     async _getRequiredSkillsForProject(projectId) {
        console.log(`📋 Getting required skills for project ${projectId} (legacy method)`);
        
        try {
            // First get all requirements for this project
            const { data: requirements, error: reqError } = await supabase
                .from('project_resource_requirements')
                .select('id')
                .eq('project_id', projectId);

            if (reqError || !requirements || requirements.length === 0) {
                return [];
            }

            // Get all skills for all requirements
            const requirementIds = requirements.map(r => r.id);
            const { data: skillsData, error: skillsError } = await supabase
                .from('requirement_skills')
                .select('skills')
                .in('requirement_id', requirementIds);

            if (skillsError || !skillsData) {
                return [];
            }

            // Extract unique skills
            const allSkills = [];
            skillsData.forEach(item => {
                if (item.skills) {
                    if (typeof item.skills === 'string' && item.skills.includes(',')) {
                        const skillsArray = item.skills.split(',').map(s => s.trim());
                        allSkills.push(...skillsArray);
                    } else {
                        const skillValue = typeof item.skills === 'string' ? item.skills.trim() : item.skills;
                        if (skillValue) {
                            allSkills.push(skillValue);
                        }
                    }
                }
            });

            return [...new Set(allSkills.filter(Boolean))];
        } catch (error) {
            console.error('❌ Error in _getRequiredSkillsForProject:', error);
            return [];
        }
    }


    /**
     * Main method: Get ranked candidates for a project
     */
    async getCandidatesForProject(projectId, options = {}) {
        const {
            excludeProfileIds = [],
            minMatchingScore = 0.0,
            maxCandidates = 20,
            includeAll = false,
            requirementId = null  // ✅ Added: specific requirement to use
        } = options;

        console.log(`🔍 [Recommendation] Getting candidates for project ${projectId}`);
        if (requirementId) {
            console.log(`📋 Using specific requirement: ${requirementId}`);
        }

        // 1. Get project
        const project = await this._getProject(projectId);
        if (!project) throw new Error('Project not found');

        // 2. Get required skills - use requirementId if provided
        const requiredSkills = requirementId 
            ? await this._getRequiredSkills(requirementId)  // ✅ Pass requirement_id
            : await this._getRequiredSkillsForProject(projectId);

        if (requiredSkills.length === 0) {
            return {
                success: true,
                data: {
                    projectId,
                    projectName: project.project_name,
                    requiredSkills: [],
                    candidates: [],
                    message: 'No skills required for this requirement'
                }
            };
        }

        // 3. Get all available employees
        const employees = await this._getAvailableEmployees(excludeProfileIds);
        console.log(`👥 Found ${employees.length} employees`);

        // 4. Calculate scores for each employee
        const candidates = [];
        for (const employee of employees) {
            const score = await this._calculateScore(employee, requiredSkills);
            if (score.matchingScore >= minMatchingScore || includeAll) {
                candidates.push(score);
            }
        }

        // 5. Sort by recommendation score (descending)
        candidates.sort((a, b) => b.recommendationScore - a.recommendationScore);

        // 6. Return top candidates
        const topCandidates = candidates.slice(0, maxCandidates);
        
        console.log(`✅ Found ${candidates.length} candidates`);
        console.log(`🏆 Top ${topCandidates.length} candidates returned`);

        return {
            success: true,
            data: {
                projectId,
                projectName: project.project_name,
                requiredSkills,
                candidates: topCandidates,
                totalCandidates: candidates.length,
                requirementId: requirementId
            }
        };
    }

    /**
     * Calculate scores for a single employee
     */
    async _calculateScore(employee, requiredSkills) {
        // Step 1: Skill Matching - Eq. (1)
        const employeeSkills = await this._getEmployeeSkills(employee.id);

           // 🔍 DEBUG: Log the skills being compared
        console.log(`🔍 Employee: ${employee.first_name} ${employee.last_name}`);
        console.log(`📋 Employee Skills:`, employeeSkills);
        console.log(`📋 Required Skills:`, requiredSkills);

        const matchedSkills = employeeSkills.filter(skill => 
            requiredSkills.some(req => req.toLowerCase() === skill.toLowerCase())
        );

        // 🔍 DEBUG: Log the match results
        console.log(`✅ Matched Skills:`, matchedSkills);

        
        const matchingScore = requiredSkills.length > 0 
            ? matchedSkills.length / requiredSkills.length 
            : 0;

        // Step 2: Workload Assessment - Eq. (2)
        const workload = await this._getWorkloadScore(employee.id);
        
        // Step 3: Availability Factor - Eq. (3)
        const availabilityFactor = this._calculateAvailability(workload);
        
        // Step 4: Historical Performance - Eq. (4)
        const historicalPerformance = await this._getHistoricalPerformance(employee.id);

        // Step 5: Final Score - Eq. (5)
        const recommendationScore = matchingScore * availabilityFactor * historicalPerformance;

        const missingSkills = requiredSkills.filter(req => 
            !employeeSkills.some(skill => skill.toLowerCase() === req.toLowerCase())
        );

        return {
            profileId: employee.id,
            employeeId: employee.employee_id,
            name: `${employee.first_name} ${employee.last_name}`,
            firstName: employee.first_name,
            lastName: employee.last_name,
            department: employee.department || null,
            role: employee.role || null,
            matchingScore: Math.round(matchingScore * 1000) / 1000,
            workloadScore: workload,
            availabilityFactor: Math.round(availabilityFactor * 1000) / 1000,
            historicalPerformance: Math.round(historicalPerformance * 1000) / 1000,
            recommendationScore: Math.round(recommendationScore * 1000) / 1000,
            matchedSkills,
            missingSkills,
            skillMatchCount: `${matchedSkills.length}/${requiredSkills.length}`,
            status: this._getRecommendationStatus(recommendationScore)
        };
    }

    /**
     * Get project details
     * FIXED: Use correct column names for your projects table
     */
    async _getProject(projectId) {
        const { data, error } = await supabase
            .from('projects')
            .select('id, project_name, project_description, status, priority, created_by, start_date, end_date')
            .eq('id', projectId)
            .single();

        if (error) throw error;
        return data;
    }

    /**
     * Get required skills for a project
     * FIXED: skills is a text column in requirement_skills, not a foreign key
     */
    async _getRequiredSkills(projectId) {
        console.log(`📋 Getting required skills for project ${projectId}`);
        
        try {
            // Get skills directly from requirement_skills table
            // The 'skills' column stores text directly
            const { data, error } = await supabase
                .from('requirement_skills')
                .select('skills')
                .eq('requirement_id', projectId);

            if (error) {
                console.error('❌ Error fetching requirement skills:', error);
                return [];
            }

            if (!data || data.length === 0) {
                console.log('📋 No skills found for this project');
                return [];
            }

            // Extract skill names from the skills column
            // The skills column might contain comma-separated values or single values
            const allSkills = [];
            data.forEach(item => {
                if (item.skills) {
                    // If skills is a comma-separated string, split it
                    if (typeof item.skills === 'string' && item.skills.includes(',')) {
                        const skillsArray = item.skills.split(',').map(s => s.trim());
                        allSkills.push(...skillsArray);
                    } else {
                        // Single skill or already an array
                        const skillValue = typeof item.skills === 'string' ? item.skills.trim() : item.skills;
                        if (skillValue) {
                            allSkills.push(skillValue);
                        }
                    }
                }
            });

            // Remove duplicates and empty values
            const uniqueSkills = [...new Set(allSkills.filter(Boolean))];
            
            console.log(`📋 Found ${uniqueSkills.length} skills:`, uniqueSkills);
            return uniqueSkills;
        } catch (error) {
            console.error('❌ Error in _getRequiredSkills:', error);
            return [];
        }
    }

    /**
     * Get all available employees
     * FIXED: Only include users with 'Employee' role
     */
    async _getAvailableEmployees(excludeIds = []) {
        console.log(`📋 Getting available employees...`);
        
        try {
            // Only include users with 'Employee' role
            let query = supabase
                .from('profiles')
                .select(`
                    id, 
                    employee_id, 
                    first_name, 
                    last_name, 
                    role,
                    department_id,
                    departments:department_id (
                        department_name
                    )
                `)
                .eq('status', 'Active')
                .eq('role', 'Employee');  // Only include actual employees

            if (excludeIds.length > 0) {
                query = query.not('id', 'in', `(${excludeIds.map(id => `'${id}'`).join(',')})`);
            }

            const { data, error } = await query;
            
            if (error) {
                console.error('❌ Error fetching employees:', error);
                return [];
            }
            
            // Transform the data to match expected format
            const employees = (data || []).map(emp => ({
                id: emp.id,
                employee_id: emp.employee_id,
                first_name: emp.first_name,
                last_name: emp.last_name,
                role: emp.role,
                department: emp.departments?.department_name || null
            }));
            
            console.log(`✅ Found ${employees.length} employees (only 'Employee' role)`);
            return employees;
        } catch (error) {
            console.error('❌ Error in _getAvailableEmployees:', error);
            return [];
        }
    }

    /**
     * Get skills for an employee
     */
    async _getEmployeeSkills(profileId) {
        const { data, error } = await supabase
            .from('employee_skills')
            .select(`
                skills (
                    skill_name
                )
            `)
            .eq('profile_id', profileId);

        if (error) throw error;

        return data
            .map(item => item.skills?.skill_name)
            .filter(Boolean)
            .map(s => s.trim());
    }

    /**
     * Calculate workload score from active tasks
     * Eq. (2): W = Σ (priority weight of each active task)
     */
    async _getWorkloadScore(profileId) {
        const { data, error } = await supabase
            .from('project_tasks')
            .select('priority')
            .eq('profile_id', profileId)
            .in('status', ['Active', 'In Progress']);

        if (error) throw error;

        let workload = 0;
        for (const task of data || []) {
            workload += this.PRIORITY_WEIGHTS[task.priority] || 1;
        }
        return workload;
    }

    /**
     * Calculate availability factor
     * Eq. (3): A = 1 - (W / 10)
     */
    _calculateAvailability(workload) {
        if (workload >= this.WORKLOAD_THRESHOLD) return 0;
        return 1 - (workload / this.WORKLOAD_THRESHOLD);
    }

    /**
     * Get historical performance factor
     * Eq. (4): HP = average_client_rating / 5
     */
    async _getHistoricalPerformance(profileId) {
        // Use performance_records table
        const { data, error } = await supabase
            .from('performance_records')
            .select('rating')
            .eq('profile_id', profileId);

        if (error || !data || data.length === 0) {
            return this.DEFAULT_HP;
        }

        const avgRating = data.reduce((sum, record) => sum + record.rating, 0) / data.length;
        return avgRating / 5;
    }

    /**
     * Get recommendation status
     */
    _getRecommendationStatus(score) {
        if (score >= 0.7) return 'Strongly Recommended';
        if (score >= 0.4) return 'Recommended';
        if (score >= 0.2) return 'Consider';
        return 'Not Recommended';
    }

    /**
     * Clear cache
     */
    clearCache() {
        this.cache.clear();
        console.log('🧹 Cache cleared');
    }
}

module.exports = new RecommendationEngine();