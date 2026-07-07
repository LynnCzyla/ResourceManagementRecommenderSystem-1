// routes/Admin/contactAdmin.js
const express = require("express");
const router = express.Router();
const supabase = require("../../supabase");
const nodemailer = require("nodemailer");
const { logAuditEvent } = require('../../utils/auditLogger');

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
            <div style="display: inline-flex; align-items: center; justify-content: center; width: 56px; height: 56px; border-radius: 14px; background: rgba(16, 185, 129, 0.15); margin-bottom: 16px;">
              <span style="font-size: 26px; line-height: 56px;">📨</span>
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
    `
  };
  await transporter.sendMail(mailOptions);
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/admin/contact-admin — submit from login page
// ─────────────────────────────────────────────────────────────────────────────
router.post("/contact-admin", async (req, res) => {
  try {
    const { firstName, middleName, lastName, email, purpose, message, phone } = req.body;

    if (!firstName || !lastName || !email || !purpose || !message) {
      return res.status(400).json({
        success: false,
        error: "First name, last name, email, purpose, and message are required."
      });
    }

    const fullName = buildFullName(firstName, middleName, lastName);

    console.log("📩 New contact admin request:", { firstName, middleName, lastName, email, purpose, phone });

    // 1. Save contact request to database
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
        status: "pending"
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
    });

    // 2. 🔔 Notify all admins about the new contact request
    try {
      const { data: admins, error: adminError } = await supabase
        .from('profiles')
        .select('id')
        .eq('role', 'Admin');

      if (adminError) {
        console.error("❌ Failed to fetch admins:", adminError.message);
      } else if (admins && admins.length > 0) {
        const adminNotifications = admins.map(admin => ({
          recipient_id: admin.id,
          type: 'alert',
          text: `📩 New contact request from ${fullName} (${email}) — Purpose: ${purpose}`,
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
// GET /api/admin/contact-requests — fetch all contact requests
// ─────────────────────────────────────────────────────────────────────────────
router.get("/contact-requests", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("contact_requests")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) throw error;

    res.json({ success: true, requests: data || [] });
  } catch (error) {
    console.error("Error fetching contact requests:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/admin/contact-requests/:id/status — update status
// ─────────────────────────────────────────────────────────────────────────────
router.patch("/contact-requests/:id/status", async (req, res) => {
  try {
    const { id } = req.params;
    const { status, processed_by, processed_at } = req.body;

    const { data, error } = await supabase
      .from("contact_requests")
      .update({
        status,
        processed_by: processed_by || null,
        processed_at: processed_at || new Date().toISOString(),
      })
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;

    await logAuditEvent({
      req,
      userId: processed_by || null,
      action: 'Updated',
      systemCategory: 'Contact Requests',
      logDescription: `Updated contact request ${id} to ${status}`,
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
router.delete("/contact-requests/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const { error } = await supabase
      .from("contact_requests")
      .delete()
      .eq("id", id);

    if (error) throw error;

    await logAuditEvent({
      req,
      action: 'Deleted',
      systemCategory: 'Contact Requests',
      logDescription: `Deleted contact request ${id}`,
    });

    res.json({ success: true });
  } catch (error) {
    console.error("Error deleting contact request:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;