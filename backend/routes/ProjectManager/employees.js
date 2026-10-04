// backend/routes/ProjectManager/employees.js
const express = require('express');
const router = express.Router();
const supabase = require('../../supabase');
const workloadService = require('../../services/workloadService');

// Simple in-memory cache with TTL
const cache = new Map();
const CACHE_TTL = 60000; // 60 seconds

function getCacheKey(params) {
  return JSON.stringify(Object.keys(params).sort().reduce((obj, key) => {
    obj[key] = params[key];
    return obj;
  }, {}));
}

function getCached(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CACHE_TTL) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}

function setCache(key, data) {
  cache.set(key, {
    data,
    timestamp: Date.now()
  });
}

// Transform a profiles row into the shape the PM tabs expect
function transformEmployee(row, projectIds = []) {
  const name = [row.first_name, row.last_name].filter(Boolean).join(' ') || 'Unnamed';
  
  // Directly read availability_status from profiles, with sigmoid factor calculation
  const details = workloadService.getWorkloadDetails(row.id, row.availability_status || 'Available');
  const availability = row.availability_status || details.workloadStatus || 'Available';
  const totalAvailableHours = Math.round((details.availabilityFactor ?? 1.0) * 40);

  
  return {
    id: row.id,
    employeeId: row.employee_id,
    name,
    role: row.positions?.position_name || 'Unassigned',
    department: row.departments?.department_name || '',
    avatar: row.avatar_url || `https://ui-avatars.com/api/?background=3b82f6&color=fff&name=${encodeURIComponent(name)}`,
    availability: availability,
    totalAvailableHours: totalAvailableHours,
    projectIds: projectIds,
    projectId: projectIds.length > 0 ? projectIds[0] : null,
  };
}

function transformMaskedEmployee(projectId, index, assignment = {}) {
  return {
    id: `masked-${projectId}-${index}`,
    employeeId: null,
    name: 'Unassigned',
    role: assignment.assigned_role || 'Unassigned',
    department: '',
    avatar: null,
    availability: 'Unavailable',
    totalAvailableHours: 0,
    projectId,
    isMasked: true,
  };
}

// ✅ Updated SELECT without total_available_hours
const EMPLOYEE_SELECT = `
  id,
  employee_id,
  first_name,
  last_name,
  avatar_url,
  availability_status,
  status,
  positions ( position_name ),
  departments ( department_name )
`;

// ✅ CHANGED: GET /api/pm/employees — list active employees with caching
// Changed from '/employees' to '/'
router.get('/', async (req, res) => {
  try {
    const { departmentId, pmId, projectId } = req.query;
    const effectivePmId = req.user?.role === 'Project Manager'
      ? req.user.id
      : pmId;

    // Check cache for this exact query
    const useCache = !projectId;
    const cacheKey = getCacheKey({
      departmentId,
      pmId: effectivePmId,
      projectId,
      viewerId: req.user?.id,
      viewerRole: req.user?.role,
    });
    if (useCache) {
      const cachedData = getCached(cacheKey);
      if (cachedData) {
        console.log(`📦 Cache hit for employees: ${cacheKey}`);
        return res.status(200).json({ success: true, data: cachedData });
      }
    }

    console.log(`🔍 Cache miss for employees: ${cacheKey}`);

    let allowedProfileIds = null;
    let maskedAssignments = [];
    const profileToProjectsMap = {};

    // Optimize: If no pmId and no projectId, return all active employees
    // (but only if no pmId or projectId filter)
    if (!effectivePmId && !projectId && !departmentId) {
      const { data, error } = await supabase
        .from('profiles')
        .select(EMPLOYEE_SELECT)
        .eq('status', 'Active')
        .order('first_name', { ascending: true });

      if (error) throw error;
      
      const transformed = (data || []).map(row => transformEmployee(row));
      setCache(cacheKey, transformed);
      
      return res.status(200).json({ success: true, data: transformed });
    }

    if (projectId) {
      // Scoped to a single project
      const { data: project, error: projectError } = await supabase
        .from('projects')
        .select('id, created_by')
        .eq('id', projectId)
        .maybeSingle();

      if (projectError) throw projectError;
      if (!project) return res.status(200).json({ success: true, data: [] });

      const { data: assignments, error: assignmentsError } = await supabase
        .from('project_assignments')
        .select('profile_id, assigned_role')
        .eq('project_id', projectId)
        .in('status', ['Assigned', 'Active']);
      
      if (assignmentsError) throw assignmentsError;

      if (req.user?.role === 'Project Manager' && project.created_by !== req.user.id) {
        const masked = (assignments || []).map((assignment, index) =>
          transformMaskedEmployee(projectId, index, assignment)
        );
        return res.status(200).json({ success: true, data: [] });
      }

      (assignments || []).forEach(a => {
        if (!profileToProjectsMap[a.profile_id]) profileToProjectsMap[a.profile_id] = [];
        profileToProjectsMap[a.profile_id].push(projectId);
      });

      allowedProfileIds = [...new Set((assignments || []).map(a => a.profile_id))];
      if (allowedProfileIds.length === 0) {
        return res.status(200).json({ success: true, data: [] });
      }
    } else if (effectivePmId) {
      // Get only Active projects for this PM (exclude Completed, Cancelled, Deleted)
      let projectsQuery = supabase
        .from('projects')
        .select('id, created_by')
        .eq('status', 'Active');

      projectsQuery = projectsQuery.eq('created_by', effectivePmId);

      const { data: pmProjects, error: projectsError } = await projectsQuery;
      
      if (projectsError) throw projectsError;

      const projectIds = (pmProjects || []).map(p => p.id);
      if (projectIds.length === 0) {
        return res.status(200).json({ success: true, data: [] });
      }

      // Get active assignments for these projects
      const { data: assignments, error: assignmentsError } = await supabase
        .from('project_assignments')
        .select('profile_id, project_id, assigned_role')
        .in('project_id', projectIds)
        .in('status', ['Assigned', 'Active']);
      
      if (assignmentsError) throw assignmentsError;

      (assignments || []).forEach(a => {
        if (!profileToProjectsMap[a.profile_id]) profileToProjectsMap[a.profile_id] = [];
        profileToProjectsMap[a.profile_id].push(a.project_id);
      });

      allowedProfileIds = [...new Set((assignments || []).map(a => a.profile_id))];
      if (allowedProfileIds.length === 0) {
        return res.status(200).json({ success: true, data: [] });
      }
    }

    // Build the final query
    let query = supabase
      .from('profiles')
      .select(EMPLOYEE_SELECT)
      .eq('status', 'Active')
      .order('first_name', { ascending: true });

    if (departmentId) {
      query = query.eq('department_id', departmentId);
    }
    
    if (allowedProfileIds) {
      query = query.in('id', allowedProfileIds);
    }

    const { data, error } = await query;
    if (error) throw error;

    // Fetch PM evaluated profile IDs for this project
    const evaluatedProfileIds = new Set();
    if (projectId) {
      const { data: evaluations, error: evalError } = await supabase
        .from('performance_records')
        .select('profile_id')
        .eq('project_id', projectId)
        .eq('feedback_source', 'project_manager');
      if (!evalError && evaluations) {
        evaluations.forEach(ev => evaluatedProfileIds.add(ev.profile_id));
      }
    }

    // ✅ Get workload scores for each employee
    const employeeIds = (data || []).map(emp => emp.id);
    let workloadMap = {};
    
    if (employeeIds.length > 0) {
      const { data: tasksData, error: tasksError } = await supabase
        .from('project_tasks')
        .select('profile_id, priority')
        .in('profile_id', employeeIds)
        .in('status', ['Active', 'In Progress']);

      if (!tasksError && tasksData) {
        const priorityWeights = { 'High': 3, 'Medium': 2, 'Low': 1 };
        tasksData.forEach(task => {
          if (!workloadMap[task.profile_id]) {
            workloadMap[task.profile_id] = 0;
          }
          workloadMap[task.profile_id] += priorityWeights[task.priority] || 1;
        });
      }
    }

    // Transform with workload data and evaluated flag
    const transformed = (data || []).map(emp => {
      const workloadScore = workloadMap[emp.id] || 0;
      const empProjectIds = profileToProjectsMap[emp.id] || (projectId ? [projectId] : []);
      return {
        ...transformEmployee({
          ...emp,
          workload_score: workloadScore
        }, empProjectIds),
        isEvaluated: evaluatedProfileIds.has(emp.id)
      };
    });
    
    const masked = maskedAssignments.map((assignment, index) =>
      transformMaskedEmployee(assignment.project_id, index, assignment)
    );
    const result = [...transformed, ...masked];

    // Cache the result if caching is enabled
    if (useCache) {
      setCache(cacheKey, result);
    }

    res.status(200).json({ success: true, data: result });
  } catch (error) {
    console.error('Error fetching employees:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch employees', 
      error: error.message 
    });
  }
});

// ✅ CHANGED: Add a cache clear endpoint (optional, for when employees are updated)
// Changed from '/employees/cache/clear' to '/cache/clear'
router.post('/cache/clear', (req, res) => {
  cache.clear();
  res.status(200).json({ success: true, message: 'Employee cache cleared' });
});

module.exports = router;
module.exports.invalidateEmployeesCache = () => cache.clear();