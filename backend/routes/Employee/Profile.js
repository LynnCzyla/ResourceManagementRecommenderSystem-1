const express = require('express');
const router = express.Router();
const supabase = require('../../supabase');
const { verifyToken } = require('../Middleware/auth');
const { logAuditEvent } = require('../../utils/auditLogger');

router.get('/profile', verifyToken, async (req, res) => {
  try {
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('*, departments(department_name)')
      .eq('id', req.user.id)
      .single();
      
    if (error) throw error;
    
    const mappedData = {
      ...profile,
      department: profile.departments?.department_name || '',
    };
    
    res.json({ success: true, data: mappedData });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/profile/:employeeId', verifyToken, async (req, res) => {
  try {
    const { employeeId } = req.params;
    
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('*, departments(department_name)')
      .eq('employee_id', employeeId)
      .single();
      
    if (error) throw error;
    
    const mappedData = {
      ...profile,
      department: profile.departments?.department_name || '',
    };
    
    res.json({ success: true, data: mappedData });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.put('/profile', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { first_name, last_name, department, role, avatar_url, contact_number, location, years_experience, email } = req.body;
    
    const { data: ownProfile, error: ownError } = await supabase
      .from('profiles')
      .select('employee_id, id')
      .eq('id', userId)
      .single();
    if (ownError || !ownProfile) return res.status(403).json({ success: false, error: 'Profile not found' });
    
    let department_id = null;
    if (department) {
      const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(department);
      if (isUUID) {
        department_id = department;
      } else {
        const { data: deptData } = await supabase
          .from('departments')
          .select('id')
          .ilike('department_name', department.trim())
          .limit(1);
        if (deptData && deptData.length > 0) {
          department_id = deptData[0].id;
        }
      }
    }
    
    const updateData = {
      updated_at: new Date().toISOString()
    };
    if (first_name !== undefined) updateData.first_name = first_name;
    if (last_name !== undefined) updateData.last_name = last_name;
    updateData.department_id = department_id; // Can be null
    if (role !== undefined) updateData.role = role;
    if (avatar_url !== undefined) updateData.avatar_url = avatar_url;
    if (contact_number !== undefined) updateData.contact_number = contact_number;
    if (location !== undefined) updateData.location = location;
    if (years_experience !== undefined) updateData.years_experience = years_experience;
    
    const { data: profileData, error: profileError } = await supabase
      .from('profiles')
      .update(updateData)
      .eq('id', userId)
      .select()
      .single();
    
    if (profileError) throw profileError;
    
    if (email && email.trim() !== '') {
      const { error: authError } = await supabase.auth.admin.updateUserById(userId, {
        email: email.trim()
      });
      if (authError) {
        console.error('Auth email update error:', authError);
        return res.json({
          success: true,
          data: profileData,
          message: 'Profile updated, but email update failed: ' + authError.message
        });
      }
    }

    await logAuditEvent({
      req,
      userId,
      action: 'Updated',
      systemCategory: 'User Management',
      logDescription: `Updated profile for ${profileData.first_name} ${profileData.last_name}`,
    });
    
    res.json({
      success: true,
      data: profileData,
      message: 'Profile updated successfully'
    });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
