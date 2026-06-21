// routes/Admin/contactAdmin.js
const express = require("express");
const router = express.Router();
const supabase = require("../../supabase");
const nodemailer = require("nodemailer");

// Self-contained transporter (mirrors forgotPassword.js's setup)
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: process.env.SMTP_PORT || 587,
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

// ── Email to the person who submitted the request ─────────────────────────────
const sendConfirmationEmail = async ({ name, email, purpose, message }) => {
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
              Hi ${name}, thanks for reaching out. An administrator has been notified and will get back to you as soon as possible.
            </p>

            <div style="background: rgba(255,255,255,0.03); border: 1px solid #334155; border-radius: 12px; padding: 16px; margin-bottom: 24px;">
              <p style="color: #94a3b8; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; margin: 0 0 8px 0;">
                Purpose
              </p>
              <p style="color: #f8fafc; font-size: 14px; margin: 0 0 16px 0;">
                ${purpose}
              </p>
              <p style="color: #94a3b8; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; margin: 0 0 8px 0;">
                Your Message
              </p>
              <p style="color: #f8fafc; font-size: 14px; margin: 0; white-space: pre-wrap;">
                ${message}
              </p>
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

// ── Email to all Admin-role users ──────────────────────────────────────────────
const sendAdminNotificationEmail = async ({ adminEmails, name, email, purpose, message, phone, department }) => {
  if (!adminEmails || adminEmails.length === 0) {
    console.warn('⚠️ No admin emails found to notify — skipping admin notification email');
    return;
  }

  const mailOptions = {
    from: process.env.SMTP_FROM || '"WEA Resource Management" <noreply@wea.com>',
    to: adminEmails.join(','),
    subject: `New Contact Request: ${purpose}`,
    html: `
      <div style="font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 32px 16px; background-color: #0f172a;">
        <div style="background: #1e293b; border: 1px solid #334155; border-radius: 20px; overflow: hidden;">

          <div style="padding: 32px 32px 24px 32px; text-align: center; border-bottom: 1px solid #334155;">
            <div style="display: inline-flex; align-items: center; justify-content: center; width: 56px; height: 56px; border-radius: 14px; background: rgba(14, 165, 233, 0.15); margin-bottom: 16px;">
              <span style="font-size: 26px; line-height: 56px;">📬</span>
            </div>
            <h1 style="font-family: 'Outfit', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #f8fafc; font-size: 22px; font-weight: 800; letter-spacing: -0.5px; margin: 0 0 4px 0;">
              New Contact Request
            </h1>
            <p style="color: #94a3b8; font-size: 13px; font-weight: 500; margin: 0; text-transform: uppercase; letter-spacing: 0.5px;">
              WEA Resource Management System
            </p>
          </div>

          <div style="padding: 32px;">
            <div style="background: rgba(255,255,255,0.03); border: 1px solid #334155; border-radius: 12px; padding: 16px; margin-bottom: 16px;">
              <table style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td style="color: #94a3b8; font-size: 12px; font-weight: 600; padding: 4px 0; width: 110px;">Name</td>
                  <td style="color: #f8fafc; font-size: 14px; padding: 4px 0;">${name}</td>
                </tr>
                <tr>
                  <td style="color: #94a3b8; font-size: 12px; font-weight: 600; padding: 4px 0;">Email</td>
                  <td style="color: #f8fafc; font-size: 14px; padding: 4px 0;">${email}</td>
                </tr>
                <tr>
                  <td style="color: #94a3b8; font-size: 12px; font-weight: 600; padding: 4px 0;">Phone</td>
                  <td style="color: #f8fafc; font-size: 14px; padding: 4px 0;">${phone || '—'}</td>
                </tr>
                <tr>
                  <td style="color: #94a3b8; font-size: 12px; font-weight: 600; padding: 4px 0;">Department</td>
                  <td style="color: #f8fafc; font-size: 14px; padding: 4px 0;">${department || '—'}</td>
                </tr>
                <tr>
                  <td style="color: #94a3b8; font-size: 12px; font-weight: 600; padding: 4px 0;">Purpose</td>
                  <td style="color: #f8fafc; font-size: 14px; padding: 4px 0;">${purpose}</td>
                </tr>
              </table>
            </div>

            <div style="background: rgba(255,255,255,0.03); border: 1px solid #334155; border-radius: 12px; padding: 16px;">
              <p style="color: #94a3b8; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; margin: 0 0 8px 0;">
                Message
              </p>
              <p style="color: #f8fafc; font-size: 14px; margin: 0; white-space: pre-wrap;">
                ${message}
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

// POST /api/admin/contact-admin
router.post("/contact-admin", async (req, res) => {
  try {
    const { name, email, purpose, message, phone, department } = req.body;

    if (!name || !email || !purpose || !message) {
      return res.status(400).json({
        success: false,
        error: "Name, email, purpose, and message are required."
      });
    }

    console.log("📩 New contact admin request:", { name, email, purpose, phone, department });

    // contact_requests columns: email, request_type, message, status,
    // processed_by, processed_at, created_at, name, phone, department
    const { error: insertError } = await supabase
      .from("contact_requests")
      .insert([{
        name,
        email,
        request_type: purpose,
        message,
        phone: phone || null,
        department: department || null,
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

    // ── Send confirmation email to the requester ─────────────────────────────
    try {
      await sendConfirmationEmail({ name, email, purpose, message });
      console.log("✅ Confirmation email sent to requester:", email);
    } catch (emailErr) {
      // Don't fail the whole request just because the confirmation email
      // didn't send — the request is already saved in the database.
      console.error("❌ Failed to send confirmation email:", emailErr.message);
    }

    // ── Look up all Admin-role users and email them ──────────────────────────
    try {
      const { data: admins, error: adminError } = await supabase
        .from("profiles")
        .select("email")
        .eq("role", "Admin");

      if (adminError) {
        console.error("❌ Failed to fetch admin emails:", adminError.message);
      } else {
        const adminEmails = (admins || [])
          .map((a) => a.email)
          .filter(Boolean);

        await sendAdminNotificationEmail({
          adminEmails,
          name,
          email,
          purpose,
          message,
          phone,
          department
        });
        console.log("✅ Admin notification email sent to:", adminEmails.join(', ') || '(none found)');
      }
    } catch (adminEmailErr) {
      console.error("❌ Failed to send admin notification email:", adminEmailErr.message);
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

module.exports = router;