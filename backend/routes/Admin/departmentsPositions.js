// routes/Admin/departmentsPositions.js
const express = require('express');
const router = express.Router();
const supabase = require('../../supabase');

// ══════════════════════════════════════════════════════════════════════════════
// DEPARTMENTS
// ══════════════════════════════════════════════════════════════════════════════

// GET /api/admin/departments — fetch all departments
router.get('/departments', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('departments')
      .select('*')
      .order('department_name', { ascending: true });

    if (error) throw error;

    res.status(200).json({ success: true, data: data || [] });
  } catch (error) {
    console.error('Error fetching departments:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch departments.',
    });
  }
});

// POST /api/admin/departments — create a new department
router.post('/departments', async (req, res) => {
  try {
    const { department_name, description } = req.body;

    if (!department_name || !department_name.trim()) {
      return res.status(400).json({
        success: false,
        error: 'Department name is required.',
      });
    }

    // Check for duplicate name
    const { data: existing } = await supabase
      .from('departments')
      .select('id')
      .ilike('department_name', department_name.trim())
      .limit(1);

    if (existing && existing.length > 0) {
      return res.status(400).json({
        success: false,
        error: `A department named "${department_name.trim()}" already exists.`,
      });
    }

    const { data, error } = await supabase
      .from('departments')
      .insert({
        department_name: department_name.trim(),
        description: description?.trim() || null,
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) throw error;

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

// PUT /api/admin/departments/:id — update a department
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

    // Check for duplicate name (excluding current record)
    const { data: existing } = await supabase
      .from('departments')
      .select('id')
      .ilike('department_name', department_name.trim())
      .neq('id', id)
      .limit(1);

    if (existing && existing.length > 0) {
      return res.status(400).json({
        success: false,
        error: `A department named "${department_name.trim()}" already exists.`,
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

// DELETE /api/admin/departments/:id — delete a department
router.delete('/departments/:id', async (req, res) => {
  try {
    const { id } = req.params;

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
// POSITIONS
// ══════════════════════════════════════════════════════════════════════════════

// GET /api/admin/positions — fetch all positions (optional ?dept_id= filter)
router.get('/positions', async (req, res) => {
  try {
    const { dept_id } = req.query;

    let query = supabase
      .from('positions')
      .select(`
        *,
        departments (
          id,
          department_name
        )
      `)
      .order('position_name', { ascending: true });

    if (dept_id) {
      query = query.eq('department_id', dept_id);
    }

    const { data, error } = await query;

    if (error) throw error;

    res.status(200).json({ success: true, data: data || [] });
  } catch (error) {
    console.error('Error fetching positions:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch positions.',
    });
  }
});

// POST /api/admin/positions — create a new position
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

    // Verify the department exists
    const { data: dept } = await supabase
      .from('departments')
      .select('id')
      .eq('id', department_id)
      .single();

    if (!dept) {
      return res.status(400).json({
        success: false,
        error: 'Selected department does not exist.',
      });
    }

    // Check for duplicate position name within the same department
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

// PUT /api/admin/positions/:id — update a position
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

    // Check for duplicate name within the same dept (excluding current record)
    const { data: existing } = await supabase
      .from('positions')
      .select('id')
      .ilike('position_name', position_name.trim())
      .eq('department_id', department_id)
      .neq('id', id)
      .limit(1);

    if (existing && existing.length > 0) {
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

    if (!data) {
      return res.status(404).json({
        success: false,
        error: 'Position not found.',
      });
    }

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

// DELETE /api/admin/positions/:id — delete a position
router.delete('/positions/:id', async (req, res) => {
  try {
    const { id } = req.params;

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