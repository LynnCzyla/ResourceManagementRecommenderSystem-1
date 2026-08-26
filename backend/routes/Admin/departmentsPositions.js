// routes/Admin/departmentsPositions.js
const express = require('express');
const router = express.Router();
const supabase = require('../../supabase');
const { logAuditEvent } = require('../../utils/auditLogger');
const { verifyToken } = require('../Middleware/auth');

// ✅ Apply auth middleware to ALL routes
router.use(verifyToken);

// ══════════════════════════════════════════════════════════════════════════════
// DEPARTMENTS - Filtered by Branch
// ══════════════════════════════════════════════════════════════════════════════

// GET /api/admin/departments — fetch departments for the user's branch
router.get('/departments', async (req, res) => {
  try {
    console.log(`📊 Departments requested by: ${req.user.employee_id} (${req.user.role})`);
    console.log(`🏢 Branch filter: ${req.user.is_super_admin ? 'ALL' : req.user.branch_id}`);

    let query = supabase
      .from('departments')
      .select('*')
      .order('department_name', { ascending: true });

    // ✅ Filter by branch for non-super admins
    if (!req.user.is_super_admin && req.user.branch_id) {
      query = query.eq('branch_id', req.user.branch_id);
    }

    const { data, error } = await query;

    if (error) throw error;

    res.status(200).json({ 
      success: true, 
      data: data || [],
      meta: {
        branch_filter: req.user.is_super_admin ? 'all' : req.user.branch_id,
        user_role: req.user.role,
        is_super_admin: req.user.is_super_admin,
      }
    });
  } catch (error) {
    console.error('Error fetching departments:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch departments.',
    });
  }
});

// POST /api/admin/departments — create a new department (branch-aware)
router.post('/departments', async (req, res) => {
  try {
    const { department_name, description } = req.body;

    if (!department_name || !department_name.trim()) {
      return res.status(400).json({
        success: false,
        error: 'Department name is required.',
      });
    }

    // ✅ Get the branch ID from the authenticated user
    const branchId = req.user.branch_id;

    if (!branchId && !req.user.is_super_admin) {
      return res.status(403).json({
        success: false,
        error: 'Your account is not assigned to a branch.',
      });
    }

    // ✅ Super Admin can create departments for any branch (optional)
    // If branch_id is passed in body, Super Admin can override
    let targetBranchId = branchId;
    if (req.user.is_super_admin && req.body.branch_id) {
      targetBranchId = req.body.branch_id;
    }

    // ✅ Check for duplicate name within the same branch
    const { data: existing } = await supabase
      .from('departments')
      .select('id')
      .ilike('department_name', department_name.trim())
      .eq('branch_id', targetBranchId)
      .limit(1);

    if (existing && existing.length > 0) {
      return res.status(400).json({
        success: false,
        error: `A department named "${department_name.trim()}" already exists in this branch.`,
      });
    }

    const { data, error } = await supabase
      .from('departments')
      .insert({
        department_name: department_name.trim(),
        description: description?.trim() || null,
        branch_id: targetBranchId, // ✅ Assign to the user's branch
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) throw error;

    await logAuditEvent({
      req,
      userId: req.user.id,
      action: 'Created',
      systemCategory: 'Departments',
      logDescription: `Created new department: ${department_name.trim()} for branch ${targetBranchId}`,
      branch: targetBranchId,
      performed_by: req.user.employee_id
    });

    res.status(201).json({
      success: true,
      message: 'Department created successfully.',
      data,
    });
  } catch (error) {
    console.error('Error creating department:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create department.',
    });
  }
});

// PUT /api/admin/departments/:id — update a department (with branch check)
router.put('/departments/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { department_name, description } = req.body;

    if (!department_name || !department_name.trim()) {
      return res.status(400).json({
        success: false,
        error: 'Department name is required.',
      });
    }

    // ✅ Check if user has permission to update this department
    const { data: existingDept, error: checkError } = await supabase
      .from('departments')
      .select('branch_id')
      .eq('id', id)
      .single();

    if (checkError) {
      return res.status(404).json({
        success: false,
        error: 'Department not found.',
      });
    }

    // Non-super admins can only update departments in their branch
    if (!req.user.is_super_admin && existingDept.branch_id !== req.user.branch_id) {
      return res.status(403).json({
        success: false,
        error: 'You do not have permission to update this department.',
      });
    }

    // ✅ Check for duplicate name within the same branch (excluding current record)
    const { data: duplicate } = await supabase
      .from('departments')
      .select('id')
      .ilike('department_name', department_name.trim())
      .eq('branch_id', existingDept.branch_id)
      .neq('id', id)
      .limit(1);

    if (duplicate && duplicate.length > 0) {
      return res.status(400).json({
        success: false,
        error: `A department named "${department_name.trim()}" already exists in this branch.`,
      });
    }

    const { data, error } = await supabase
      .from('departments')
      .update({
        department_name: department_name.trim(),
        description: description?.trim() || null,
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    if (!data) {
      return res.status(404).json({
        success: false,
        error: 'Department not found.',
      });
    }

    await logAuditEvent({
      req,
      userId: req.user.id,
      action: 'Updated',
      systemCategory: 'Departments',
      logDescription: `Updated department ${department_name.trim()}`,
      branch: req.user.branch_id,
      performed_by: req.user.employee_id
    });

    res.status(200).json({
      success: true,
      message: 'Department updated successfully.',
      data,
    });
  } catch (error) {
    console.error('Error updating department:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update department.',
    });
  }
});

// DELETE /api/admin/departments/:id — delete a department (with branch check)
router.delete('/departments/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // ✅ Check if user has permission to delete this department
    const { data: existingDept, error: checkError } = await supabase
      .from('departments')
      .select('branch_id, department_name')
      .eq('id', id)
      .single();

    if (checkError) {
      return res.status(404).json({
        success: false,
        error: 'Department not found.',
      });
    }

    // Non-super admins can only delete departments in their branch
    if (!req.user.is_super_admin && existingDept.branch_id !== req.user.branch_id) {
      return res.status(403).json({
        success: false,
        error: 'You do not have permission to delete this department.',
      });
    }

    // Guard: check if any positions are still linked
    const { data: linkedPositions } = await supabase
      .from('positions')
      .select('id')
      .eq('department_id', id)
      .limit(1);

    if (linkedPositions && linkedPositions.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'Cannot delete this department. Remove or reassign all positions under it first.',
      });
    }

    const { error } = await supabase
      .from('departments')
      .delete()
      .eq('id', id);

    if (error) throw error;

    await logAuditEvent({
      req,
      userId: req.user.id,
      action: 'Deleted',
      systemCategory: 'Departments',
      logDescription: `Removed department ${existingDept.department_name}`,
      branch: req.user.branch_id,
      performed_by: req.user.employee_id
    });

    res.status(200).json({
      success: true,
      message: 'Department deleted successfully.',
    });
  } catch (error) {
    console.error('Error deleting department:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete department.',
    });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// POSITIONS - Filtered by Branch (via Department)
// ══════════════════════════════════════════════════════════════════════════════

// GET /api/admin/positions — fetch positions (filtered by branch)
router.get('/positions', async (req, res) => {
  try {
    const { dept_id } = req.query;

    console.log(`📊 Positions requested by: ${req.user.employee_id} (${req.user.role})`);
    console.log(`🏢 Branch filter: ${req.user.is_super_admin ? 'ALL' : req.user.branch_id}`);
    console.log(`📋 Department filter: ${dept_id || 'ALL'}`);

    // ✅ First, get departments in the user's branch
    let deptQuery = supabase
      .from('departments')
      .select('id');

    if (!req.user.is_super_admin && req.user.branch_id) {
      deptQuery = deptQuery.eq('branch_id', req.user.branch_id);
    }

    const { data: branchDepts, error: deptError } = await deptQuery;

    if (deptError) throw deptError;

    const deptIds = branchDepts?.map(d => d.id) || [];

    if (deptIds.length === 0) {
      return res.status(200).json({ success: true, data: [] });
    }

    // ✅ Then get positions only from those departments
    let query = supabase
      .from('positions')
      .select(`
        *,
        departments (
          id,
          department_name,
          branch_id
        )
      `)
      .in('department_id', deptIds)
      .order('position_name', { ascending: true });

    if (dept_id) {
      // ✅ If dept_id is provided, make sure it's in the allowed list
      if (!deptIds.includes(Number(dept_id))) {
        return res.status(403).json({
          success: false,
          error: 'You do not have permission to view positions in this department.',
        });
      }
      query = query.eq('department_id', dept_id);
    }

    const { data, error } = await query;

    if (error) throw error;

    res.status(200).json({ 
      success: true, 
      data: data || [],
      meta: {
        branch_filter: req.user.is_super_admin ? 'all' : req.user.branch_id,
        department_filter: dept_id || 'all',
        user_role: req.user.role,
        is_super_admin: req.user.is_super_admin,
      }
    });
  } catch (error) {
    console.error('Error fetching positions:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch positions.',
    });
  }
});

// POST /api/admin/positions — create a new position (branch-aware)
router.post('/positions', async (req, res) => {
  try {
    const { position_name, department_id, description } = req.body;

    if (!position_name || !position_name.trim()) {
      return res.status(400).json({
        success: false,
        error: 'Position name is required.',
      });
    }

    if (!department_id) {
      return res.status(400).json({
        success: false,
        error: 'Department is required.',
      });
    }

    // ✅ Verify the department exists and user has access
    const { data: dept, error: deptError } = await supabase
      .from('departments')
      .select('id, branch_id, department_name')
      .eq('id', department_id)
      .single();

    if (deptError || !dept) {
      return res.status(400).json({
        success: false,
        error: 'Selected department does not exist.',
      });
    }

    // Non-super admins can only create positions in their branch
    if (!req.user.is_super_admin && dept.branch_id !== req.user.branch_id) {
      return res.status(403).json({
        success: false,
        error: 'You do not have permission to create positions in this department.',
      });
    }

    // ✅ Check for duplicate position name within the same department
    const { data: existing } = await supabase
      .from('positions')
      .select('id')
      .ilike('position_name', position_name.trim())
      .eq('department_id', department_id)
      .limit(1);

    if (existing && existing.length > 0) {
      return res.status(400).json({
        success: false,
        error: `A position named "${position_name.trim()}" already exists in this department.`,
      });
    }

    const { data, error } = await supabase
      .from('positions')
      .insert({
        position_name: position_name.trim(),
        department_id,
        description: description?.trim() || null,
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) throw error;

    await logAuditEvent({
      req,
      userId: req.user.id,
      action: 'Created',
      systemCategory: 'Departments',
      logDescription: `Created new position: ${position_name.trim()} in ${dept.department_name}`,
      branch: req.user.branch_id,
      performed_by: req.user.employee_id
    });

    res.status(201).json({
      success: true,
      message: 'Position created successfully.',
      data,
    });
  } catch (error) {
    console.error('Error creating position:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create position.',
    });
  }
});

// PUT /api/admin/positions/:id — update a position (with branch check)
router.put('/positions/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { position_name, department_id, description } = req.body;

    if (!position_name || !position_name.trim()) {
      return res.status(400).json({
        success: false,
        error: 'Position name is required.',
      });
    }

    if (!department_id) {
      return res.status(400).json({
        success: false,
        error: 'Department is required.',
      });
    }

    // ✅ Check if user has permission to update this position
    const { data: existingPosition, error: checkError } = await supabase
      .from('positions')
      .select(`
        id,
        position_name,
        department_id,
        departments (
          id,
          branch_id,
          department_name
        )
      `)
      .eq('id', id)
      .single();

    if (checkError || !existingPosition) {
      return res.status(404).json({
        success: false,
        error: 'Position not found.',
      });
    }

    const currentBranchId = existingPosition.departments?.branch_id;

    // Non-super admins can only update positions in their branch
    if (!req.user.is_super_admin && currentBranchId !== req.user.branch_id) {
      return res.status(403).json({
        success: false,
        error: 'You do not have permission to update this position.',
      });
    }

    // Verify the new department exists and is in the same branch
    const { data: newDept, error: deptError } = await supabase
      .from('departments')
      .select('id, branch_id, department_name')
      .eq('id', department_id)
      .single();

    if (deptError || !newDept) {
      return res.status(400).json({
        success: false,
        error: 'Selected department does not exist.',
      });
    }

    // Non-super admins can only move positions within their branch
    if (!req.user.is_super_admin && newDept.branch_id !== req.user.branch_id) {
      return res.status(403).json({
        success: false,
        error: 'You do not have permission to move positions to this department.',
      });
    }

    // ✅ Check for duplicate name within the same department (excluding current record)
    const { data: duplicate } = await supabase
      .from('positions')
      .select('id')
      .ilike('position_name', position_name.trim())
      .eq('department_id', department_id)
      .neq('id', id)
      .limit(1);

    if (duplicate && duplicate.length > 0) {
      return res.status(400).json({
        success: false,
        error: `A position named "${position_name.trim()}" already exists in this department.`,
      });
    }

    const { data, error } = await supabase
      .from('positions')
      .update({
        position_name: position_name.trim(),
        department_id,
        description: description?.trim() || null,
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    await logAuditEvent({
      req,
      userId: req.user.id,
      action: 'Updated',
      systemCategory: 'Departments',
      logDescription: `Updated position ${position_name.trim()}`,
      branch: req.user.branch_id,
      performed_by: req.user.employee_id
    });

    res.status(200).json({
      success: true,
      message: 'Position updated successfully.',
      data,
    });
  } catch (error) {
    console.error('Error updating position:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update position.',
    });
  }
});

// DELETE /api/admin/positions/:id — delete a position (with branch check)
router.delete('/positions/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // ✅ Check if user has permission to delete this position
    const { data: existingPosition, error: checkError } = await supabase
      .from('positions')
      .select(`
        id,
        position_name,
        departments (
          id,
          branch_id,
          department_name
        )
      `)
      .eq('id', id)
      .single();

    if (checkError || !existingPosition) {
      return res.status(404).json({
        success: false,
        error: 'Position not found.',
      });
    }

    const branchId = existingPosition.departments?.branch_id;

    // Non-super admins can only delete positions in their branch
    if (!req.user.is_super_admin && branchId !== req.user.branch_id) {
      return res.status(403).json({
        success: false,
        error: 'You do not have permission to delete this position.',
      });
    }

    // Guard: check if any employees are still assigned to this position
    const { data: linkedProfiles } = await supabase
      .from('profiles')
      .select('id')
      .eq('position_id', id)
      .limit(1);

    if (linkedProfiles && linkedProfiles.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'Cannot delete this position. Reassign all employees currently holding it first.',
      });
    }

    const { error } = await supabase
      .from('positions')
      .delete()
      .eq('id', id);

    if (error) throw error;

    await logAuditEvent({
      req,
      userId: req.user.id,
      action: 'Deleted',
      systemCategory: 'Departments',
      logDescription: `Removed position ${existingPosition.position_name}`,
      branch: req.user.branch_id,
      performed_by: req.user.employee_id
    });

    res.status(200).json({
      success: true,
      message: 'Position deleted successfully.',
    });
  } catch (error) {
    console.error('Error deleting position:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete position.',
    });
  }
});

module.exports = router;