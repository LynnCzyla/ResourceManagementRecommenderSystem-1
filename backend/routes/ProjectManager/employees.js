// backend/routes/ProjectManager/employees.js
const express = require('express');
const router = express.Router();
const supabase = require('../../supabase');

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
function transformEmployee(row) {
  const name = [row.first_name, row.last_name].filter(Boolean).join(' ') || 'Unnamed';
  return {
    id: row.id,
    employeeId: row.employee_id,
    name,
    role: row.positions?.position_name || 'Unassigned',
    department: row.departments?.department_name || '',
    avatar: row.avatar_url || `https://ui-avatars.com/api/?background=3b82f6&color=fff&name=${encodeURIComponent(name)}`,
    availability: row.availability_status,
    totalAvailableHours: row.total_available_hours,
  };
}

const EMPLOYEE_SELECT = `
  id,
  employee_id,
  first_name,
  last_name,
  avatar_url,
  availability_status,
  total_available_hours,
  status,
  positions ( position_name ),
  departments ( department_name )
`;

// GET /api/pm/employees — list active employees with caching
router.get('/employees', async (req, res) => {
  try {
    const { departmentId, pmId, projectId } = req.query;

    // Check cache for this exact query
    const cacheKey = getCacheKey({ departmentId, pmId, projectId });
    const cachedData = getCached(cacheKey);
    if (cachedData) {
      console.log(`📦 Cache hit for employees: ${cacheKey}`);
      return res.status(200).json({ success: true, data: cachedData });
    }

    console.log(`🔍 Cache miss for employees: ${cacheKey}`);

    let allowedProfileIds = null;

    // Optimize: If no pmId and no projectId, return all active employees
    // (but only if no pmId or projectId filter)
    if (!pmId && !projectId && !departmentId) {
      const { data, error } = await supabase
        .from('profiles')
        .select(EMPLOYEE_SELECT)
        .eq('status', 'Active')
        .order('first_name', { ascending: true });

      if (error) throw error;
      
      const transformed = (data || []).map(transformEmployee);
      setCache(cacheKey, transformed);
      
      return res.status(200).json({ success: true, data: transformed });
    }

    if (projectId) {
      // Scoped to a single project
      if (pmId) {
        // Verify project belongs to this PM
        const { data: project, error: projectError } = await supabase
          .from('projects')
          .select('id')
          .eq('id', projectId)
          .eq('created_by', pmId)
          .maybeSingle();
        
        if (projectError) throw projectError;
        if (!project) {
          return res.status(200).json({ success: true, data: [] });
        }
      }

      const { data: assignments, error: assignmentsError } = await supabase
        .from('project_assignments')
        .select('profile_id')
        .eq('project_id', projectId);
      
      if (assignmentsError) throw assignmentsError;

      allowedProfileIds = [...new Set((assignments || []).map(a => a.profile_id))];
      if (allowedProfileIds.length === 0) {
        return res.status(200).json({ success: true, data: [] });
      }
    } else if (pmId) {
      // Get all projects for this PM
      const { data: pmProjects, error: projectsError } = await supabase
        .from('projects')
        .select('id')
        .eq('created_by', pmId);
      
      if (projectsError) throw projectsError;

      const projectIds = (pmProjects || []).map(p => p.id);
      if (projectIds.length === 0) {
        return res.status(200).json({ success: true, data: [] });
      }

      // Get all assignments for these projects
      const { data: assignments, error: assignmentsError } = await supabase
        .from('project_assignments')
        .select('profile_id')
        .in('project_id', projectIds);
      
      if (assignmentsError) throw assignmentsError;

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

    const transformed = (data || []).map(transformEmployee);
    
    // Cache the result
    setCache(cacheKey, transformed);

    res.status(200).json({ success: true, data: transformed });
  } catch (error) {
    console.error('Error fetching employees:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch employees', 
      error: error.message 
    });
  }
});

// Add a cache clear endpoint (optional, for when employees are updated)
router.post('/employees/cache/clear', (req, res) => {
  cache.clear();
  res.status(200).json({ success: true, message: 'Employee cache cleared' });
});

module.exports = router;