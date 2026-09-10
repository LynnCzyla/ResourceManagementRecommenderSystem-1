// backend/utils/brevoMailer.js
//
// Thin wrapper around Brevo's transactional email HTTP API
// (https://api.brevo.com/v3/smtp/email). Replaces the old nodemailer/SMTP
// setup. Uses Node's built-in fetch (Node 18+), so no extra dependency
// is required.
//
// IMPORTANT: Brevo's transactional API does NOT support inline `cid:`
// attachments (confirmed by Brevo support/docs) — only their SMTP relay
// does. Any HTML that needs an inline logo/image must embed it as a
// base64 data URI directly in the `src` attribute instead. See
// getLogoDataUri() below.

const fs = require("fs");

const BREVO_API_URL = "https://api.brevo.com/v3/smtp/email";

if (!process.env.BREVO_API_KEY) {
  console.warn("⚠️ Missing environment variable: BREVO_API_KEY (emails will fail to send)");
}

// Parses a nodemailer-style "from" string like:
//   '"WEA Resource Management" <noreply@wea.com>'
// or a plain email address, into the { name, email } shape Brevo expects.
const parseSender = (fromStr) => {
  if (!fromStr) return { email: "noreply@wea.com", name: "WEA Resource Management" };

  const match = fromStr.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
  if (match) {
    const name = match[1].trim();
    const email = match[2].trim();
    return { email, name: name || undefined };
  }

  // Plain email address, no display name
  return { email: fromStr.trim() };
};

// Normalizes a "to" field into Brevo's array-of-objects shape.
// Accepts a single email string, a comma-separated string, or an array.
const parseRecipients = (to) => {
  if (Array.isArray(to)) {
    return to.map((entry) =>
      typeof entry === "string" ? { email: entry.trim() } : entry
    );
  }
  return String(to)
    .split(",")
    .map((e) => e.trim())
    .filter(Boolean)
    .map((email) => ({ email }));
};

// Converts nodemailer-style attachments ({ filename, path } or
// { filename, content }) into Brevo's { name, content(base64) } shape.
// NOTE: these are real (downloadable) attachments, not inline images —
// Brevo's API can't embed images inline (see header comment).
const buildAttachments = (attachments = []) => {
  return attachments
    .filter(Boolean)
    .map((att) => {
      let base64Content;
      if (att.path) {
        base64Content = fs.readFileSync(att.path).toString("base64");
      } else if (att.content) {
        base64Content = Buffer.isBuffer(att.content)
          ? att.content.toString("base64")
          : Buffer.from(att.content).toString("base64");
      } else {
        return null;
      }
      return { name: att.filename || "attachment", content: base64Content };
    })
    .filter(Boolean);
};

// Core send function. Accepts the same shape of mailOptions the codebase
// already builds for nodemailer: { from, to, subject, html, attachments }.
const sendMail = async ({ from, to, subject, html, text, attachments }) => {
  if (!process.env.BREVO_API_KEY) {
    const error = "BREVO_API_KEY is not configured";
    console.error(`❌ Email send failed: ${error}`);
    return { success: false, error };
  }

  const sender = parseSender(from);
  const brevoAttachments = buildAttachments(attachments);

  const payload = {
    sender,
    to: parseRecipients(to),
    subject,
    htmlContent: html,
    ...(text ? { textContent: text } : {}),
    ...(brevoAttachments.length ? { attachment: brevoAttachments } : {}),
  };

  try {
    console.log(`📧 Sending email to ${to} via Brevo API`);
    const response = await fetch(BREVO_API_URL, {
      method: "POST",
      headers: {
        "api-key": process.env.BREVO_API_KEY,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      const errMsg = data?.message || `Brevo API returned ${response.status}`;
      console.error(`❌ Email send failed: ${errMsg}`);
      return { success: false, error: errMsg };
    }

    console.log(`✅ Email sent to ${to}`);
    console.log(`📧 Message ID: ${data.messageId}`);
    return { success: true, messageId: data.messageId };
  } catch (error) {
    console.error("❌ Email send failed:", error.message);
    return { success: false, error: error.message };
  }
};

// Public URL of the logo, served by Vercel as a static asset from main/public/.
// Using a hosted URL instead of embedding the image as base64 keeps the
// email small — Gmail (and other clients) clip/truncate emails around
// ~102KB, and a base64-embedded PNG easily pushes an HTML email past that,
// breaking the image and cutting off content ("[Message clipped]").
const getLogoUrl = () => {
  const appUrl = (process.env.APP_URL || "").replace(/\/+$/, "");
  if (!appUrl) {
    console.warn("⚠️ APP_URL not set — logo image link in emails will be broken");
    return null;
  }
  return `${appUrl}/wea-logo.png`;
};

// Ready-to-use <img> (or text fallback) HTML for email headers.
const getLogoHtml = () => {
  const logoUrl = getLogoUrl();
  if (logoUrl) {
    return `<img src="${logoUrl}" alt="WEA Logo" style="height: 65px; object-fit: contain; display: inline-block; max-width: 200px;" />`;
  }
  return `<div style="font-size: 28px; font-weight: 800; color: #3b82f6; letter-spacing: 3px; font-family: 'Outfit', sans-serif;">WEA</div>`;
};

module.exports = { sendMail, getLogoUrl, getLogoHtml };
