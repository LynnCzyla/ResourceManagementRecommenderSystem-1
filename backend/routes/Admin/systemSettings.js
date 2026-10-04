// routes/Admin/systemSettings.js
const express = require('express');
const router = express.Router();
const supabase = require('../../supabase');
const { logAuditEvent } = require('../../utils/auditLogger');
const { requireIntInRange } = require('../../utils/validators');
const { verifyToken } = require('../Middleware/auth');
const { requireRole } = require('../Middleware/roleGuard');

router.use(verifyToken, requireRole(['Admin', 'Super Admin']));

// GET current system settings
router.get('/system-settings', async (req, res) => {
  try {
    // Get the most recent settings (assuming only one row)
    const { data, error } = await supabase
      .from('system_settings')
      .select('session_timeout, max_login_attempts, max_file_upload_size, min_password_length, require_uppercase, min_uppercase, require_lowercase, min_lowercase, require_number, min_number, require_special, min_special')
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

    // Validate inputs (all required, whole numbers, inside range)
    const checks = [
      requireIntInRange(sessionTimeout, 'Session timeout (minutes)', 5, 120),
      requireIntInRange(maxLoginAttempts, 'Max login attempts', 3, 10),
      requireIntInRange(maxFileSize, 'Max file size (MB)', 1, 50),
      requireIntInRange(minPasswordLength, 'Min password length', 8, 32),
      requireIntInRange(minUppercase, 'Min uppercase letters', 1, 5),
      requireIntInRange(minLowercase, 'Min lowercase letters', 1, 5),
      requireIntInRange(minNumber, 'Min numbers', 1, 5),
      requireIntInRange(minSpecial, 'Min special characters', 1, 5),
    ];
    const failed = checks.find((c) => c.error);
    if (failed) {
      return res.status(400).json({ success: false, message: failed.error });
    }

    // Check if settings already exist
    const { data: existing, error: fetchError } = await supabase
      .from('system_settings')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(1);

    if (fetchError) throw fetchError;

    let result;
    const isUpdate = existing && existing.length > 0;
    const old = isUpdate ? existing[0] : null;

    if (isUpdate) {
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

    // Build descriptive audit log
    let logDescription;
    if (isUpdate && old) {
      const changes = [];
      if (old.max_file_upload_size !== maxFileSize) {
        changes.push(`Max file size: ${old.max_file_upload_size ?? 'N/A'}MB → ${maxFileSize}MB`);
      }
      if (old.session_timeout !== sessionTimeout) {
        changes.push(`Session timeout: ${old.session_timeout ?? 'N/A'}m → ${sessionTimeout}m`);
      }
      if (old.max_login_attempts !== maxLoginAttempts) {
        changes.push(`Max login attempts: ${old.max_login_attempts ?? 'N/A'} → ${maxLoginAttempts}`);
      }
      if (old.min_password_length !== minPasswordLength) {
        changes.push(`Min password length: ${old.min_password_length ?? 'N/A'} → ${minPasswordLength}`);
      }
      if (old.require_uppercase !== requireUppercase || old.min_uppercase !== minUppercase) {
        changes.push('Uppercase rule updated');
      }
      if (old.require_lowercase !== requireLowercase || old.min_lowercase !== minLowercase) {
        changes.push('Lowercase rule updated');
      }
      if (old.require_number !== requireNumber || old.min_number !== minNumber) {
        changes.push('Number rule updated');
      }
      if (old.require_special !== requireSpecial || old.min_special !== minSpecial) {
        changes.push('Special character rule updated');
      }

      logDescription = changes.length > 0
        ? `System settings updated: ${changes.join(', ')}`
        : `System settings saved (Max file size: ${maxFileSize}MB, Session timeout: ${sessionTimeout}m)`;
    } else {
      logDescription = `System settings initialized (Max file size: ${maxFileSize}MB, Session timeout: ${sessionTimeout}m)`;
    }

    await logAuditEvent({
      req,
      action: isUpdate ? 'Updated' : 'Created',
      systemCategory: 'System Settings',
      logDescription,
    });

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