// routes/Auth/forgotPassword.js
const express = require("express");
const router = express.Router();
const supabase = require("../../supabase");
const { sendMail, getLogoUrl } = require("../../utils/brevoMailer");
const { logAuditEvent } = require('../../utils/auditLogger');

// Build and send the password-reset email via Brevo's API
const sendResetEmail = async (email, resetLink) => {
  const mailOptions = {
    from: process.env.SMTP_FROM || '"WEA Resource Management" <noreply@wea.com>',
    to: email,
    subject: 'Reset Your WEA Password',
    html: `
      <div style="font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 32px 16px; background-color: #0f172a;">

        <!-- Card -->
        <div style="background: #1e293b; border: 1px solid #334155; border-radius: 20px; overflow: hidden;">

          <!-- Header -->
          <div style="padding: 32px 32px 24px 32px; text-align: center; border-bottom: 1px solid #334155;">
            <div style="margin-bottom: 16px;">
              <img src="${getLogoUrl()}" alt="WEA Logo" style="height: 65px; object-fit: contain;" />
            </div>
            <h1 style="font-family: 'Outfit', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #f8fafc; font-size: 22px; font-weight: 800; letter-spacing: -0.5px; margin: 0 0 4px 0;">
              Reset Your Password
            </h1>
            <p style="color: #94a3b8; font-size: 13px; font-weight: 500; margin: 0; text-transform: uppercase; letter-spacing: 0.5px;">
              WEA Resource Management System
            </p>
          </div>

          <!-- Body -->
          <div style="padding: 32px;">
            <p style="color: #cbd5e1; font-size: 14px; line-height: 1.6; margin: 0 0 28px 0;">
              We received a request to reset the password for this account. Click the button below to choose a new one. This link is valid for a limited time only.
            </p>

            <!-- Button -->
            <div style="text-align: center; margin-bottom: 28px;">
              <a href="${resetLink}" style="background: #10b981; color: #0f172a; padding: 14px 36px; border-radius: 12px; text-decoration: none; font-weight: 700; font-size: 14px; display: inline-block; font-family: 'Outfit', sans-serif;">
                Reset Password
              </a>
            </div>

            <!-- Fallback link -->
            <div style="background: rgba(255,255,255,0.03); border: 1px solid #334155; border-radius: 12px; padding: 14px 16px; margin-bottom: 24px;">
              <p style="color: #94a3b8; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; margin: 0 0 6px 0;">
                Or paste this link into your browser
              </p>
              <a href="${resetLink}" style="color: #0ea5e9; font-size: 12px; word-break: break-all; text-decoration: underline;">${resetLink}</a>
            </div>

            <!-- Warning -->
            <div style="background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.3); border-radius: 12px; padding: 14px 16px;">
              <p style="margin: 0; color: #f87171; font-size: 13px; line-height: 1.5;">
                ⚠️ If you didn't request this, you can safely ignore this email — your password will remain unchanged.
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
  };

  await sendMail(mailOptions);
};

// Detect the specific "no user with this email" case from Supabase's
// generateLink error. Supabase typically returns a 422/400 with a message
// like "Unable to validate email address: User not found" or similar,
// often alongside error.status === 422 / error.code === 'user_not_found'.
// We check a few known shapes defensively since Supabase's exact wording
// has changed across versions.
const isNoAccountError = (error) => {
  if (!error) return false;

  const code = (error.code || "").toString().toLowerCase();
  const message = (error.message || "").toString().toLowerCase();

  if (code === "user_not_found") return true;

  return (
    message.includes("user not found") ||
    message.includes("unable to validate email") ||
    message.includes("no user found") ||
    message.includes("email not found")
  );
};

// POST /api/auth/forgot-password
router.post("/forgot-password", async (req, res) => {
  try {
    const { email, redirectOrigin } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        error: "Email is required"
      });
    }

    // Prefer the origin sent by the frontend (window.location.origin) so
    // this works correctly no matter which port the dev server runs on.
    // Falls back to APP_URL from .env, then a hardcoded default.
    const baseUrl = redirectOrigin || process.env.APP_URL || 'http://localhost:3000';
    const cleanBaseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;

    // Generate a Supabase recovery link without Supabase sending its own email
    const { data, error } = await supabase.auth.admin.generateLink({
      type: "recovery",
      email,
      options: {
        redirectTo: `${cleanBaseUrl}/reset-password`
      }
    });

    if (error) {
      console.error("generateLink error:", error.message);

      if (isNoAccountError(error)) {
        // Explicitly tell the frontend no account exists for this email.
        // NOTE: this is an intentional product decision to reveal account
        // existence on this internal tool — it trades away the standard
        // enumeration protection. Do not do this on a public-facing app.
        return res.json({
          success: false,
          accountExists: false,
          error: "No account exists for this email address."
        });
      }

      // Any other failure (rate limit, SMTP misconfig, network issue, etc.)
      // falls back to the generic safe response so we don't leak details
      // or incorrectly tell a real user they have no account.
      return res.json({
        success: true,
        accountExists: true,
        message: "If an account exists for this email, a reset link has been sent."
      });
    }

    const resetLink = data.properties.action_link;

    await sendResetEmail(email, resetLink);

    const { data: users } = await supabase.auth.admin.listUsers();
    const matchedUser = users?.users?.find((user) => user.email?.toLowerCase() === email.toLowerCase());

    await logAuditEvent({
      userId: matchedUser?.id || null,
      action: 'Password Reset',
      systemCategory: 'Auth',
      logDescription: `Password reset link requested for ${email}`,
    });

    res.json({
      success: true,
      accountExists: true,
      message: "If an account exists for this email, a reset link has been sent."
    });

  } catch (error) {
    console.error("Error in forgot-password:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error"
    });
  }
});

module.exports = router;