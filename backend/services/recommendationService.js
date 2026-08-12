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

    /**
     * Main method: Get ranked candidates for a project
     */
    async getCandidatesForProject(projectId, options = {}) {
        const {
            excludeProfileIds = [],
            minMatchingScore = 0.0,
            maxCandidates = 20,
            includeAll = false
        } = options;

        console.log(`🔍 [Recommendation] Getting candidates for project ${projectId}`);

        // 1. Get project and requirements
        const project = await this._getProject(projectId);
        if (!project) throw new Error('Project not found');

        const requiredSkills = await this._getRequiredSkills(projectId);
        if (requiredSkills.length === 0) {
            return {
                success: true,
                data: {
                    projectId,
                    projectName: project.name,
                    requiredSkills: [],
                    candidates: [],
                    message: 'No skills required for this project'
                }
            };
        }

        // 2. Get all available employees
        const employees = await this._getAvailableEmployees(excludeProfileIds);
        console.log(`👥 Found ${employees.length} employees`);

        // 3. Calculate scores for each employee
        const candidates = [];
        for (const employee of employees) {
            const score = await this._calculateScore(employee, requiredSkills);
            if (score.matchingScore >= minMatchingScore || includeAll) {
                candidates.push(score);
            }
        }

        // 4. Sort by recommendation score (descending)
        candidates.sort((a, b) => b.recommendationScore - a.recommendationScore);

        // 5. Return top candidates
        const topCandidates = candidates.slice(0, maxCandidates);
        
        console.log(`✅ Found ${candidates.length} candidates`);
        console.log(`🏆 Top ${topCandidates.length} candidates returned`);

        return {
            success: true,
            data: {
                projectId,
                projectName: project.name,
                requiredSkills,
                candidates: topCandidates,
                totalCandidates: candidates.length
            }
        };
    }

    /**
     * Calculate scores for a single employee
     */
    async _calculateScore(employee, requiredSkills) {
        // Step 1: Skill Matching - Eq. (1)
        const employeeSkills = await this._getEmployeeSkills(employee.id);
        const matchedSkills = employeeSkills.filter(skill => 
            requiredSkills.some(req => req.toLowerCase() === skill.toLowerCase())
        );
        
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
            department: employee.department,
            role: employee.role,
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
     */
    async _getProject(projectId) {
        const { data, error } = await supabase
            .from('projects')
            .select('id, name, description, status, priority, project_manager_id')
            .eq('id', projectId)
            .single();

        if (error) throw error;
        return data;
    }

    /**
     * Get required skills for a project
     */
    async _getRequiredSkills(projectId) {
        const { data, error } = await supabase
            .from('requirement_skills')
            .select(`
                skill_id,
                skills (
                    skill_name
                )
            `)
            .eq('project_id', projectId);

        if (error) throw error;

        return data
            .map(item => item.skills?.skill_name)
            .filter(Boolean)
            .map(s => s.trim());
    }

    /**
     * Get all available employees
     */
    async _getAvailableEmployees(excludeIds = []) {
        let query = supabase
            .from('profiles')
            .select('id, employee_id, first_name, last_name, department, role')
            .eq('status', 'active');

        if (excludeIds.length > 0) {
            query = query.not('id', 'in', `(${excludeIds.map(id => `'${id}'`).join(',')})`);
        }

        const { data, error } = await query;
        if (error) throw error;
        return data || [];
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