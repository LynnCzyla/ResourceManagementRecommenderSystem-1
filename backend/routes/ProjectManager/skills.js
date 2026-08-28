// backend/routes/ProjectManager/skills.js
const express = require('express');
const router = express.Router();
const supabase = require('../../supabase');
const { verifyToken } = require('../Middleware/auth');

console.log('✅ SKILLS ROUTE FILE LOADED');

// ✅ Test route - NO AUTH REQUIRED (must be BEFORE router.use(verifyToken))
router.get('/test', (req, res) => {
  res.json({
    success: true,
    message: 'Skills router is mounted and working!',
    timestamp: new Date().toISOString(),
    routes: ['GET /', 'GET /test', 'GET /search', 'POST /']
  });
});

// Apply auth middleware to ALL routes below this line ONLY
router.use(verifyToken);

// GET /api/pm/skills - Get all skills (for autocomplete)
router.get('/', async (req, res) => {
  try {
    const { search } = req.query;
    
    console.log('📋 Fetching skills...');
    
    let query = supabase
      .from('skills')
      .select('id, skill_name')
      .order('skill_name', { ascending: true });

    if (search && search.length > 0) {
      query = query.ilike('skill_name', `%${search}%`);
    }

    query = query.limit(50);

    const { data, error } = await query;

    if (error) throw error;

    console.log(`✅ Found ${data?.length || 0} skills`);

    res.json({
      success: true,
      data: data || []
    });
  } catch (error) {
    console.error('Error fetching skills:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// GET /api/pm/skills/search - Search skills with partial match
router.get('/search', async (req, res) => {
  try {
    const { q } = req.query;
    
    if (!q || q.length < 1) {
      return res.json({
        success: true,
        data: []
      });
    }

    const { data, error } = await supabase
      .from('skills')
      .select('id, skill_name')
      .ilike('skill_name', `%${q}%`)
      .order('skill_name', { ascending: true })
      .limit(20);

    if (error) throw error;

    res.json({
      success: true,
      data: data || []
    });
  } catch (error) {
    console.error('Error searching skills:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// POST /api/pm/skills - Create a new skill
router.post('/', async (req, res) => {
  try {
    const { skill_name } = req.body;

    if (!skill_name) {
      return res.status(400).json({
        success: false,
        error: 'Skill name is required'
      });
    }

    // Check if skill already exists
    const { data: existing } = await supabase
      .from('skills')
      .select('id')
      .ilike('skill_name', skill_name.trim())
      .maybeSingle();

    if (existing) {
      return res.status(409).json({
        success: false,
        error: 'Skill already exists',
        data: existing
      });
    }

    const { data, error } = await supabase
      .from('skills')
      .insert({ skill_name: skill_name.trim() })
      .select()
      .single();

    if (error) throw error;

    res.json({
      success: true,
      data: data,
      message: 'Skill created successfully'
    });
  } catch (error) {
    console.error('Error creating skill:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;