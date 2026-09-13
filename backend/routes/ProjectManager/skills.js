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

    console.log(`📋 Fetching skills (search: "${search || ''}")...`);

    let query = supabase
      .from('skills')
      .select('id, skill_name')
      .order('skill_name', { ascending: true });

    if (search && search.trim().length > 0) {
      query = query.ilike('skill_name', `%${search.trim()}%`).limit(100);
    } else {
      query = query.limit(50);
    }

    const { data, error } = await query;

    if (error) throw error;

    let skillsList = data || [];
    if (search && search.trim().length > 0) {
      const term = search.trim().toLowerCase();
      skillsList.sort((a, b) => {
        const aName = (a.skill_name || '').toLowerCase();
        const bName = (b.skill_name || '').toLowerCase();
        const aStarts = aName.startsWith(term);
        const bStarts = bName.startsWith(term);
        if (aStarts && !bStarts) return -1;
        if (!aStarts && bStarts) return 1;

        const aWord = aName.includes(' ' + term);
        const bWord = bName.includes(' ' + term);
        if (aWord && !bWord) return -1;
        if (!aWord && bWord) return 1;

        return aName.localeCompare(bName);
      });
      skillsList = skillsList.slice(0, 50);
    }

    console.log(`✅ Found ${skillsList.length} skills`);

    res.json({
      success: true,
      data: skillsList
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

    if (!q || q.trim().length < 1) {
      return res.json({
        success: true,
        data: []
      });
    }

    const term = q.trim().toLowerCase();
    const { data, error } = await supabase
      .from('skills')
      .select('id, skill_name')
      .ilike('skill_name', `%${term}%`)
      .order('skill_name', { ascending: true })
      .limit(100);

    if (error) throw error;

    let skillsList = data || [];
    skillsList.sort((a, b) => {
      const aName = (a.skill_name || '').toLowerCase();
      const bName = (b.skill_name || '').toLowerCase();
      const aStarts = aName.startsWith(term);
      const bStarts = bName.startsWith(term);
      if (aStarts && !bStarts) return -1;
      if (!aStarts && bStarts) return 1;

      const aWord = aName.includes(' ' + term);
      const bWord = bName.includes(' ' + term);
      if (aWord && !bWord) return -1;
      if (!aWord && bWord) return 1;

      return aName.localeCompare(bName);
    });

    res.json({
      success: true,
      data: skillsList.slice(0, 50)
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