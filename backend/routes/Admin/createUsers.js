// routes/Admin/createUsers.js
const express = require("express");
const router = express.Router();
const supabase = require("../../supabase");
const nodemailer = require("nodemailer");
const path = require("path");
const { logAuditEvent } = require('../../utils/auditLogger');
const { verifyToken } = require('../Middleware/auth');

// ✅ Apply auth middleware to ALL routes
router.use(verifyToken);

// Generate a random password
const generatePassword = () => {
  const length = 12;
  const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*";
  let password = "";
  for (let i = 0; i < length; i++) {
    const randomIndex = Math.floor(Math.random() * charset.length);
    password += charset[randomIndex];
  }
  return password;
};

// ✅ FIXED: Generate sequential employee ID per branch
const generateEmployeeId = async (branchCode = 'PHIL') => {
  try {
    console.log(`🔍 Generating employee ID for branch: ${branchCode}`);
    
    // Get ALL employee IDs for this branch and find the highest number
    const { data, error } = await supabase
      .from("profiles")
      .select("employee_id")
      .like("employee_id", `WEA-${branchCode}-%`)
      .order("employee_id", { ascending: false });

    if (error) {
      console.error('Error fetching employee IDs:', error);
      return `WEA-${branchCode}-${Date.now().toString().slice(-6)}`;
    }

    let lastNumber = 0;
    
    if (data && data.length > 0) {
      for (const record of data) {
        const match = record.employee_id.match(new RegExp(`WEA-${branchCode}-(\\d+)`));
        if (match) {
          const num = parseInt(match[1], 10);
          if (num > lastNumber) {
            lastNumber = num;
          }
        }
      }
      console.log(`📊 Last employee number for branch ${branchCode}: ${lastNumber}`);
    } else {
      console.log(`📊 No existing employees found for branch ${branchCode}, starting from 0`);
    }

    const nextNumber = lastNumber + 1;
    const paddedNumber = String(nextNumber).padStart(3, '0');
    const newEmployeeId = `WEA-${branchCode}-${paddedNumber}`;
    console.log(`✅ Generated new employee ID: ${newEmployeeId}`);
    
    return newEmployeeId;
  } catch (error) {
    console.error("❌ Error generating employee ID:", error);
    const fallbackId = `WEA-${branchCode}-${Date.now().toString().slice(-6)}`;
    console.log(`⚠️ Using fallback employee ID: ${fallbackId}`);
    return fallbackId;
  }
};

// ✅ FIXED: Get branch code from branch name (no code column needed)
const getBranchCode = async (branchId) => {
  try {
    console.log(`🔍 Getting branch code for branch_id: ${branchId}`);
    
    const { data, error } = await supabase
      .from("branches")
      .select("name")
      .eq("id", branchId)
      .single();
    
    if (error) {
      console.error('❌ Error fetching branch:', error);
      console.warn(`⚠️ Could not find branch for ${branchId}, using default 'PHIL'`);
      return 'PHIL';
    }
    
    if (!data) {
      console.warn(`⚠️ No branch found for ${branchId}, using default 'PHIL'`);
      return 'PHIL';
    }
    
    // ✅ Extract code from name (e.g., "WEA-SGP" -> "SGP")
    const name = data.name;
    const match = name.match(/WEA-([A-Z]+)/);
    
    if (match && match[1]) {
      const code = match[1];
      console.log(`✅ Branch found: ${name} -> Code: ${code}`);
      return code;
    }
    
    // Fallback: If name doesn't match pattern, use first 3 characters
    const fallbackCode = name.substring(0, 3).toUpperCase();
    console.log(`⚠️ Branch name doesn't match pattern, using fallback: ${fallbackCode}`);
    return fallbackCode;
  } catch (error) {
    console.error('❌ Error fetching branch code:', error);
    return 'PHIL';
  }
};

// Configure email transporter
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: process.env.SMTP_PORT || 587,
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

// Send welcome email with temporary password
const sendWelcomeEmail = async (email, firstName, lastName, employeeId, temporaryPassword, role, branchName) => {
  const mailOptions = {
    from: process.env.SMTP_FROM || '"WEA Resource Management" <noreply@wea.com>',
    to: email,
    subject: 'Welcome to WEA Resource Management System',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f8fafc; border-radius: 12px;">
        <div style="background: linear-gradient(135deg, #3b82f6, #2563eb); padding: 30px; border-radius: 12px 12px 0 0; text-align: center;">
          <div style="margin-bottom: 12px;">
            <img src="cid:wealogo" alt="WEA Logo" style="height: 60px; object-fit: contain;" />
          </div>
          <h1 style="color: white; margin: 0; font-size: 28px;">Welcome to WEA!</h1>
          <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0 0; font-size: 16px;">Resource Management System</p>
        </div>
        
        <div style="background: white; padding: 30px; border-radius: 0 0 12px 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
          <h2 style="color: #1e293b; margin-top: 0;">Hello ${firstName} ${lastName}!</h2>
          
          <p style="color: #475569; line-height: 1.6;">Your account has been created successfully with the role of <strong style="color: #3b82f6;">${role}</strong>.</p>
          
          <div style="background: #f1f5f9; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #3b82f6;">
            <p style="margin: 0 0 8px 0; color: #475569; font-weight: 600;">Your Employee ID:</p>
            <p style="margin: 0; font-size: 20px; font-weight: 700; color: #1e293b; font-family: monospace;">
              ${employeeId}
            </p>
          </div>
          
          ${branchName ? `
          <div style="background: #f1f5f9; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #3b82f6;">
            <p style="margin: 0 0 8px 0; color: #475569; font-weight: 600;">Your Branch:</p>
            <p style="margin: 0; font-size: 16px; font-weight: 600; color: #1e293b;">
              ${branchName}
            </p>
          </div>
          ` : ''}
          
          <div style="background: #f1f5f9; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #3b82f6;">
            <p style="margin: 0 0 8px 0; color: #475569; font-weight: 600;">Your temporary password:</p>
            <p style="margin: 0; font-size: 24px; font-weight: 700; color: #1e293b; letter-spacing: 2px; font-family: monospace; background: white; padding: 12px; border-radius: 6px; display: inline-block;">
              ${temporaryPassword}
            </p>
          </div>
          
          <div style="background: #fef2f2; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #ef4444;">
            <p style="margin: 0; color: #dc2626; font-size: 14px;">
              ⚠️ For security reasons, please change your password immediately after logging in.
            </p>
          </div>
          
          <p style="color: #94a3b8; font-size: 14px; text-align: center; margin-top: 20px;">
            If you did not request this account, please ignore this email or contact support.
          </p>
        </div>
      </div>
    `,
    attachments: [{
      filename: 'WEA_logo_bgremoved.png',
      path: path.join(__dirname, '../../../main/src/assets/WEA_logo_bgremoved.png'),
      cid: 'wealogo'
    }]
  };

  try {
    await transporter.sendMail(mailOptions);
    return true;
  } catch (error) {
    console.error('Error sending email:', error);
    return false;
  }
};

// Create a new user with auth and profile
router.post("/create", async (req, res) => {
  try {
    const {
      first_name,
      middle_name,
      last_name,
      email,
      role = "Employee",
      contact_number,
      position_id,
      join_date,
      availability_status = "Available"
    } = req.body;

    // Validate required fields
    if (!first_name || !last_name || !email) {
      return res.status(400).json({
        success: false,
        error: "First name, last name, and email are required"
      });
    }

    // ✅ Get the current user's branch_id from the authenticated user
    const adminBranchId = req.user.branch_id;
    const adminEmployeeId = req.user.employee_id;
    const adminRole = req.user.role;

    console.log(`👤 Creating user by: ${adminEmployeeId} (${adminRole})`);
    console.log(`🏢 Admin branch_id: ${adminBranchId}`);

    // ✅ Check if admin has permission to create users
    if (!adminBranchId) {
      return res.status(403).json({
        success: false,
        error: "Your account is not assigned to a branch. Please contact Super Admin."
      });
    }

    // ✅ Get branch code for employee ID generation
    const branchCode = await getBranchCode(adminBranchId);
    console.log(`📋 Branch code: ${branchCode}`);
    
    // ✅ Get branch name for email
    const { data: branchData, error: branchError } = await supabase
      .from("branches")
      .select("name")
      .eq("id", adminBranchId)
      .single();

    if (branchError) {
      console.warn('Could not fetch branch name:', branchError.message);
    }

    const branchName = branchData?.name || null;

    // Generate a random password
    const generatedPassword = generatePassword();

    // 1. Create auth user with generated password
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password: generatedPassword,
      email_confirm: true,
      user_metadata: {
        first_name,
        middle_name,
        last_name,
        role
      }
    });

    if (authError) {
      return res.status(400).json({
        success: false,
        error: authError.message
      });
    }

    // ✅ Generate sequential employee ID with branch code
    const employeeId = await generateEmployeeId(branchCode);
    console.log(`🎯 Generated Employee ID: ${employeeId}`);

    // 2. Create profile with branch_id from the admin who created it
    const { data: profileData, error: profileError } = await supabase
      .from("profiles")
      .insert({
        id: authData.user.id,
        employee_id: employeeId,
        first_name,
        middle_name: middle_name || null,
        last_name,
        contact_number: contact_number || null,
        position_id: position_id || null,
        role: role || "Employee",
        availability_status: availability_status || "Available",
        join_date: join_date || new Date().toISOString().split("T")[0],
        status: "Active",
        branch_id: adminBranchId,
        created_by: req.user.id,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .select()
      .single();

    if (profileError) {
      await supabase.auth.admin.deleteUser(authData.user.id);
      return res.status(400).json({
        success: false,
        error: profileError.message
      });
    }

    // 3. Create notification for the new user
    await supabase.from('notifications').insert({
      recipient_id: authData.user.id,
      type: 'system',
      text: `👋 Welcome! Your account has been created with role ${role} at ${branchName || 'WEA'}. Employee ID: ${employeeId}`,
      read: false
    });

    // 4. Send welcome email with temporary password
    const emailSent = await sendWelcomeEmail(
      email,
      first_name,
      last_name,
      employeeId,
      generatedPassword,
      role,
      branchName
    );

    await logAuditEvent({
      req,
      userId: authData.user.id,
      action: 'Created',
      systemCategory: 'User Management',
      logDescription: `Created new user account for ${email} with Employee ID: ${employeeId} at branch: ${branchName || adminBranchId}`,
      branch: adminBranchId,
      performed_by: req.user.employee_id
    });

    res.status(201).json({
      success: true,
      message: `User created successfully with Employee ID: ${employeeId} assigned to branch: ${branchName || adminBranchId}. Temporary password sent to email.`,
      user: {
        ...profileData,
        email: authData.user.email,
        branch_name: branchName
      },
      auth_user: authData.user,
      email_sent: emailSent,
      temporary_password: generatedPassword,
      assigned_branch: {
        id: adminBranchId,
        name: branchName,
        code: branchCode
      },
      employee_id: employeeId
    });

  } catch (error) {
    console.error("Error creating user:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error"
    });
  }
});

// Resend temporary password
router.post("/resend-password/:userId", async (req, res) => {
  try {
    const { userId } = req.params;

    const { data: targetProfile, error: targetError } = await supabase
      .from("profiles")
      .select("branch_id, first_name, last_name, employee_id, role")
      .eq("id", userId)
      .single();

    if (targetError) {
      return res.status(404).json({
        success: false,
        error: "User not found"
      });
    }

    if (!req.user.is_super_admin && targetProfile.branch_id !== req.user.branch_id) {
      return res.status(403).json({
        success: false,
        error: "You don't have permission to resend password for this user"
      });
    }

    const { data: authData, error: authError } = await supabase.auth.admin.getUserById(userId);
    
    if (authError) {
      return res.status(404).json({
        success: false,
        error: "User not found in auth"
      });
    }

    const userEmail = authData.user.email;
    const newPassword = generatePassword();

    const { error: updateError } = await supabase.auth.admin.updateUserById(
      userId,
      { password: newPassword }
    );

    if (updateError) {
      return res.status(400).json({
        success: false,
        error: updateError.message
      });
    }

    const { data: branchData } = await supabase
      .from("branches")
      .select("name")
      .eq("id", targetProfile.branch_id)
      .single();

    const emailSent = await sendWelcomeEmail(
      userEmail,
      targetProfile.first_name,
      targetProfile.last_name,
      targetProfile.employee_id,
      newPassword,
      targetProfile.role,
      branchData?.name || null
    );

    await logAuditEvent({
      req,
      userId: userId,
      action: 'Created',
      systemCategory: 'User Management',
      logDescription: `Resent temporary password for ${targetProfile.first_name} ${targetProfile.last_name}`,
      branch: req.user.branch_id,
      performed_by: req.user.employee_id
    });

    res.json({
      success: true,
      message: "New temporary password sent to email",
      email_sent: emailSent
    });

  } catch (error) {
    console.error("Error resending password:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error"
    });
  }
});

// ✅ Get next employee ID for a branch (preview)
router.get("/next-employee-id", async (req, res) => {
  try {
    const adminBranchId = req.user.branch_id;
    
    if (!adminBranchId) {
      return res.status(403).json({
        success: false,
        error: "Your account is not assigned to a branch"
      });
    }

    const branchCode = await getBranchCode(adminBranchId);
    const employeeId = await generateEmployeeId(branchCode);

    res.json({
      success: true,
      data: {
        employee_id: employeeId,
        branch_code: branchCode,
        branch_id: adminBranchId
      }
    });
  } catch (error) {
    console.error("Error getting next employee ID:", error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;