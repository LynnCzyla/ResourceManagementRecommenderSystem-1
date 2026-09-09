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

// Send "create your password" email with a Supabase recovery link (mirrors forgotPassword.js).
// The user clicks through to /reset-password, which already displays the live password
// requirements configured by the Super Admin (min length, uppercase, lowercase, number, special).
const sendCreateAccountEmail = async (email, firstName, lastName, employeeId, createLink, role, branchName) => {
  const mailOptions = {
    from: process.env.SMTP_FROM || '"WEA Resource Management" <noreply@wea.com>',
    to: email,
    subject: 'Create Your WEA Account Password',
    html: `
      <div style="font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 32px 16px; background-color: #0f172a;">

        <!-- Card -->
        <div style="background: #1e293b; border: 1px solid #334155; border-radius: 20px; overflow: hidden;">

          <!-- Header -->
          <div style="padding: 32px 32px 24px 32px; text-align: center; border-bottom: 1px solid #334155;">
            <div style="margin-bottom: 16px;">
              <img src="cid:wealogo" alt="WEA Logo" style="height: 65px; object-fit: contain;" />
            </div>
            <h1 style="font-family: 'Outfit', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #f8fafc; font-size: 22px; font-weight: 800; letter-spacing: -0.5px; margin: 0 0 4px 0;">
              Welcome to WEA!
            </h1>
            <p style="color: #94a3b8; font-size: 13px; font-weight: 500; margin: 0; text-transform: uppercase; letter-spacing: 0.5px;">
              Resource Management System
            </p>
          </div>

          <!-- Body -->
          <div style="padding: 32px;">
            <p style="color: #cbd5e1; font-size: 14px; line-height: 1.6; margin: 0 0 20px 0;">
              Hello ${firstName} ${lastName}, your account has been created with the role of
              <strong style="color: #10b981;">${role}</strong>${branchName ? ` at <strong style="color: #10b981;">${branchName}</strong>` : ''}.
              Click the button below to create your password and activate your account.
            </p>

            <div style="background: #0f172a; padding: 15px; border-radius: 8px; margin-bottom: 24px; border-left: 4px solid #10b981;">
              <p style="margin: 0 0 6px 0; color: #94a3b8; font-weight: 600; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">Your Employee ID</p>
              <p style="margin: 0; font-size: 18px; font-weight: 700; color: #f8fafc; font-family: monospace;">${employeeId}</p>
            </div>

            <!-- Button -->
            <div style="text-align: center; margin-bottom: 28px;">
              <a href="${createLink}" style="background: #10b981; color: #0f172a; padding: 14px 36px; border-radius: 12px; text-decoration: none; font-weight: 700; font-size: 14px; display: inline-block; font-family: 'Outfit', sans-serif;">
                Create Password
              </a>
            </div>

            <!-- Fallback link -->
            <div style="background: rgba(255,255,255,0.03); border: 1px solid #334155; border-radius: 12px; padding: 14px 16px; margin-bottom: 24px;">
              <p style="color: #94a3b8; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; margin: 0 0 6px 0;">
                Or paste this link into your browser
              </p>
              <a href="${createLink}" style="color: #0ea5e9; font-size: 12px; word-break: break-all; text-decoration: underline;">${createLink}</a>
            </div>

            <!-- Password requirements note -->
            <div style="background: rgba(16, 185, 129, 0.08); border: 1px solid rgba(16, 185, 129, 0.25); border-radius: 12px; padding: 14px 16px; margin-bottom: 24px;">
              <p style="margin: 0; color: #6ee7b7; font-size: 13px; line-height: 1.6;">
                🔒 On the Create Password page you'll see the exact password rules set by your Super Admin (minimum length, and whether uppercase, lowercase, numbers, and special characters are required). Your new password must meet all of them before it can be saved.
              </p>
            </div>

            <!-- Warning -->
            <div style="background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.3); border-radius: 12px; padding: 14px 16px;">
              <p style="margin: 0; color: #f87171; font-size: 13px; line-height: 1.5;">
                ⚠️ This link is valid for a limited time only. If you did not expect this account, please contact your administrator.
              </p>
            </div>
          </div>
        </div>

        <!-- Footer -->
        <p style="text-align: center; color: #475569; font-size: 11px; margin-top: 24px;">
          © WEA Resource Management System
        </p>
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
    console.error('Error sending create-account email:', error);
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
      availability_status = "Available",
      redirectOrigin
    } = req.body;

    // Validate required fields
    if (!first_name || !last_name || !email) {
      return res.status(400).json({
        success: false,
        error: "First name, last name, and email are required"
      });
    }

    // ✅ Only Super Admin can create Admin / Super Admin accounts from this endpoint
    if (!req.user.is_super_admin && (role === "Admin" || role === "Super Admin")) {
      return res.status(403).json({
        success: false,
        error: "You don't have permission to assign admin roles"
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

    const trimmedEmail = (email || '').trim().toLowerCase();

    // ✅ Unique email validation: Check if email already exists in system
    const { data: userCheck, error: userCheckError } = await supabase.auth.admin.listUsers();
    if (!userCheckError && userCheck?.users) {
      const emailExists = userCheck.users.some(
        u => (u.email || '').trim().toLowerCase() === trimmedEmail
      );
      if (emailExists) {
        return res.status(400).json({
          success: false,
          error: "An account with this email address already exists."
        });
      }
    }

    // Generate a throwaway password just to satisfy the auth API — it is
    // never shown or emailed. The user sets their real password themselves
    // via the "Create Password" link below (same flow as Forgot Password).
    const throwawayPassword = generatePassword();

    // 1. Create auth user with the throwaway password
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: trimmedEmail,
      password: throwawayPassword,
      email_confirm: true,
      user_metadata: {
        first_name,
        middle_name,
        last_name,
        role
      }
    });

    if (authError) {
      const isDuplicate = authError.message?.toLowerCase().includes('already') || 
                          authError.message?.toLowerCase().includes('duplicate') ||
                          authError.message?.toLowerCase().includes('exists');
      return res.status(400).json({
        success: false,
        error: isDuplicate 
          ? "An account with this email address already exists."
          : authError.message
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

    // 4. Generate a Supabase recovery link (same mechanism as Forgot Password)
    //    and email it so the user creates their own password.
    const baseUrl = redirectOrigin || process.env.APP_URL || 'http://localhost:3000';
    const cleanBaseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;

    let emailSent = false;
    try {
      const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
        type: "recovery",
        email,
        options: {
          redirectTo: `${cleanBaseUrl}/reset-password`
        }
      });

      if (linkError) throw linkError;

      const createLink = linkData.properties.action_link;

      emailSent = await sendCreateAccountEmail(
        email,
        first_name,
        last_name,
        employeeId,
        createLink,
        role,
        branchName
      );
    } catch (linkErr) {
      console.error('Error generating create-password link:', linkErr);
    }

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
      message: `User created successfully with Employee ID: ${employeeId} assigned to branch: ${branchName || adminBranchId}. A "Create Password" email has been sent to the user.`,
      user: {
        ...profileData,
        email: authData.user.email,
        branch_name: branchName
      },
      auth_user: authData.user,
      email_sent: emailSent,
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

// Resend "create password" email (uses the same recovery-link flow as account creation)
router.post("/resend-password/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    const { redirectOrigin } = req.body;

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
        error: "You don't have permission to resend the account setup email for this user"
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

    const { data: branchData } = await supabase
      .from("branches")
      .select("name")
      .eq("id", targetProfile.branch_id)
      .single();

    const baseUrl = redirectOrigin || process.env.APP_URL || 'http://localhost:3000';
    const cleanBaseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;

    const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
      type: "recovery",
      email: userEmail,
      options: {
        redirectTo: `${cleanBaseUrl}/reset-password`
      }
    });

    if (linkError) {
      return res.status(400).json({
        success: false,
        error: linkError.message
      });
    }

    const createLink = linkData.properties.action_link;

    const emailSent = await sendCreateAccountEmail(
      userEmail,
      targetProfile.first_name,
      targetProfile.last_name,
      targetProfile.employee_id,
      createLink,
      targetProfile.role,
      branchData?.name || null
    );

    await logAuditEvent({
      req,
      userId: userId,
      action: 'Created',
      systemCategory: 'User Management',
      logDescription: `Resent create-password email for ${targetProfile.first_name} ${targetProfile.last_name}`,
      branch: req.user.branch_id,
      performed_by: req.user.employee_id
    });

    res.json({
      success: true,
      message: "Create-password email resent",
      email_sent: emailSent
    });

  } catch (error) {
    console.error("Error resending create-password email:", error);
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