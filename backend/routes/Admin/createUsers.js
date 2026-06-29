// routes/Admin/createUsers.js
const express = require("express");
const router = express.Router();
const supabase = require("../../supabase");
const nodemailer = require("nodemailer");

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

// Generate sequential employee ID
const generateEmployeeId = async () => {
  try {
    // Get the last employee ID
    const { data, error } = await supabase
      .from("profiles")
      .select("employee_id")
      .order("employee_id", { ascending: false })
      .limit(1);

    if (error) throw error;

    let lastNumber = 0;
    
    if (data && data.length > 0) {
      // Extract the number from EMP-XXX
      const lastId = data[0].employee_id;
      const match = lastId.match(/EMP-(\d+)/);
      if (match) {
        lastNumber = parseInt(match[1], 10);
      }
    }

    // Increment the number and pad with zeros
    const nextNumber = lastNumber + 1;
    const paddedNumber = String(nextNumber).padStart(3, '0');
    
    return `EMP-${paddedNumber}`;
  } catch (error) {
    console.error("Error generating employee ID:", error);
    // Fallback to timestamp-based ID if there's an error
    return `EMP-${Date.now().toString().slice(-6)}`;
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
const sendWelcomeEmail = async (email, firstName, lastName, employeeId, temporaryPassword, role) => {
  const mailOptions = {
    from: process.env.SMTP_FROM || '"WEA Resource Management" <noreply@wea.com>',
    to: email,
    subject: 'Welcome to WEA Resource Management System',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f8fafc; border-radius: 12px;">
        <div style="background: linear-gradient(135deg, #3b82f6, #2563eb); padding: 30px; border-radius: 12px 12px 0 0; text-align: center;">
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
    `
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
      location,
      join_date,
      years_experience,
      availability_status = "Available",
      total_available_hours = 40
    } = req.body;

    // Validate required fields
    if (!first_name || !last_name || !email) {
      return res.status(400).json({
        success: false,
        error: "First name, last name, and email are required"
      });
    }

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

    // Generate sequential employee ID
    const employeeId = await generateEmployeeId();

    // 2. Create profile - REMOVED email field from insert
    const { data: profileData, error: profileError } = await supabase
      .from("profiles")
      .insert({
        id: authData.user.id,
        employee_id: employeeId,
        first_name,
        middle_name: middle_name || null,
        last_name,
        // email: email, // ← REMOVED THIS LINE - email is not in profiles table
        contact_number: contact_number || null,
        position_id: position_id || null,
        role: role || "Employee",
        availability_status: availability_status || "Available",
        total_available_hours: total_available_hours || 40,
        location: location || null,
        join_date: join_date || new Date().toISOString().split("T")[0],
        status: "Active",
        years_experience: years_experience || null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .select()
      .single();

    if (profileError) {
      // Rollback: Delete auth user if profile creation fails
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
        text: `👋 Welcome! Your account has been created with role ${role}.`,
        read: false  // ✅ add this explicitly
      });

    // 4. Send welcome email with temporary password
    const emailSent = await sendWelcomeEmail(
      email,
      first_name,
      last_name,
      employeeId,
      generatedPassword,
      role
    );

    res.status(201).json({
      success: true,
      message: "User created successfully. Temporary password sent to email.",
      user: {
        ...profileData,
        email: authData.user.email // Get email from auth data
      },
      auth_user: authData.user,
      email_sent: emailSent,

      // Add this
      temporary_password: generatedPassword
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

    // Get user profile
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .single();

    if (profileError) {
      return res.status(404).json({
        success: false,
        error: "User not found"
      });
    }

    // Get email from auth users
    const { data: authData, error: authError } = await supabase.auth.admin.getUserById(userId);
    
    if (authError) {
      return res.status(404).json({
        success: false,
        error: "User not found in auth"
      });
    }

    const userEmail = authData.user.email;

    // Generate new temporary password
    const newPassword = generatePassword();

    // Update auth user password
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

    // Send email with new temporary password
    const emailSent = await sendWelcomeEmail(
      userEmail,
      profile.first_name,
      profile.last_name,
      profile.employee_id,
      newPassword,
      profile.role
    );

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

module.exports = router;