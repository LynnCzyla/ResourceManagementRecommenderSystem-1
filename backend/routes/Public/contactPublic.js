// routes/Public/contactPublic.js
const express = require("express");
const router = express.Router();
const supabase = require("../../supabase");
const { sendMail, getLogoDataUri } = require("../../utils/brevoMailer");
const { logAuditEvent } = require('../../utils/auditLogger');

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
              <img src="${getLogoDataUri()}" alt="WEA Logo" style="height: 65px; object-fit: contain;" />
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
  };
  await sendMail(mailOptions);
};

// ============================================
// ✅ PUBLIC ROUTES (No auth required)
// ============================================

// GET /api/public/admin/branches — Get all active branches for dropdown (PUBLIC)
router.get("/branches", async (req, res) => {
  try {
    console.log("📊 Branches requested (public endpoint - no auth)");

    const { data, error } = await supabase
      .from("branches")
      .select("id, name, location")
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

// POST /api/public/admin/contact-admin — submit from login page (PUBLIC - no auth)
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

    // Respond right away — the essential part (saving the message) is
    // done. Audit logging, admin notifications, and the confirmation
    // email are all "nice to have" side effects that shouldn't make
    // the person wait. They run in the background after we respond.
    res.json({
      success: true,
      message: "Your message has been sent to the administrator."
    });

    (async () => {
      try {
        await logAuditEvent({
          action: 'Created',
          systemCategory: 'Contact Requests',
          logDescription: `Created contact request from ${fullName} (${email})`,
          branch: branchId || null,
        });
      } catch (auditErr) {
        console.error("❌ Audit log error:", auditErr.message);
      }

      // Notify admins
      try {
        let adminQuery = supabase
          .from('profiles')
          .select('id')
          .eq('role', 'Admin');

        if (branchId) {
          adminQuery = adminQuery.eq('branch_id', branchId);
        }

        const { data: admins, error: adminError } = await adminQuery;

        if (adminError) {
          console.error("❌ Failed to fetch admins:", adminError.message);
        } else if (admins && admins.length > 0) {
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
        }
      } catch (notifErr) {
        console.error("❌ Admin notification error:", notifErr.message);
      }

      try {
        await sendConfirmationEmail({ fullName, email, purpose, message });
        console.log("✅ Confirmation email sent to requester:", email);
      } catch (emailErr) {
        console.error("❌ Failed to send confirmation email:", emailErr.message);
      }
    })();

  } catch (error) {
    console.error("Error in contact-admin:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error"
    });
  }
});

module.exports = router;