// backend/routes/HumanResource/branches.js
const express = require('express');
const router = express.Router();
const supabase = require('../../supabase');
const { verifyToken } = require('../Middleware/auth');

router.use(verifyToken);

// ✅ GET /api/hr/branches/my-branch - Get current user's branch (no frontend changes needed)
router.get('/my-branch', async (req, res) => {
  try {
    const userBranchId = req.user?.branch_id;
    
    console.log('🔍 Getting branch for user:', req.user?.id);
    console.log('📋 User branch ID from token:', userBranchId);
    
    if (!userBranchId) {
      return res.status(404).json({
        success: false,
        error: 'User has no branch assigned',
        user: req.user?.id || 'unknown'
      });
    }

    const { data, error } = await supabase
      .from('branches')
      .select('id, name, location, address, contact_number, manager_name')
      .eq('id', userBranchId)
      .single();

    if (error) {
      console.error('❌ Error fetching branch:', error);
      throw error;
    }
    
    if (!data) {
      return res.status(404).json({
        success: false,
        error: 'Branch not found'
      });
    }

    console.log('✅ Found branch:', data.name);
    console.log('📍 Location:', data.location);

    res.status(200).json({
      success: true,
      data
    });
  } catch (error) {
    console.error('Error fetching user branch:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch user branch'
    });
  }
});

// GET /api/hr/branches/:id - Get branch by ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const { data, error } = await supabase
      .from('branches')
      .select('id, name, location, address, contact_number, manager_name')
      .eq('id', id)
      .single();

    if (error) throw error;
    if (!data) {
      return res.status(404).json({
        success: false,
        error: 'Branch not found'
      });
    }

    res.status(200).json({
      success: true,
      data
    });
  } catch (error) {
    console.error('Error fetching branch:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch branch'
    });
  }
});

// GET /api/hr/branches - Get all branches
router.get('/', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('branches')
      .select('id, name, location, address, contact_number, manager_name, status')
      .eq('status', 'Active')
      .order('name', { ascending: true });

    if (error) throw error;

    res.status(200).json({
      success: true,
      data: data || []
    });
  } catch (error) {
    console.error('Error fetching branches:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch branches'
    });
  }
});

module.exports = router;