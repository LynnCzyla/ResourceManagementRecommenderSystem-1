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
        
        // ============ ALIAS CACHE ============
        this._aliasMap = null;           // alias → master
        this._masterAliases = null;      // master → [aliases]
        this._aliasCacheTime = null;
        this._aliasCacheTTL = 300000;    // 5 minutes
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
            requirementId = null
        } = options;

        console.log(`🔍 [Recommendation] Getting candidates for project ${projectId}`);
        if (requirementId) {
            console.log(`📋 Using specific requirement: ${requirementId}`);
        }

        // 1. Get project
        const project = await this._getProject(projectId);
        if (!project) throw new Error('Project not found');

        // 2. Get required skills
        const requiredSkills = requirementId 
            ? await this._getRequiredSkills(requirementId)
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
     * 🆕 Uses skill_aliases + skill_components for intelligent matching
     */
    async _calculateScore(employee, requiredSkills) {
        // Step 1: Get employee skills
        const employeeSkills = await this._getEmployeeSkills(employee.id);
        console.log(`📋 ${employee.first_name} - Skills:`, employeeSkills);
        
        // Step 2: Get employee skill components (NEW!)
        const employeeComponents = await this._getEmployeeSkillComponents(employee.id);
        if (employeeComponents.length > 0) {
            console.log(`📋 ${employee.first_name} - Components:`, employeeComponents);
        }
        
        // Step 3: Load alias mappings
        const aliasMap = await this._getAliasMap();
        const masterAliases = await this._getMasterAliases();
        
        // Step 4: Build expanded skill sets
        const expandedSkills = new Set();
        const matchSources = {}; // Track where matches came from
        
        // 4a: Add all employee skills
        employeeSkills.forEach(s => {
            const normalized = s.toLowerCase().trim();
            expandedSkills.add(normalized);
            matchSources[normalized] = 'skill';
        });
        
        // 4b: Add skill components (NEW!)
        employeeComponents.forEach(c => {
            const normalized = c.toLowerCase().trim();
            expandedSkills.add(normalized);
            matchSources[normalized] = 'component';
        });
        
        // 4c: Add aliases and masters for skills
        const normalizedEmployee = employeeSkills.map(s => s.toLowerCase().trim());
        for (const empSkill of normalizedEmployee) {
            // If this skill is an alias, add its master
            if (aliasMap[empSkill]) {
                const master = aliasMap[empSkill];
                expandedSkills.add(master);
                matchSources[master] = 'alias';
                console.log(`   🔄 Alias: "${empSkill}" → Master: "${master}"`);
            }
            // If this skill is a master, add all its aliases
            if (masterAliases[empSkill]) {
                masterAliases[empSkill].forEach(alias => {
                    expandedSkills.add(alias);
                    matchSources[alias] = 'alias';
                });
                console.log(`   🔄 Master: "${empSkill}" → Aliases: ${masterAliases[empSkill].join(', ')}`);
            }
        }
        
        // 4d: Also expand components with aliases (NEW!)
        const normalizedComponents = employeeComponents.map(c => c.toLowerCase().trim());
        for (const comp of normalizedComponents) {
            if (aliasMap[comp]) {
                const master = aliasMap[comp];
                expandedSkills.add(master);
                matchSources[master] = 'alias_component';
            }
            if (masterAliases[comp]) {
                masterAliases[comp].forEach(alias => {
                    expandedSkills.add(alias);
                    matchSources[alias] = 'alias_component';
                });
            }
        }
        
        // Step 5: Find matches
        const matchedSkills = [];
        const usedSkills = new Set();
        const matchDetails = [];
        
        for (const reqSkill of requiredSkills) {
            const reqLower = reqSkill.toLowerCase().trim();
            let found = false;
            
            // Try exact match
            for (const empSkill of expandedSkills) {
                if (!usedSkills.has(empSkill) && empSkill === reqLower) {
                    // Find the original skill/component name
                    const originalSkill = employeeSkills.find(s => 
                        s.toLowerCase().trim() === empSkill
                    ) || employeeComponents.find(c => 
                        c.toLowerCase().trim() === empSkill
                    ) || reqSkill;
                    
                    matchedSkills.push(originalSkill);
                    usedSkills.add(empSkill);
                    found = true;
                    const source = matchSources[empSkill] || 'exact';
                    matchDetails.push({ reqSkill, matched: originalSkill, source });
                    console.log(`   ✅ Matched: "${reqSkill}" → "${originalSkill}" (via ${source})`);
                    break;
                }
            }
            
            // If no match, try partial match
            if (!found) {
                for (const empSkill of expandedSkills) {
                    if (!usedSkills.has(empSkill) && 
                        (empSkill.includes(reqLower) || reqLower.includes(empSkill))) {
                        const originalSkill = employeeSkills.find(s => 
                            s.toLowerCase().trim() === empSkill
                        ) || employeeComponents.find(c => 
                            c.toLowerCase().trim() === empSkill
                        ) || reqSkill;
                        
                        matchedSkills.push(originalSkill);
                        usedSkills.add(empSkill);
                        found = true;
                        const source = matchSources[empSkill] || 'partial';
                        matchDetails.push({ reqSkill, matched: originalSkill, source });
                        console.log(`   ✅ Partial match: "${reqSkill}" → "${originalSkill}" (via ${source})`);
                        break;
                    }
                }
            }
            
            if (!found) {
                console.log(`   ❌ No match for: "${reqSkill}"`);
            }
        }
        
        const matchingScore = requiredSkills.length > 0 
            ? matchedSkills.length / requiredSkills.length 
            : 0;
        
        console.log(`📊 ${employee.first_name}: ${matchedSkills.length}/${requiredSkills.length} skills matched (${Math.round(matchingScore * 100)}%)`);
        
        // Step 6: Calculate other scores
        const workload = await this._getWorkloadScore(employee.id);
        const availabilityFactor = this._calculateAvailability(workload);
        const historicalPerformance = await this._getHistoricalPerformance(employee.id);
        const recommendationScore = matchingScore * availabilityFactor * historicalPerformance;

        const missingSkills = requiredSkills.filter(req => 
            !matchedSkills.some(matched => 
                matched.toLowerCase().trim() === req.toLowerCase().trim()
            )
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
            matchDetails: matchDetails, // 🆕 For debugging
            status: this._getRecommendationStatus(recommendationScore)
        };
    }

    /**
     * 🆕 Get skill components for an employee
     * Uses skill_components table
     * FIXED: Correct query structure
     */
    async _getEmployeeSkillComponents(profileId) {
        console.log(`📋 Getting skill components for employee ${profileId}`);
        
        try {
            // Get employee skills first
            const { data: employeeSkills, error: skillsError } = await supabase
                .from('employee_skills')
                .select('skill_id')
                .eq('profile_id', profileId);

            if (skillsError) {
                console.error('❌ Error fetching employee skills:', skillsError);
                return [];
            }

            if (!employeeSkills || employeeSkills.length === 0) {
                console.log(`📋 No employee skills found for ${profileId}`);
                return [];
            }

            const skillIds = employeeSkills
                .map(item => item.skill_id)
                .filter(id => id !== null && id !== undefined);

            if (skillIds.length === 0) {
                console.log(`📋 No valid skill IDs for ${profileId}`);
                return [];
            }

            console.log(`📋 Found ${skillIds.length} skill IDs for employee`);

            // Get components for these skill IDs
            const { data: components, error: compError } = await supabase
                .from('skill_components')
                .select('component_name')
                .in('skill_id', skillIds);

            if (compError) {
                console.error('❌ Error fetching skill components:', compError);
                return [];
            }

            if (!components || components.length === 0) {
                console.log(`📋 No components found for employee ${profileId}`);
                return [];
            }

            // Extract and deduplicate component names
            const componentNames = components
                .map(item => item.component_name)
                .filter(Boolean)
                .map(name => name.trim());

            const uniqueComponents = [...new Set(componentNames)];
            
            if (uniqueComponents.length > 0) {
                console.log(`📋 Found ${uniqueComponents.length} skill components:`, uniqueComponents);
            }
            
            return uniqueComponents;
        } catch (error) {
            console.error('❌ Error in _getEmployeeSkillComponents:', error);
            return [];
        }
    }

    /**
     * Get alias map: alias → master
     * Uses skill_aliases table with caching
     */
    async _getAliasMap() {
        if (this._aliasMap !== null && this._aliasCacheTime !== null) {
            const age = Date.now() - this._aliasCacheTime;
            if (age < this._aliasCacheTTL) {
                return this._aliasMap;
            }
        }

        console.log('📋 Fetching fresh aliases from database...');
        
        try {
            const { data, error } = await supabase
                .from('skill_aliases')
                .select(`
                    id,
                    master_skill_id,
                    alias_skill_id,
                    master:master_skill_id (id, skill_name),
                    alias:alias_skill_id (id, skill_name)
                `);

            if (error) {
                console.error('❌ Error fetching skill aliases:', error);
                return this._aliasMap || {};
            }

            const aliasMap = {};
            const masterAliases = {};
            
            (data || []).forEach(item => {
                const masterName = item.master?.skill_name?.toLowerCase().trim();
                const aliasName = item.alias?.skill_name?.toLowerCase().trim();
                
                if (masterName && aliasName) {
                    aliasMap[aliasName] = masterName;
                    if (!masterAliases[masterName]) {
                        masterAliases[masterName] = [];
                    }
                    if (!masterAliases[masterName].includes(aliasName)) {
                        masterAliases[masterName].push(aliasName);
                    }
                }
            });

            this._aliasMap = aliasMap;
            this._masterAliases = masterAliases;
            this._aliasCacheTime = Date.now();

            console.log(`✅ Loaded ${Object.keys(aliasMap).length} aliases`);
            return aliasMap;
        } catch (error) {
            console.error('❌ Error in _getAliasMap:', error);
            return this._aliasMap || {};
        }
    }

    /**
     * Get master aliases: master → [aliases]
     */
    async _getMasterAliases() {
        await this._getAliasMap();
        return this._masterAliases || {};
    }

    /**
     * Preload aliases on startup
     */
    async preloadAliases() {
        console.log('🔄 Preloading skill aliases...');
        await this._getAliasMap();
        console.log('✅ Aliases preloaded');
    }

    /**
     * Clear alias cache
     */
    clearAliasCache() {
        this._aliasMap = null;
        this._masterAliases = null;
        this._aliasCacheTime = null;
        console.log('🧹 Alias cache cleared');
    }

    /**
     * Force refresh aliases
     */
    async refreshAliases() {
        this.clearAliasCache();
        return await this._getAliasMap();
    }

    // ============ EXISTING METHODS (unchanged) ============

    async _getRequiredSkills(requirementId) {
        console.log(`📋 Getting required skills for requirement ${requirementId}`);
        
        try {
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

            const aliasMap = await this._getAliasMap();

            const allSkills = [];
            data.forEach(item => {
                if (item.skills) {
                    let skillValue = typeof item.skills === 'string' ? item.skills.trim() : item.skills;
                    
                    const lowerSkill = skillValue.toLowerCase().trim();
                    if (aliasMap[lowerSkill]) {
                        const mappedSkill = aliasMap[lowerSkill];
                        console.log(`   📌 Mapping alias "${skillValue}" → Master "${mappedSkill}"`);
                        skillValue = mappedSkill;
                    }
                    
                    if (skillValue) {
                        allSkills.push(skillValue);
                    }
                }
            });

            const uniqueSkills = [...new Set(allSkills.filter(Boolean))];
            console.log(`📋 Found ${uniqueSkills.length} skills for requirement ${requirementId}:`, uniqueSkills);
            return uniqueSkills;
        } catch (error) {
            console.error('❌ Error in _getRequiredSkills:', error);
            return [];
        }
    }

    async _getRequiredSkillsForProject(projectId) {
        console.log(`📋 Getting required skills for project ${projectId} (legacy method)`);
        
        try {
            const { data: requirements, error: reqError } = await supabase
                .from('project_resource_requirements')
                .select('id')
                .eq('project_id', projectId);

            if (reqError || !requirements || requirements.length === 0) {
                return [];
            }

            const requirementIds = requirements.map(r => r.id);
            const { data: skillsData, error: skillsError } = await supabase
                .from('requirement_skills')
                .select('skills')
                .in('requirement_id', requirementIds);

            if (skillsError || !skillsData) {
                return [];
            }

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

    async _getProject(projectId) {
        const { data, error } = await supabase
            .from('projects')
            .select('id, project_name, project_description, status, priority, created_by, start_date, end_date')
            .eq('id', projectId)
            .single();

        if (error) throw error;
        return data;
    }

    async _getAvailableEmployees(excludeIds = []) {
        console.log(`📋 Getting available employees...`);
        
        try {
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
                .eq('role', 'Employee');

            if (excludeIds.length > 0) {
                query = query.not('id', 'in', `(${excludeIds.map(id => `'${id}'`).join(',')})`);
            }

            const { data, error } = await query;
            
            if (error) {
                console.error('❌ Error fetching employees:', error);
                return [];
            }
            
            const employees = (data || []).map(emp => ({
                id: emp.id,
                employee_id: emp.employee_id,
                first_name: emp.first_name,
                last_name: emp.last_name,
                role: emp.role,
                department: emp.departments?.department_name || null
            }));
            
            console.log(`✅ Found ${employees.length} employees`);
            return employees;
        } catch (error) {
            console.error('❌ Error in _getAvailableEmployees:', error);
            return [];
        }
    }

    async _getEmployeeSkills(profileId) {
        console.log(`📋 Getting skills for employee ${profileId}`);
        
        try {
            const { data, error } = await supabase
                .from('employee_skills')
                .select(`
                    skill_id,
                    skills:skill_id (
                        skill_name
                    )
                `)
                .eq('profile_id', profileId);

            if (error) {
                console.error('❌ Error fetching employee skills:', error);
                return [];
            }

            if (!data || data.length === 0) {
                console.log(`📋 No skills found for employee ${profileId}`);
                return [];
            }

            const allSkills = data
                .map(item => item.skills?.skill_name)
                .filter(Boolean)
                .map(s => s.trim());

            const uniqueSkills = [...new Set(allSkills)];
            return uniqueSkills;
        } catch (error) {
            console.error('❌ Error in _getEmployeeSkills:', error);
            return [];
        }
    }

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

    _calculateAvailability(workload) {
        if (workload >= this.WORKLOAD_THRESHOLD) return 0;
        return 1 - (workload / this.WORKLOAD_THRESHOLD);
    }

    async _getHistoricalPerformance(profileId) {
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

    _getRecommendationStatus(score) {
        if (score >= 0.7) return 'Strongly Recommended';
        if (score >= 0.4) return 'Recommended';
        if (score >= 0.2) return 'Consider';
        return 'Not Recommended';
    }

    clearCache() {
        this.cache.clear();
        this.clearAliasCache();
        console.log('🧹 All cache cleared');
    }
}

module.exports = new RecommendationEngine();