// backend/services/recommendationService.js
const supabase = require('../supabase');
const {
    skillKey,
    isSubsetMatch,
    jaccardSimilarity,
    isUuid
} = require('../utils/skillNormalizer');

class RecommendationEngine {
    constructor() {
        this.WORKLOAD_THRESHOLD = 10;
        this.DEFAULT_HP = 0.70;
        this.PRIORITY_WEIGHTS = {
            'High': 3,
            'Medium': 2,
            'Low': 1
        };
        // Phase 2: Asymmetric weights — required/primary skills matter 4×
        // more than secondary (nice-to-have) ones.
        this.SKILL_TYPE_WEIGHTS = {
            primary: 4,
            secondary: 1
        };
        // Composite score weights: skill match dominates (60%),
        // availability matters but never zeroes out (25%), performance (15%).
        this.COMPOSITE_WEIGHTS = {
            skill: 0.60,
            availability: 0.25,
            performance: 0.15
        };
        this.cache = new Map();

        // ============ ALIAS CACHE ============
        this._aliasMap = null;           // alias → master
        this._masterAliases = null;      // master → [aliases]
        this._aliasCacheTime = null;
        this._aliasCacheTTL = 300000;    // 5 minutes
    }

    /**
     * Consistent normalization used everywhere skills are compared.
     * Delegates to the shared skillNormalizer so recommendationService,
     * documentController, and feedbackController never drift apart.
     */
    _normalize(str) {
        return skillKey(str);
    }

    _splitSkillIntoComponents(skill) {
        if (!skill) return [];

        const parts = skill.trim().split(/\s+and\s+/i);
        if (parts.length !== 2) return [];

        const left = parts[0].trim();
        const right = parts[1].trim();
        const leftWords = left.split(/\s+/);
        const rightWords = right.split(/\s+/);
        const trailingWord = rightWords[rightWords.length - 1];
        const leftLastWord = leftWords[leftWords.length - 1];

        const leftComponent =
            trailingWord && leftLastWord.toLowerCase() !== trailingWord.toLowerCase()
                ? `${left} ${trailingWord}`
                : left;

        const components = [leftComponent, right]
            .map(component => component.trim())
            .filter(component => component.split(/\s+/).length >= 2);

        return [...new Set(components.map(component => this._normalize(component)))];
    }

    /**
     * Get project with creator's branch info
     */
    async _getProject(projectId) {
        const { data, error } = await supabase
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

        if (error) throw error;
        return data;
    }

    /**
     * Main method: Get ranked candidates for a project
     * ✅ FIXED: branch check no longer skips entirely when the requesting
     * user has no branch_id assigned (previously: `if (!isSuperAdmin &&
     * userBranchId)` silently granted access to ANY project when
     * userBranchId was null/undefined).
     */
    async getCandidatesForProject(projectId, options = {}, userBranchId = null, isSuperAdmin = false) {
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
        console.log(`🏢 Branch filter: ${isSuperAdmin ? 'ALL' : userBranchId}`);
    
        // 1. Get project with creator's branch info
        const project = await this._getProject(projectId);
        if (!project) throw new Error('Project not found');
    
        const projectBranchId = project.profiles?.branch_id;
    
        // ✅ SECURITY FIX: this check now runs for every non-super-admin,
        // regardless of whether userBranchId is truthy. Previously a user
        // with NO branch assigned skipped this block entirely and could
        // view recommendations for ANY project in ANY branch.
        if (!isSuperAdmin) {
            if (!projectBranchId) {
                console.warn(`⚠️ Project creator ${project.created_by} has no branch assigned`);
                throw new Error('Project creator not assigned to any branch');
            }
            if (!userBranchId) {
                console.warn(`⚠️ Requesting user has no branch assigned — denying access`);
                throw new Error('Your account is not assigned to any branch. Please contact an administrator.');
            }
            if (projectBranchId !== userBranchId) {
                console.warn(`⚠️ Project creator's branch ${projectBranchId} != User branch ${userBranchId}`);
                throw new Error('You do not have permission to view this project');
            }
        }
    
        // 2. Get required skills (now returns [{ skill, skill_type }, ...])
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
    
        // 3. Get already assigned employees for THIS requirement
        const assignedProfileIds = await this._getAssignedEmployeesForRequirement(requirementId);
        if (assignedProfileIds.length > 0) {
            console.log(`👥 ${assignedProfileIds.length} employees already assigned to requirement ${requirementId}, excluding them`);
        }
    
        // 4. Combine with excludeProfileIds
        const allExcludeIds = [...new Set([...excludeProfileIds, ...assignedProfileIds])];
    
        // 5. Get all available employees (excluding assigned ones) ✅ WITH BRANCH FILTERING
        const employees = await this._getAvailableEmployees(allExcludeIds, userBranchId, isSuperAdmin);
        console.log(`👥 Found ${employees.length} available employees (${assignedProfileIds.length} excluded for this requirement)`);
    
        if (employees.length === 0) {
            return {
                success: true,
                data: {
                    projectId,
                    projectName: project.project_name,
                    requiredSkills,
                    candidates: [],
                    totalCandidates: 0,
                    requirementId,
                    assignedCount: assignedProfileIds.length
                }
            };
        }

        // 6. ⚡ HIGH-PERFORMANCE BATCH PREFETCH: fetch all candidate data in parallel
        // Replaces 120-150 sequential HTTP roundtrips with 3-4 parallel queries
        const profileIds = employees.map(e => e.id);
        const [
            aliasMap,
            masterAliases,
            employeeSkillsRes,
            tasksRes,
            perfRes
        ] = await Promise.all([
            this._getAliasMap(),
            this._getMasterAliases(),
            supabase
                .from('employee_skills')
                .select(`
                    profile_id,
                    skill_id,
                    skills:skill_id (
                        skill_name
                    )
                `)
                .in('profile_id', profileIds),
            supabase
                .from('project_tasks')
                .select('profile_id, priority')
                .in('profile_id', profileIds)
                .in('status', ['Active', 'In Progress']),
            supabase
                .from('performance_records')
                .select('profile_id, rating')
                .in('profile_id', profileIds)
                .eq('feedback_source', 'client')
                .eq('feedback_status', 'submitted')
        ]);

        // Organize skills by profile_id and collect unique skill_ids
        const skillsByProfile = {};
        const skillIdsByProfile = {};
        const allSkillIds = new Set();

        for (const row of employeeSkillsRes.data || []) {
            const pid = row.profile_id;
            const skillName = row.skills?.skill_name?.trim();
            if (!skillsByProfile[pid]) skillsByProfile[pid] = [];
            if (skillName && !skillsByProfile[pid].includes(skillName)) {
                skillsByProfile[pid].push(skillName);
            }
            if (row.skill_id) {
                if (!skillIdsByProfile[pid]) skillIdsByProfile[pid] = new Set();
                skillIdsByProfile[pid].add(row.skill_id);
                allSkillIds.add(row.skill_id);
            }
        }

        // Fetch skill components for all candidate skill IDs in one batch query
        const componentsBySkillId = {};
        if (allSkillIds.size > 0) {
            const { data: compData } = await supabase
                .from('skill_components')
                .select('skill_id, component_name')
                .in('skill_id', Array.from(allSkillIds));

            for (const c of compData || []) {
                const sid = c.skill_id;
                const cname = c.component_name?.trim();
                if (cname) {
                    if (!componentsBySkillId[sid]) componentsBySkillId[sid] = [];
                    componentsBySkillId[sid].push(cname);
                }
            }
        }

        // Map components by profile_id
        const componentsByProfile = {};
        for (const [pid, sids] of Object.entries(skillIdsByProfile)) {
            const compSet = new Set();
            for (const sid of sids) {
                const comps = componentsBySkillId[sid] || [];
                for (const c of comps) compSet.add(c);
            }
            componentsByProfile[pid] = Array.from(compSet);
        }

        // Map workloads by profile_id
        const workloadByProfile = {};
        for (const task of tasksRes.data || []) {
            const pid = task.profile_id;
            workloadByProfile[pid] = (workloadByProfile[pid] || 0) + (this.PRIORITY_WEIGHTS[task.priority] || 1);
        }

        // Map performance by profile_id
        const perfRatingsByProfile = {};
        for (const rec of perfRes.data || []) {
            const pid = rec.profile_id;
            if (!perfRatingsByProfile[pid]) perfRatingsByProfile[pid] = [];
            perfRatingsByProfile[pid].push(Number(rec.rating));
        }

        const perfByProfile = {};
        for (const [pid, ratings] of Object.entries(perfRatingsByProfile)) {
            const avg = ratings.reduce((a, b) => a + b, 0) / ratings.length;
            perfByProfile[pid] = Math.min(avg / 5, 1.0);
        }

        const batchContext = {
            preloaded: true,
            aliasMap,
            masterAliases,
            skillsByProfile,
            componentsByProfile,
            workloadByProfile,
            perfByProfile
        };

        // 7. Calculate scores in-memory (lightning fast)
        const candidates = [];
        for (const employee of employees) {
            const score = await this._calculateScore(employee, requiredSkills, batchContext);
            if (score.matchingScore >= minMatchingScore || includeAll) {
                candidates.push(score);
            }
        }
    
        // 7. Sort by recommendation score (descending)
        candidates.sort((a, b) => b.recommendationScore - a.recommendationScore);
    
        // 8. Return top candidates
        const topCandidates = candidates.slice(0, maxCandidates);
        // ==== VALIDATOR HOOK (optional, safe to delete — see recommendationValidator.js) ====
        try {
            require('../utils/recommendationValidator').validateAndPrint(
                project.project_name, requiredSkills, topCandidates, this.COMPOSITE_WEIGHTS
            );
        } catch (e) { /* validator missing or errored — never break real recommendations */ }
        // ==== END VALIDATOR HOOK ====
        
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
                requirementId: requirementId,
                assignedCount: assignedProfileIds.length
            }
        };
    }

    /**
     * Get employees already assigned to a SPECIFIC requirement
     */
    async _getAssignedEmployeesForRequirement(requirementId) {
        if (!requirementId) return [];
        
        try {
            const { data, error } = await supabase
                .from('project_assignments')
                .select('profile_id')
                .eq('requirement_id', requirementId)
                .in('status', ['Assigned', 'Active']);

            if (error) {
                console.error('❌ Error fetching assigned employees:', error);
                return [];
            }

            return (data || []).map(item => item.profile_id).filter(Boolean);
        } catch (error) {
            console.error('❌ Error in _getAssignedEmployeesForRequirement:', error);
            return [];
        }
    }

    /**
     * Calculate scores for a single employee
     * Ordered matching tiers: EXACT → ALIAS → ALIAS-VIA-COMPONENT →
     * COMPONENT EXACT → TOKEN SUBSET (NEW) → TOKEN JACCARD (fallback).
     * Primary/secondary weighted scoring, matchDetails-driven missingSkills.
     */
    async _calculateScore(employee, requiredSkills, context = null) {
        const employeeSkills = context?.preloaded
            ? (context.skillsByProfile[employee.id] || [])
            : await this._getEmployeeSkills(employee.id);

        const employeeComponents = context?.preloaded
            ? (context.componentsByProfile[employee.id] || [])
            : await this._getEmployeeSkillComponents(employee.id);

        const aliasMap = context?.preloaded
            ? context.aliasMap
            : await this._getAliasMap();
        const masterAliases = context?.preloaded
            ? context.masterAliases
            : await this._getMasterAliases();

        const normalizedEmployeeSkills =
            employeeSkills.map(skill => this._normalize(skill));

        const derivedComponentSources = new Map();
        const derivedEmployeeComponents = employeeSkills.flatMap(skill => {
            const components = this._splitSkillIntoComponents(skill);
            components.forEach(component => {
                if (!derivedComponentSources.has(component)) {
                    derivedComponentSources.set(component, skill);
                }
            });
            return components;
        });

        const normalizedComponents =
            [...employeeComponents, ...derivedEmployeeComponents]
                .map(component => this._normalize(component))
                .filter((component, index, components) =>
                    components.indexOf(component) === index
                );

        const isAliasRelated = (empSkill, reqSkill) => {
            if (!empSkill || !reqSkill) return null;

            if (aliasMap[empSkill] === reqSkill) {
                return {
                    related: true,
                    reason: `alias → master: "${empSkill}" is an alias whose master is "${reqSkill}"`
                };
            }

            if (aliasMap[reqSkill] === empSkill) {
                return {
                    related: true,
                    reason: `alias → master: "${reqSkill}" is an alias whose master is "${empSkill}"`
                };
            }

            if (
                masterAliases[empSkill] &&
                masterAliases[empSkill].includes(reqSkill)
            ) {
                return {
                    related: true,
                    reason: `master → alias: "${empSkill}" is a master; "${reqSkill}" is listed as one of its aliases`
                };
            }

            if (
                masterAliases[reqSkill] &&
                masterAliases[reqSkill].includes(empSkill)
            ) {
                return {
                    related: true,
                    reason: `master → alias: "${reqSkill}" is a master; "${empSkill}" is listed as one of its aliases`
                };
            }

            return null;
        };

        console.log(
            `📋 Requirement Analysis for ${employee.first_name} ${employee.last_name}`
        );

        const matchDetails = [];

        let matchedWeight = 0;
        let totalWeight = 0;

        let primaryMatched = 0;
        let primaryTotal = 0;

        let secondaryMatched = 0;
        let secondaryTotal = 0;

        for (const [idx, req] of requiredSkills.entries()) {
            const reqSkill = req.skill;

            const skillType =
                req.skill_type === 'secondary'
                    ? 'secondary'
                    : 'primary';

            const reqLower = this._normalize(reqSkill);

            const weight =
                this.SKILL_TYPE_WEIGHTS[skillType] || 1;

            totalWeight += weight;

            if (skillType === 'primary') {
                primaryTotal++;
            } else {
                secondaryTotal++;
            }

            let matchType = null;
            let matchedEmpSkill = null;

            // ==========================================
            // TIER 1 — EXACT MATCH
            // ORIGINAL EMPLOYEE SKILLS ONLY
            // ==========================================

            for (const empSkill of normalizedEmployeeSkills) {
                if (empSkill === reqLower) {
                    matchType = 'exact';
                    matchedEmpSkill = empSkill;
                    break;
                }
            }

            // ==========================================
            // TIER 2 — ALIAS MATCH
            // EMPLOYEE SKILLS FIRST
            // ==========================================

            let aliasReason = null;

            if (!matchType) {
                for (const empSkill of normalizedEmployeeSkills) {
                    const aliasResult = isAliasRelated(
                        empSkill,
                        reqLower
                    );
                    if (aliasResult) {
                        matchType = 'alias';
                        matchedEmpSkill = empSkill;
                        aliasReason = aliasResult.reason;
                        break;
                    }
                }
            }

            // ==========================================
            // TIER 2B — ALIAS MATCH THROUGH COMPONENT
            // ==========================================

            if (!matchType) {
                for (const component of normalizedComponents) {
                    const aliasResult = isAliasRelated(
                        component,
                        reqLower
                    );
                    if (aliasResult) {
                        matchType = 'alias';
                        matchedEmpSkill = component;
                        aliasReason = `component alias — ${aliasResult.reason}`;
                        break;
                    }
                }
            }

            // ==========================================
            // TIER 3 — COMPONENT EXACT MATCH
            // ==========================================

            if (!matchType) {
                for (const component of normalizedComponents) {
                    if (component === reqLower) {
                        matchType = 'component';
                        matchedEmpSkill = component;
                        break;
                    }
                }
            }

            // ==========================================
            // TIER 4 — TOKEN SUBSET MATCH (NEW)
            // Handles compound employee skills that fully cover a
            // narrower requirement, e.g. employee "gas and oil planning"
            // satisfies requirement "gas planning" — regardless of word
            // order or connector words ("and", "&", commas, hyphens).
            // Deliberately NOT edit-distance/fuzzy: fuzzy matching on
            // short technical terms produces false positives (e.g.
            // "php"~"sap", "react"~"redact" are 1-2 edits apart).
            // Requires >=2 meaningful tokens in the requirement so a
            // single-word requirement never loose-matches (see
            // isSubsetMatch's minReqTokens guard).
            // ==========================================

            if (!matchType) {
                for (const empSkill of employeeSkills) {
                    if (isSubsetMatch(reqSkill, empSkill)) {
                        matchType = 'subset';
                        matchedEmpSkill = this._normalize(empSkill);
                        break;
                    }
                }
            }

            // ==========================================
            // TIER 5 — TOKEN-LEVEL JACCARD MATCH (fallback, last resort)
            // Two skill strings match if their word-token sets share
            // >= 0.75 Jaccard similarity. Kept as a loose safety net for
            // cases Tiers 1-4 miss (different word order + extra filler,
            // synonyms not yet in the alias table, etc.)
            // ==========================================

            if (!matchType) {
                const partialCandidates = [
                    ...employeeSkills,
                    ...employeeComponents,
                    ...derivedEmployeeComponents
                ];

                for (const candidate of partialCandidates) {
                    const sim = jaccardSimilarity(reqSkill, candidate);
                    if (sim >= 0.75) {
                        matchType = 'partial';
                        matchedEmpSkill = this._normalize(candidate);
                        break;
                    }
                }
            }

            const matched = Boolean(matchType);

            let originalMatchedSkill = null;

            if (matched) {
                originalMatchedSkill =
                    employeeSkills.find(
                        skill =>
                            this._normalize(skill) ===
                            matchedEmpSkill
                    ) ||
                    employeeComponents.find(
                        component =>
                            this._normalize(component) ===
                            matchedEmpSkill
                    ) ||
                    derivedComponentSources.get(matchedEmpSkill) ||
                    matchedEmpSkill;

                matchedWeight += weight;

                if (skillType === 'primary') {
                    primaryMatched++;
                } else {
                    secondaryMatched++;
                }
            }

            matchDetails.push({
                reqSkill,
                skill_type: skillType,
                matched_employee_skill:
                    originalMatchedSkill,
                match_type:
                    matchType || 'none',
                matched,
                alias_reason: matchType === 'alias' ? aliasReason : null
            });

            console.log(
                `\n${idx + 1}. Requirement: "${reqSkill}" | Type: ${skillType.toUpperCase()}`
            );

            if (matched) {
                const labelMap = {
                    exact: 'EXACT MATCH',
                    alias: 'ALIAS MATCH',
                    component: 'COMPONENT MATCH',
                    subset: 'SUBSET MATCH',
                    partial: 'PARTIAL MATCH'
                };

                console.log(
                    `   Employee Skill: "${originalMatchedSkill}" → ✅ ${labelMap[matchType]}`
                );

                if (matchType === 'alias' && aliasReason) {
                    console.log(`   Alias reason: ${aliasReason}`);
                }
            } else if (skillType === 'primary') {
                console.log(
                    `   ❌ Missing PRIMARY skill: "${reqSkill}"`
                );
            } else {
                console.log(
                    `   ⚠️ Missing SECONDARY skill: "${reqSkill}"`
                );
            }
        }

        const matchedSkills = matchDetails
            .filter(detail => detail.matched)
            .map(detail =>
                detail.matched_employee_skill
            );

        const missingSkills = matchDetails
            .filter(detail => !detail.matched)
            .map(detail => ({
                skill: detail.reqSkill,
                skill_type: detail.skill_type
            }));

        const matchingScore =
            totalWeight > 0
                ? matchedWeight / totalWeight
                : 0;

        // ─── Mandatory Prerequisite Factor (F_req) ───────────────────────────
        const prereqFulfillment = primaryTotal > 0 ? primaryMatched / primaryTotal : 1;
        const missingCoreSkills = prereqFulfillment < 0.5;

        console.log(
            `\n📊 ${employee.first_name} ${employee.last_name}:`
        );

        console.log(
            `   Primary: ${primaryMatched}/${primaryTotal} matched`
        );

        console.log(
            `   Secondary: ${secondaryMatched}/${secondaryTotal} matched`
        );

        console.log(
            `   Overall: ${matchedSkills.length}/${requiredSkills.length} matched (weighted score: ${Math.round(matchingScore * 100)}%)`
        );

        // ==========================================
        // RECOMMENDATION CALCULATION (In-Memory Preloaded)
        // ==========================================

        const workload = context?.preloaded
            ? (context.workloadByProfile[employee.id] ?? 0)
            : await this._getWorkloadScore(employee.id);

        const availabilityFactor = this._calculateAvailability(workload);

        const historicalPerformance = context?.preloaded
            ? (context.perfByProfile[employee.id] ?? this.DEFAULT_HP)
            : await this._getHistoricalPerformance(employee.id);

        const { skill: ws, availability: wa, performance: wp } = this.COMPOSITE_WEIGHTS;
        const recommendationScore =
            (ws * matchingScore) +
            (wa * availabilityFactor) +
            (wp * historicalPerformance);

        return {
            profileId: employee.id,
            employeeId: employee.employee_id,

            name:
                `${employee.first_name} ${employee.last_name}`,

            firstName: employee.first_name,
            lastName: employee.last_name,

            department:
                employee.department || null,

            role:
                employee.role || null,

            branchId:
                employee.branch_id || null,

            matchingScore:
                Math.round(
                    matchingScore * 1000
                ) / 1000,

            workloadScore: workload,

            availabilityFactor:
                Math.round(
                    availabilityFactor * 1000
                ) / 1000,

            historicalPerformance:
                Math.round(
                    historicalPerformance * 1000
                ) / 1000,

            recommendationScore:
                Math.round(
                    recommendationScore * 1000
                ) / 1000,

            matchedSkills,

            missingSkills,

            primarySkillMatchCount:
                `${primaryMatched}/${primaryTotal}`,

            secondarySkillMatchCount:
                `${secondaryMatched}/${secondaryTotal}`,

            skillMatchCount:
                `${matchedSkills.length}/${requiredSkills.length}`,

            prereqFulfillment: Math.round(prereqFulfillment * 100),
            missingCoreSkills,

            matchDetails,

            breakdown: {
                skillMatchScore: Math.round(matchingScore * 100),
                primarySkills: {
                    matched: matchDetails.filter(d => d.matched && d.skill_type === 'primary').map(d => d.reqSkill),
                    missing: matchDetails.filter(d => !d.matched && d.skill_type === 'primary').map(d => d.reqSkill),
                    fulfillment: `${primaryMatched}/${primaryTotal} (${Math.round(prereqFulfillment * 100)}%)`
                },
                secondarySkills: {
                    matched: matchDetails.filter(d => d.matched && d.skill_type === 'secondary').map(d => d.reqSkill),
                    missing: matchDetails.filter(d => !d.matched && d.skill_type === 'secondary').map(d => d.reqSkill),
                    fulfillment: `${secondaryMatched}/${secondaryTotal} (${primaryTotal > 0 ? Math.round(secondaryMatched / Math.max(secondaryTotal, 1) * 100) : 0}%)`
                },
                matchDetails: matchDetails.filter(d => d.matched).map(d => ({
                    required: d.reqSkill,
                    matchedWith: d.matched_employee_skill,
                    type: d.match_type,
                    reason: d.alias_reason
                })),
                availability: {
                    score: Math.round(availabilityFactor * 100),
                    workloadPoints: workload,
                    status: workload <= 4 ? 'Available' : workload <= 7 ? 'Partially Available' : 'High Workload'
                },
                performance: {
                    score: Math.round(historicalPerformance * 100)
                }
            },

            status:
                missingCoreSkills
                    ? 'Missing Core Skills'
                    : this._getRecommendationStatus(recommendationScore)
        };
    }

    /**
     * Get skill components for an employee
     */
    async _getEmployeeSkillComponents(profileId) {
        console.log(`📋 Getting skill components for employee ${profileId}`);
        
        try {
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
     * ✅ FIXED: removed hardcoded DEBUG_SKILL / console.table block.
     * ✅ FIXED: alias collisions (one alias name mapping to more than one
     * master) are now resolved deterministically — alphabetically-first
     * master name wins, instead of "whichever row Supabase returned last".
     * Recommend also adding a UNIQUE constraint on
     * skill_aliases.alias_skill_id as the permanent, DB-level fix.
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
                    if (aliasMap[aliasName] && aliasMap[aliasName] !== masterName) {
                        // Deterministic tie-break: keep the alphabetically
                        // first master name so results are stable across
                        // requests, regardless of DB row order.
                        if (masterName < aliasMap[aliasName]) {
                            console.warn(
                                `⚠️ Alias "${aliasName}" maps to multiple masters ("${aliasMap[aliasName]}", "${masterName}"). Keeping "${masterName}" (alphabetically first). Add a UNIQUE constraint on skill_aliases.alias_skill_id to prevent this at the data level.`
                            );
                            aliasMap[aliasName] = masterName;
                        } else {
                            console.warn(
                                `⚠️ Alias "${aliasName}" maps to multiple masters ("${aliasMap[aliasName]}", "${masterName}"). Keeping "${aliasMap[aliasName]}" (alphabetically first). Add a UNIQUE constraint on skill_aliases.alias_skill_id to prevent this at the data level.`
                            );
                        }
                    } else {
                        aliasMap[aliasName] = masterName;
                    }

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

    /**
     * Get available employees with BRANCH FILTERING.
     * ✅ FIXED: excludeIds are now validated as real UUIDs before being
     * interpolated into the PostgREST filter string, closing a SQL/filter
     * injection surface (a malformed or malicious id could previously
     * corrupt or hijack the `.not('id','in', ...)` clause).
     */
    async _getAvailableEmployees(excludeIds = [], userBranchId = null, isSuperAdmin = false) {
        console.log(`📋 Getting available employees...`);
        console.log(`🏢 Branch filter: ${isSuperAdmin ? 'ALL' : userBranchId}`);
        
        try {
            let query = supabase
                .from('profiles')
                .select(`
                    id, 
                    employee_id, 
                    first_name, 
                    last_name, 
                    role,
                    branch_id,
                    department_id,
                    departments:department_id (
                        department_name
                    )
                `)
                .eq('status', 'Active')
                .eq('role', 'Employee');

            if (!isSuperAdmin && userBranchId) {
                query = query.eq('branch_id', userBranchId);
                console.log(`🔍 Filtering employees by branch: ${userBranchId}`);
            }

            if (excludeIds.length > 0) {
                const safeIds = excludeIds.filter(isUuid);
                if (safeIds.length !== excludeIds.length) {
                    console.warn(`⚠️ Dropped ${excludeIds.length - safeIds.length} non-UUID id(s) from exclude list`);
                }
                if (safeIds.length > 0) {
                    query = query.not('id', 'in', `(${safeIds.join(',')})`);
                }
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
                branch_id: emp.branch_id,
                department: emp.departments?.department_name || null
            }));
            
            console.log(`✅ Found ${employees.length} employees in ${isSuperAdmin ? 'ALL branches' : 'branch'}`);
            return employees;
        } catch (error) {
            console.error('❌ Error in _getAvailableEmployees:', error);
            return [];
        }
    }

    /**
     * Returns [{ skill, skill_type }] preserving the ORIGINAL requirement text.
     */
    async _getRequiredSkills(requirementId) {
        console.log(`📋 Getting required skills for requirement ${requirementId}`);

        try {
            const { data, error } = await supabase
                .from('requirement_skills')
                .select('skills, skill_type')
                .eq('requirement_id', requirementId);

            if (error) {
                console.error('❌ Error fetching requirement skills:', error);
                return [];
            }

            if (!data || data.length === 0) {
                console.log('📋 No skills found for this requirement');
                return [];
            }

            const allSkills = [];

            data.forEach(item => {
                if (!item.skills) return;

                const skillValue =
                    typeof item.skills === 'string'
                        ? item.skills.trim()
                        : item.skills;

                const skillType =
                    (item.skill_type || 'primary')
                        .toLowerCase()
                        .trim();

                if (skillValue) {
                    allSkills.push({
                        skill: skillValue,
                        skill_type: skillType === 'secondary'
                            ? 'secondary'
                            : 'primary'
                    });
                }
            });

            const seen = new Set();
            const uniqueSkills = [];

            for (const item of allSkills) {
                const key = this._normalize(item.skill);

                if (!seen.has(key)) {
                    seen.add(key);
                    uniqueSkills.push(item);
                }
            }

            console.log(
                `📋 Found ${uniqueSkills.length} skills for requirement ${requirementId}:`,
                uniqueSkills.map(
                    s => `${s.skill} [${s.skill_type}]`
                )
            );

            return uniqueSkills;

        } catch (error) {
            console.error('❌ Error in _getRequiredSkills:', error);
            return [];
        }
    }

    /**
     * Legacy path: also retrieves and preserves skill_type.
     */
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
                .select('skills, skill_type')
                .in('requirement_id', requirementIds);

            if (skillsError || !skillsData) {
                return [];
            }

            const allSkills = [];

            skillsData.forEach(item => {
                if (!item.skills) return;

                const skillType =
                    (item.skill_type || 'primary')
                        .toLowerCase()
                        .trim() === 'secondary'
                        ? 'secondary'
                        : 'primary';

                if (
                    typeof item.skills === 'string' &&
                    item.skills.includes(',')
                ) {
                    item.skills
                        .split(',')
                        .map(s => s.trim())
                        .filter(Boolean)
                        .forEach(skill => {
                            allSkills.push({
                                skill,
                                skill_type: skillType
                            });
                        });
                } else {
                    const skillValue =
                        typeof item.skills === 'string'
                            ? item.skills.trim()
                            : item.skills;

                    if (skillValue) {
                        allSkills.push({
                            skill: skillValue,
                            skill_type: skillType
                        });
                    }
                }
            });

            const seen = new Set();
            const uniqueSkills = [];

            for (const item of allSkills) {
                const key = this._normalize(item.skill);

                if (!seen.has(key)) {
                    seen.add(key);
                    uniqueSkills.push(item);
                }
            }

            console.log(
                `📋 Found ${uniqueSkills.length} project skills:`,
                uniqueSkills.map(
                    s => `${s.skill} [${s.skill_type}]`
                )
            );

            return uniqueSkills;

        } catch (error) {
            console.error(
                '❌ Error in _getRequiredSkillsForProject:',
                error
            );
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

    /**
     * Sigmoid availability formula.
     * At workload 0: ~99%. At workload 7: ~50%. At workload 10+: ~18%.
     * Highly-loaded employees remain visible (never zeroed out).
     */
    _calculateAvailability(workload) {
        return 1 / (1 + Math.exp(0.4 * (workload - 7)));
    }

    async _getHistoricalPerformance(profileId) {
        try {
            const { data, error } = await supabase
                .from('performance_records')
                .select('rating')
                .eq('profile_id', profileId)
                .eq('feedback_source', 'client')
                .eq('feedback_status', 'submitted');

            if (error) {
                console.error('❌ Error fetching performance records:', error);
                return this.DEFAULT_HP;
            }

            if (!data || data.length === 0) {
                console.log(`📋 No performance records found for employee ${profileId}, using default`);
                return this.DEFAULT_HP;
            }

            const totalRating = data.reduce((sum, record) => sum + Number(record.rating), 0);
            const avgRating = totalRating / data.length;

            const hp = Math.min(avgRating / 5, 1.0);
            
            console.log(`📊 Employee ${profileId}: ${data.length} records, avg rating: ${avgRating.toFixed(2)}, HP: ${hp.toFixed(3)}`);
            
            return hp;
        } catch (error) {
            console.error('❌ Error in _getHistoricalPerformance:', error);
            return this.DEFAULT_HP;
        }
    }

    async _getPerformanceDetails(profileId) {
        try {
            const { data, error } = await supabase
                .from('performance_records')
                .select(`
                    rating,
                    technical_skills_rating,
                    communication_rating,
                    timeliness_rating,
                    quality_of_work_rating,
                    teamwork_rating,
                    problem_solving_rating,
                    deliverables_feedback,
                    strengths,
                    areas_for_improvement,
                    client_name,
                    client_feedback,
                    project_id,
                    rated_at,
                    projects:project_id (
                        project_name
                    )
                `)
                .eq('profile_id', profileId)
                .eq('feedback_source', 'client')
                .eq('feedback_status', 'submitted')
                .order('rated_at', { ascending: false });

            if (error) {
                console.error('❌ Error fetching performance details:', error);
                return this._getDefaultPerformanceDetails();
            }

            if (!data || data.length === 0) {
                console.log(`📋 No performance details found for employee ${profileId}`);
                return this._getDefaultPerformanceDetails();
            }

            const count = data.length;
            const avgRating = data.reduce((sum, r) => sum + Number(r.rating), 0) / count;
            
            const avgTechnical = data.reduce((sum, r) => sum + (Number(r.technical_skills_rating) || 0), 0) / count;
            const avgCommunication = data.reduce((sum, r) => sum + (Number(r.communication_rating) || 0), 0) / count;
            const avgTimeliness = data.reduce((sum, r) => sum + (Number(r.timeliness_rating) || 0), 0) / count;
            const avgQuality = data.reduce((sum, r) => sum + (Number(r.quality_of_work_rating) || 0), 0) / count;
            const avgTeamwork = data.reduce((sum, r) => sum + (Number(r.teamwork_rating) || 0), 0) / count;
            const avgProblemSolving = data.reduce((sum, r) => sum + (Number(r.problem_solving_rating) || 0), 0) / count;

            const latest = data[0];

            return {
                averageRating: avgRating,
                ratingCount: count,
                hasData: true,
                ratings: data.map(r => ({
                    rating: Number(r.rating),
                    ratedAt: r.rated_at,
                    clientName: r.client_name,
                    projectName: r.projects?.project_name || null,
                    feedback: r.deliverables_feedback || r.client_feedback || null
                })),
                technicalSkills: avgTechnical,
                communication: avgCommunication,
                timeliness: avgTimeliness,
                qualityOfWork: avgQuality,
                teamwork: avgTeamwork,
                problemSolving: avgProblemSolving,
                strengths: latest?.strengths || null,
                areasForImprovement: latest?.areas_for_improvement || null,
                recentFeedback: data.slice(0, 3).map(r => ({
                    clientName: r.client_name,
                    rating: Number(r.rating),
                    feedback: r.deliverables_feedback || r.client_feedback || null,
                    projectName: r.projects?.project_name || null,
                    date: r.rated_at
                }))
            };
        } catch (error) {
            console.error('❌ Error in _getPerformanceDetails:', error);
            return this._getDefaultPerformanceDetails();
        }
    }

    _getDefaultPerformanceDetails() {
        return {
            averageRating: 0,
            ratingCount: 0,
            hasData: false,
            ratings: [],
            technicalSkills: 0,
            communication: 0,
            timeliness: 0,
            qualityOfWork: 0,
            teamwork: 0,
            problemSolving: 0,
            strengths: null,
            areasForImprovement: null,
            recentFeedback: []
        };
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
