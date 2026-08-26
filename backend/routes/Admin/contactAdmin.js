// routes/Admin/contactAdmin.js
const express = require("express");
const router = express.Router();
const supabase = require("../../supabase");
const nodemailer = require("nodemailer");
const path = require("path");
const { logAuditEvent } = require('../../utils/auditLogger');
const { verifyToken } = require('../Middleware/auth');

// ✅ Apply auth middleware to protected routes
// (POST /contact-admin and GET /branches are public - no auth needed)
// All other routes require authentication

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: process.env.SMTP_PORT || 587,
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

const buildFullName = (firstName, middleName, lastName) =>
  [firstName, middleName, lastName].filter(Boolean).join(' ');

const sendConfirmationEmail = async ({ fullName, email, purpose, message }) => {
  const mailOptions = {
    from: process.env.SMTP_FROM || '"WEA Resource Management" <noreply@wea.com>',
    to: email,
    subject: 'We received your message — WEA Resource Management',
    html: `
      <div style="font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 32px 16px; background-color: #0f172a;">
        <div style="background: #1e293b; border: 1px solid #334155; border-radius: 20px; overflow: hidden;">
          <div style="padding: 32px 32px 24px 32px; text-align: center; border-bottom: 1px solid #334155;">
            <div style="margin-bottom: 16px;">
              <img src="cid:wealogo" alt="WEA Logo" style="height: 65px; object-fit: contain;" />
            </div>
            <h1 style="font-family: 'Outfit', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #f8fafc; font-size: 22px; font-weight: 800; letter-spacing: -0.5px; margin: 0 0 4px 0;">
              We Received Your Message
            </h1>
            <p style="color: #94a3b8; font-size: 13px; font-weight: 500; margin: 0; text-transform: uppercase; letter-spacing: 0.5px;">
              WEA Resource Management System
            </p>
          </div>
          <div style="padding: 32px;">
            <p style="color: #cbd5e1; font-size: 14px; line-height: 1.6; margin: 0 0 20px 0;">
              Hi ${fullName}, thanks for reaching out. An administrator has been notified and will get back to you as soon as possible.
            </p>
            <div style="background: rgba(255,255,255,0.03); border: 1px solid #334155; border-radius: 12px; padding: 16px; margin-bottom: 24px;">
              <p style="color: #94a3b8; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; margin: 0 0 8px 0;">Purpose</p>
              <p style="color: #f8fafc; font-size: 14px; margin: 0 0 16px 0;">${purpose}</p>
              <p style="color: #94a3b8; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; margin: 0 0 8px 0;">Your Message</p>
              <p style="color: #f8fafc; font-size: 14px; margin: 0; white-space: pre-wrap;">${message}</p>
            </div>
            <div style="background: rgba(16, 185, 129, 0.08); border: 1px solid rgba(16, 185, 129, 0.3); border-radius: 12px; padding: 14px 16px;">
              <p style="margin: 0; color: #6ee7b7; font-size: 13px; line-height: 1.5;">
                ℹ️ This is an automated confirmation. Please don't reply to this email.
              </p>
            </div>
          </div>
        </div>
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
  await transporter.sendMail(mailOptions);
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/admin/branches — Get all active branches for dropdown (PUBLIC)
// ─────────────────────────────────────────────────────────────────────────────
router.get("/branches", async (req, res) => {
  try {
    console.log("📊 Branches requested (public endpoint)");

    const { data, error } = await supabase
      .from("branches")
      .select("id, name, location")  // ✅ Fixed: removed 'code' column
      .eq("status", "Active")
      .order("name", { ascending: true });

    if (error) throw error;

    console.log(`✅ Found ${data?.length || 0} branches`);

    res.json({
      success: true,
      data: data || [],
    });
  } catch (error) {
    console.error("Error fetching branches:", error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/admin/contact-admin — submit from login page (PUBLIC - no auth)
// ─────────────────────────────────────────────────────────────────────────────
router.post("/contact-admin", async (req, res) => {
  try {
    const { firstName, middleName, lastName, email, purpose, message, phone, branchId } = req.body;

    if (!firstName || !lastName || !email || !purpose || !message) {
      return res.status(400).json({
        success: false,
        error: "First name, last name, email, purpose, and message are required."
      });
    }

    if (!branchId) {
      return res.status(400).json({
        success: false,
        error: "Please select a branch."
      });
    }

    const fullName = buildFullName(firstName, middleName, lastName);

    console.log("📩 New contact admin request:", { firstName, middleName, lastName, email, purpose, phone, branchId });

    // 1. Save contact request to database with branch_id
    const { error: insertError } = await supabase
      .from("contact_requests")
      .insert([{
        first_name: firstName,
        middle_name: middleName || null,
        last_name: lastName,
        email,
        request_type: purpose,
        message,
        phone: phone || null,
        branch_id: branchId,
        status: "Pending"
      }]);

    if (insertError) {
      console.error("contact_requests insert error:", insertError.message);
      return res.status(500).json({
        success: false,
        error: "Failed to submit your request. Please try again."
      });
    }

    console.log("✅ Contact request saved");

    await logAuditEvent({
      action: 'Created',
      systemCategory: 'Contact Requests',
      logDescription: `Created contact request from ${fullName} (${email})`,
      branch: branchId || null,
    });

    // 2. 🔔 Notify admins based on branch
    try {
      let adminQuery = supabase
        .from('profiles')
        .select('id')
        .eq('role', 'Admin');

      // ✅ If branchId is provided, only notify admins in that branch
      if (branchId) {
        adminQuery = adminQuery.eq('branch_id', branchId);
      }

      const { data: admins, error: adminError } = await adminQuery;

      if (adminError) {
        console.error("❌ Failed to fetch admins:", adminError.message);
      } else if (admins && admins.length > 0) {
        // Get branch name for notification
        let branchName = 'All Branches';
        if (branchId) {
          const { data: branchData } = await supabase
            .from('branches')
            .select('name')
            .eq('id', branchId)
            .single();
          if (branchData) {
            branchName = branchData.name;
          }
        }

        const adminNotifications = admins.map(admin => ({
          recipient_id: admin.id,
          type: 'alert',
          text: `📩 New contact request from ${fullName} (${email}) — Purpose: ${purpose} — Branch: ${branchName}`,
          read: false
        }));

        const { error: notifError } = await supabase
          .from('notifications')
          .insert(adminNotifications);

        if (notifError) {
          console.error("❌ Failed to insert admin notifications:", notifError.message);
        } else {
          console.log(`✅ Notified ${admins.length} admin(s) about contact request`);
        }
      } else {
        console.log("⚠️ No admin users found to notify");
      }
    } catch (notifErr) {
      console.error("❌ Admin notification error:", notifErr.message);
    }

    // 3. Send confirmation email to the person who submitted
    try {
      await sendConfirmationEmail({ fullName, email, purpose, message });
      console.log("✅ Confirmation email sent to requester:", email);
    } catch (emailErr) {
      console.error("❌ Failed to send confirmation email:", emailErr.message);
    }

    res.json({
      success: true,
      message: "Your message has been sent to the administrator."
    });

  } catch (error) {
    console.error("Error in contact-admin:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error"
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/admin/contact-requests — fetch all contact requests (filtered by branch)
// ─────────────────────────────────────────────────────────────────────────────
router.get("/contact-requests", verifyToken, async (req, res) => {
  try {
    console.log(`📊 Contact requests requested by: ${req.user.employee_id} (${req.user.role})`);
    console.log(`🏢 Branch filter: ${req.user.is_super_admin ? 'ALL' : req.user.branch_id}`);

    let query = supabase
      .from("contact_requests")
      .select("*")
      .order("created_at", { ascending: false });

    // ✅ Filter by branch for non-super admins
    if (!req.user.is_super_admin && req.user.branch_id) {
      query = query.eq("branch_id", req.user.branch_id);
    }

    const { data, error } = await query;

    if (error) throw error;

    res.json({ 
      success: true, 
      requests: data || [],
      meta: {
        branch_filter: req.user.is_super_admin ? 'all' : req.user.branch_id,
        user_role: req.user.role,
        is_super_admin: req.user.is_super_admin,
      }
    });
  } catch (error) {
    console.error("Error fetching contact requests:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/admin/contact-requests/:id — get single request
// ─────────────────────────────────────────────────────────────────────────────
router.get("/contact-requests/:id", verifyToken, async (req, res) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabase
      .from("contact_requests")
      .select("*")
      .eq("id", id)
      .single();

    if (error) throw error;

    // ✅ Check if user has permission to view this request
    if (!req.user.is_super_admin && data.branch_id !== req.user.branch_id) {
      return res.status(403).json({
        success: false,
        error: "You do not have permission to view this request"
      });
    }

    res.json({ success: true, request: data });
  } catch (error) {
    console.error("Error fetching contact request:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/admin/contact-requests/:id/status — update status
// ─────────────────────────────────────────────────────────────────────────────
router.patch("/contact-requests/:id/status", verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    // ✅ Check if user has permission to update this request
    const { data: existingRequest, error: checkError } = await supabase
      .from("contact_requests")
      .select("branch_id")
      .eq("id", id)
      .single();

    if (checkError) throw checkError;

    // Non-super admins can only update requests in their branch
    if (!req.user.is_super_admin && existingRequest.branch_id !== req.user.branch_id) {
      return res.status(403).json({
        success: false,
        error: "You do not have permission to update this request"
      });
    }

    const { data, error } = await supabase
      .from("contact_requests")
      .update({
        status: status || "Pending",
        processed_by: req.user.id,
        processed_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;

    await logAuditEvent({
      req,
      userId: req.user.id,
      action: 'Updated',
      systemCategory: 'Contact Requests',
      logDescription: `Updated contact request ${id} to ${status}`,
      branch: req.user.branch_id,
      performed_by: req.user.employee_id
    });

    res.json({ success: true, request: data });
  } catch (error) {
    console.error("Error updating contact request status:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/admin/contact-requests/:id — delete a request
// ─────────────────────────────────────────────────────────────────────────────
router.delete("/contact-requests/:id", verifyToken, async (req, res) => {
  try {
    const { id } = req.params;

    // ✅ Check if user has permission to delete this request
    const { data: existingRequest, error: checkError } = await supabase
      .from("contact_requests")
      .select("branch_id")
      .eq("id", id)
      .single();

    if (checkError) throw checkError;

    // Non-super admins can only delete requests in their branch
    if (!req.user.is_super_admin && existingRequest.branch_id !== req.user.branch_id) {
      return res.status(403).json({
        success: false,
        error: "You do not have permission to delete this request"
      });
    }

    const { error } = await supabase
      .from("contact_requests")
      .delete()
      .eq("id", id);

    if (error) throw error;

    await logAuditEvent({
      req,
      userId: req.user.id,
      action: 'Deleted',
      systemCategory: 'Contact Requests',
      logDescription: `Deleted contact request ${id}`,
      branch: req.user.branch_id,
      performed_by: req.user.employee_id
    });

    res.json({ success: true });
  } catch (error) {
    console.error("Error deleting contact request:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/admin/contact-requests/count — get count by status (filtered by branch)
// ─────────────────────────────────────────────────────────────────────────────
router.get("/contact-requests/count", verifyToken, async (req, res) => {
  try {
    let query = supabase
      .from("contact_requests")
      .select("status", { count: 'exact', head: true });

    // ✅ Filter by branch for non-super admins
    if (!req.user.is_super_admin && req.user.branch_id) {
      query = query.eq("branch_id", req.user.branch_id);
    }

    const { count, error } = await query;

    if (error) throw error;

    // Get pending count
    let pendingQuery = supabase
      .from("contact_requests")
      .select("status", { count: 'exact', head: true })
      .eq("status", "Pending");

    if (!req.user.is_super_admin && req.user.branch_id) {
      pendingQuery = pendingQuery.eq("branch_id", req.user.branch_id);
    }

    const { count: pendingCount } = await pendingQuery;

    res.json({
      success: true,
      data: {
        total: count || 0,
        pending: pendingCount || 0,
      }
    });
  } catch (error) {
    console.error("Error counting contact requests:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;