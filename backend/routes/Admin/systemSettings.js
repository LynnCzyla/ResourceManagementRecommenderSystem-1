// routes/Admin/systemSettings.js
const express = require('express');
const router = express.Router();
const supabase = require('../../supabase');

// GET current system settings
router.get('/system-settings', async (req, res) => {
  try {
    // Get the most recent settings (assuming only one row)
    const { data, error } = await supabase
      .from('system_settings')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(1);

    if (error) throw error;

    if (data && data.length > 0) {
      // Transform to match frontend format
      const settings = {
        sessionTimeout: data[0].session_timeout,
        maxLoginAttempts: data[0].max_login_attempts,
        maxFileSize: data[0].max_file_upload_size,
        minPasswordLength: data[0].min_password_length,
        requireUppercase: data[0].require_uppercase,
        minUppercase: data[0].min_uppercase,
        requireLowercase: data[0].require_lowercase,
        minLowercase: data[0].min_lowercase,
        requireNumber: data[0].require_number,
        minNumber: data[0].min_number,
        requireSpecial: data[0].require_special,
        minSpecial: data[0].min_special,
      };
      
      res.status(200).json({ success: true, data: settings });
    } else {
      // Return default settings if none exist
      const defaultSettings = {
        sessionTimeout: 30,
        maxLoginAttempts: 5,
        maxFileSize: 10,
        minPasswordLength: 12,
        requireUppercase: true,
        minUppercase: 1,
        requireLowercase: true,
        minLowercase: 1,
        requireNumber: true,
        minNumber: 1,
        requireSpecial: true,
        minSpecial: 1,
      };
      
      res.status(200).json({ success: true, data: defaultSettings });
    }
  } catch (error) {
    console.error('Error fetching system settings:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch system settings',
      error: error.message 
    });
  }
});

// Update or create system settings
router.put('/system-settings', async (req, res) => {
  try {
    const {
      sessionTimeout,
      maxLoginAttempts,
      maxFileSize,
      minPasswordLength,
      requireUppercase,
      minUppercase,
      requireLowercase,
      minLowercase,
      requireNumber,
      minNumber,
      requireSpecial,
      minSpecial,
    } = req.body;

    // Validate inputs
    if (sessionTimeout < 5 || sessionTimeout > 120) {
      return res.status(400).json({ 
        success: false, 
        message: 'Session timeout must be between 5 and 120 minutes' 
      });
    }

    if (maxLoginAttempts < 3 || maxLoginAttempts > 10) {
      return res.status(400).json({ 
        success: false, 
        message: 'Max login attempts must be between 3 and 10' 
      });
    }

    if (maxFileSize < 1 || maxFileSize > 50) {
      return res.status(400).json({ 
        success: false, 
        message: 'Max file size must be between 1 and 50 MB' 
      });
    }

    if (minPasswordLength < 8 || minPasswordLength > 32) {
      return res.status(400).json({ 
        success: false, 
        message: 'Min password length must be between 8 and 32 characters' 
      });
    }

    // Check if settings already exist
    const { data: existing, error: fetchError } = await supabase
      .from('system_settings')
      .select('id')
      .order('created_at', { ascending: false })
      .limit(1);

    if (fetchError) throw fetchError;

    let result;
    if (existing && existing.length > 0) {
      // Update existing settings
      result = await supabase
        .from('system_settings')
        .update({
          session_timeout: sessionTimeout,
          max_login_attempts: maxLoginAttempts,
          max_file_upload_size: maxFileSize,
          min_password_length: minPasswordLength,
          require_uppercase: requireUppercase,
          min_uppercase: minUppercase,
          require_lowercase: requireLowercase,
          min_lowercase: minLowercase,
          require_number: requireNumber,
          min_number: minNumber,
          require_special: requireSpecial,
          min_special: minSpecial,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing[0].id)
        .select();
    } else {
      // Insert new settings
      result = await supabase
        .from('system_settings')
        .insert({
          session_timeout: sessionTimeout,
          max_login_attempts: maxLoginAttempts,
          max_file_upload_size: maxFileSize,
          min_password_length: minPasswordLength,
          require_uppercase: requireUppercase,
          min_uppercase: minUppercase,
          require_lowercase: requireLowercase,
          min_lowercase: minLowercase,
          require_number: requireNumber,
          min_number: minNumber,
          require_special: requireSpecial,
          min_special: minSpecial,
        })
        .select();
    }

    if (result.error) throw result.error;

    res.status(200).json({ 
      success: true, 
      message: 'Settings saved successfully',
      data: result.data[0]
    });
  } catch (error) {
    console.error('Error saving system settings:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to save system settings',
      error: error.message 
    });
  }
});

module.exports = router;