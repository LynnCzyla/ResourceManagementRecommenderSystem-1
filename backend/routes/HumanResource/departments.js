// backend/routes/HumanResource/departments.js
const express = require('express');
const router = express.Router();
const supabase = require('../../supabase');
const { verifyToken } = require('../Middleware/auth');

// Apply auth middleware
router.use(verifyToken);

// GET /api/hr/departments — Get all departments (filtered by branch)
router.get('/', async (req, res) => {
  try {
    const userBranchId = req.user?.branch_id;
    const isSuperAdmin = req.user?.is_super_admin || false;

    console.log(`📋 Fetching departments for HR`);
    console.log(`🏢 Branch: ${isSuperAdmin ? 'ALL' : userBranchId}`);

    let query = supabase
      .from('departments')
      .select('id, department_name, description')
      .order('department_name', { ascending: true });

    // ✅ Filter by branch for non-super admins
    if (!isSuperAdmin && userBranchId) {
      query = query.eq('branch_id', userBranchId);
    }

    const { data, error } = await query;
    if (error) throw error;

    res.status(200).json({
      success: true,
      data: data || []
    });
  } catch (error) {
    console.error('Error fetching departments:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch departments'
    });
  }
});

module.exports = router;