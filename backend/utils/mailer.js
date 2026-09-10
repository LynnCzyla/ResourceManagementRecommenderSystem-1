// backend/utils/mailer.js
// Shared mailer so every route (forgotPassword, interviews, etc.) sends
// real emails automatically instead of opening a mail client.
//
// Sends via Brevo's transactional email HTTP API (see ./brevoMailer.js).
// NOTE: Brevo's API can't do inline cid: images, so the logo is embedded
// as a base64 data URI instead (getLogoHtml() below handles this).
const { sendMail: brevoSendMail, getLogoHtml } = require("./brevoMailer");

// Helper: Send email with consistent error handling (kept for backward
// compatibility with the rest of this file, now backed by Brevo's API
// instead of nodemailer).
const sendEmail = async (mailOptions) => {
  return await brevoSendMail(mailOptions);
};

// Helper: Base email wrapper
const getEmailWrapper = (content) => `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>WEA Email</title>
  </head>
  <body style="margin: 0; padding: 0; font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #0f172a;">
    <div style="max-width: 600px; margin: 0 auto; padding: 32px 16px; background-color: #0f172a;">
      ${content}
    </div>
  </body>
  </html>
`;

// ============================================
// ADMIN WELCOME EMAIL - FIXED
// ============================================
const sendAdminWelcomeEmail = async ({
  to,
  firstName,
  lastName,
  employeeId,
  temporaryPassword,
  branchName,
  createdBy = 'Super Admin',
}) => {
  const fullName = `${firstName} ${lastName}`.trim();
  const currentYear = new Date().getFullYear();
  
  const appUrl = process.env.APP_URL || 'http://localhost:5173';
  const cleanAppUrl = appUrl.replace(/\/+$/, '');
  const loginUrl = `${cleanAppUrl}/login`;

  console.log(`📧 Sending welcome email to ${to}`);
  console.log(`🔗 Login URL: ${loginUrl}`);

  const mailOptions = {
    from: process.env.SMTP_FROM || '"WEA Resource Management" <noreply@wea.com>',
    to,
    subject: `🎉 Welcome to WEA! Your Admin Account is Ready`,
    html: getEmailWrapper(`
      <div style="background: #1e293b; border: 1px solid #334155; border-radius: 20px; overflow: hidden;">
        <div style="padding: 32px 32px 24px 32px; text-align: center; border-bottom: 1px solid #334155;">
          <div style="margin-bottom: 16px;">
            ${getLogoHtml()}
          </div>
          <h1 style="font-family: 'Outfit', sans-serif; color: #f8fafc; font-size: 22px; font-weight: 800; letter-spacing: -0.5px; margin: 0 0 4px 0;">
            Welcome to WEA! 🎉
          </h1>
          <p style="color: #94a3b8; font-size: 13px; font-weight: 500; margin: 0; text-transform: uppercase; letter-spacing: 0.5px;">
            Admin Account Created
          </p>
        </div>
        
        <div style="padding: 32px;">
          <p style="color: #cbd5e1; font-size: 14px; line-height: 1.6; margin: 0 0 20px 0;">
            Dear <strong style="color: #f8fafc;">${fullName}</strong>,<br/><br/>
            Your Administrator account has been created by <strong style="color: #3b82f6;">${createdBy}</strong>.
            You now have full administrative access to the WEA Resource Management System.
          </p>

          <div style="background: rgba(59, 130, 246, 0.06); border: 1px solid rgba(59, 130, 246, 0.25); border-radius: 14px; padding: 20px; margin-bottom: 24px;">
            <h3 style="color: #f8fafc; font-size: 15px; font-weight: 700; margin: 0 0 16px 0; border-bottom: 1px dashed rgba(255,255,255,0.1); padding-bottom: 8px;">
              🔑 Account Details
            </h3>
            <table style="width: 100%; border-collapse: collapse; color: #cbd5e1; font-size: 13px;">
              <tr><td style="padding: 6px 0; font-weight: 600; width: 40%;">Role:</td><td><strong style="color: #3b82f6;">Admin</strong></td></tr>
              <tr><td style="padding: 6px 0; font-weight: 600;">Employee ID:</td><td><code style="background: #0f172a; padding: 2px 8px; border-radius: 4px; color: #e2e8f0;">${employeeId}</code></td></tr>
              ${branchName ? `<tr><td style="padding: 6px 0; font-weight: 600;">Branch:</td><td>${branchName}</td></tr>` : ''}
            </table>
          </div>

          <div style="background: rgba(16, 185, 129, 0.06); border: 1px solid rgba(16, 185, 129, 0.25); border-radius: 12px; padding: 20px; margin-bottom: 24px;">
            <p style="margin: 0 0 8px 0; color: #94a3b8; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">
              🔐 Temporary Password
            </p>
            <p style="margin: 0; font-size: 28px; font-weight: 800; color: #10b981; letter-spacing: 2px; font-family: monospace; background: #0f172a; padding: 12px 16px; border-radius: 8px; text-align: center;">
              ${temporaryPassword}
            </p>
          </div>

          <div style="background: rgba(239, 68, 68, 0.05); border-left: 4px solid #ef4444; border-radius: 4px; padding: 16px; margin: 24px 0;">
            <p style="color: #f8fafc; font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; margin: 0 0 8px 0;">
              ⚠️ Important Security Notice
            </p>
            <ul style="color: #cbd5e1; font-size: 13px; line-height: 1.6; margin: 0; padding-left: 20px;">
              <li>This password is temporary and expires in 24 hours.</li>
              <li>Please log in immediately and change your password.</li>
              <li>Do NOT share this password with anyone.</li>
            </ul>
          </div>

          <div style="text-align: center; margin: 28px 0;">
            <a href="${loginUrl}" target="_blank" style="display: inline-block; background: #3b82f6; color: #ffffff; text-decoration: none; font-weight: 700; font-size: 14px; padding: 14px 32px; border-radius: 10px;">
              🚀 Login Now
            </a>
          </div>

          <p style="color: #64748b; font-size: 12px; text-align: center; margin: 0 0 20px 0;">
            Or copy this link into your browser:<br/>
            <a href="${loginUrl}" style="color: #3b82f6; word-break: break-all;">${loginUrl}</a>
          </p>

          <p style="color: #cbd5e1; font-size: 14px; line-height: 1.6; margin: 0;">
            If you have any questions, please contact your Super Administrator.<br/><br/>
            Best regards,<br/>
            <strong>WEA IT & HR Team</strong>
          </p>
        </div>
        
        <div style="padding: 16px 32px; border-top: 1px solid #334155; text-align: center;">
          <p style="color: #64748b; font-size: 11px; margin: 0;">
            © ${currentYear} WEA Resource Management System. All rights reserved.
          </p>
        </div>
      </div>
    `),
  };

  return await sendEmail(mailOptions);
};

// ============================================
// OTHER EMAIL FUNCTIONS (same structure)
// ============================================

const sendInterviewEmail = async ({ to, applicantName, position, date, time, interviewer, interviewType, location, notes }) => {
  const mailOptions = {
    from: process.env.SMTP_FROM || '"WEA Resource Management" <noreply@wea.com>',
    to,
    subject: `Interview Invitation - ${position} at WEA`,
    html: getEmailWrapper(`
      <div style="background: #1e293b; border: 1px solid #334155; border-radius: 20px; overflow: hidden;">
        <div style="padding: 32px 32px 24px 32px; text-align: center; border-bottom: 1px solid #334155;">
          <div style="margin-bottom: 16px;">
            ${getLogoHtml()}
          </div>
          <h1 style="font-family: 'Outfit', sans-serif; color: #f8fafc; font-size: 22px; font-weight: 800; letter-spacing: -0.5px; margin: 0 0 4px 0;">
            Interview Invitation
          </h1>
          <p style="color: #94a3b8; font-size: 13px; font-weight: 500; margin: 0; text-transform: uppercase; letter-spacing: 0.5px;">
            WEA Resource Management System
          </p>
        </div>
        <div style="padding: 32px;">
          <p style="color: #cbd5e1; font-size: 14px; line-height: 1.6; margin: 0 0 20px 0;">
            Dear ${applicantName},<br/><br/>
            We are pleased to invite you for an interview for the <strong>${position}</strong> position.
          </p>
          <div style="background: rgba(255,255,255,0.03); border: 1px solid #334155; border-radius: 12px; padding: 16px; margin-bottom: 20px;">
            <p style="margin: 4px 0; color: #cbd5e1; font-size: 13px;"><strong>Date:</strong> ${date}</p>
            <p style="margin: 4px 0; color: #cbd5e1; font-size: 13px;"><strong>Time:</strong> ${time}</p>
            <p style="margin: 4px 0; color: #cbd5e1; font-size: 13px;"><strong>Interviewer:</strong> ${interviewer}</p>
            <p style="margin: 4px 0; color: #cbd5e1; font-size: 13px;"><strong>Type:</strong> ${interviewType}</p>
            <p style="margin: 4px 0; color: #cbd5e1; font-size: 13px;"><strong>Location:</strong> ${location}</p>
            ${notes ? `<p style="margin: 4px 0; color: #cbd5e1; font-size: 13px;"><strong>Additional Notes:</strong> ${notes}</p>` : ''}
          </div>
          <p style="color: #cbd5e1; font-size: 14px; line-height: 1.6; margin: 0;">
            Please confirm your attendance by replying to this email.<br/><br/>
            Best regards,<br/>
            WEA HR Team
          </p>
        </div>
      </div>
    `),
  };

  return await sendEmail(mailOptions);
};

const sendOnboardingOfferEmail = async ({
  to,
  applicantName,
  position,
  salary,
  benefits,
  employmentType,
  startDate,
  workLocation,
  workingHours,
  conditions,
  instructions,
  subject,
  customMessage,
}) => {
  const formattedSalary = salary ? (typeof salary === 'number' ? `₱${salary.toLocaleString()}/month` : salary) : 'As agreed upon';
  const mailSubject = subject || `Job Offer: ${position} - WEA Resource Management System`;

  const mailOptions = {
    from: process.env.SMTP_FROM || '"WEA Resource Management" <noreply@wea.com>',
    to,
    subject: mailSubject,
    html: getEmailWrapper(`
      <div style="background: #1e293b; border: 1px solid #334155; border-radius: 20px; overflow: hidden;">
        <div style="padding: 32px; text-align: center; border-bottom: 1px solid #334155;">
          <div style="margin-bottom: 16px;">
            ${getLogoHtml()}
          </div>
          <h1 style="font-family: 'Outfit', sans-serif; color: #10b981; font-size: 24px; font-weight: 800; margin: 0 0 4px 0;">
            Official Job Offer 🎉
          </h1>
          <p style="color: #94a3b8; font-size: 13px; font-weight: 500; margin: 0; text-transform: uppercase; letter-spacing: 0.5px;">
            WEA Resource Management System
          </p>
        </div>
        <div style="padding: 32px;">
          <p style="color: #cbd5e1; font-size: 14px; line-height: 1.6; margin: 0 0 20px 0;">
            Dear <strong>${applicantName}</strong>,<br/><br/>
            ${customMessage || `We are pleased to extend this formal offer of employment for the position of <strong>${position}</strong> at WEA Resource Management System.`}
          </p>
          <div style="background: rgba(16, 185, 129, 0.06); border: 1px solid rgba(16, 185, 129, 0.25); border-radius: 14px; padding: 20px; margin-bottom: 24px;">
            <h3 style="color: #f8fafc; font-size: 15px; font-weight: 700; margin: 0 0 16px 0; border-bottom: 1px dashed rgba(255,255,255,0.1); padding-bottom: 8px;">
              📋 Summary of Offer Terms
            </h3>
            <table style="width: 100%; border-collapse: collapse; color: #cbd5e1; font-size: 13px;">
              <tr><td style="padding: 6px 0; font-weight: 600; width: 40%;">Job Title:</td><td>${position}</td></tr>
              <tr><td style="padding: 6px 0; font-weight: 600;">Compensation:</td><td>${formattedSalary}</td></tr>
              <tr><td style="padding: 6px 0; font-weight: 600;">Employment Type:</td><td>${employmentType || 'Full-time'}</td></tr>
              <tr><td style="padding: 6px 0; font-weight: 600;">Start Date:</td><td>${startDate || 'To be scheduled'}</td></tr>
              <tr><td style="padding: 6px 0; font-weight: 600;">Work Setup / Location:</td><td>${workLocation || 'Office Main Headquarters'}</td></tr>
              <tr><td style="padding: 6px 0; font-weight: 600;">Working Hours:</td><td>${workingHours || '8:00 AM - 5:00 PM (Mon-Fri)'}</td></tr>
              ${benefits ? `<tr><td style="padding: 6px 0; font-weight: 600;">Benefits:</td><td>${benefits}</td></tr>` : ''}
              ${conditions ? `<tr><td style="padding: 6px 0; font-weight: 600;">Conditions:</td><td>${conditions}</td></tr>` : ''}
            </table>
          </div>
          ${instructions ? `
          <div style="background: rgba(255,255,255,0.03); border: 1px solid #334155; border-radius: 12px; padding: 16px; margin-bottom: 24px;">
            <h4 style="color: #f8fafc; font-size: 14px; margin: 0 0 8px 0;">📌 Instructions for Accepting this Offer</h4>
            <p style="color: #cbd5e1; font-size: 13px; margin: 0; line-height: 1.5;">${instructions}</p>
          </div>
          ` : ''}
          <p style="color: #cbd5e1; font-size: 14px; line-height: 1.6; margin: 0;">
            Sincerely,<br/>
            <strong>WEA HR & Recruitment Team</strong>
          </p>
        </div>
      </div>
    `),
  };

  return await sendEmail(mailOptions);
};

const sendRejectionEmail = async ({ to, applicantName, position, reason }) => {
  const mailOptions = {
    from: process.env.SMTP_FROM || '"WEA Resource Management" <noreply@wea.com>',
    to,
    subject: `Application Update - ${position} at WEA`,
    html: getEmailWrapper(`
      <div style="background: #1e293b; border: 1px solid #334155; border-radius: 20px; overflow: hidden;">
        <div style="padding: 32px 32px 24px 32px; text-align: center; border-bottom: 1px solid #334155;">
          <div style="margin-bottom: 16px;">
            ${getLogoHtml()}
          </div>
          <h1 style="font-family: 'Outfit', sans-serif; color: #f8fafc; font-size: 22px; font-weight: 800; letter-spacing: -0.5px; margin: 0 0 4px 0;">
            Application Update
          </h1>
          <p style="color: #94a3b8; font-size: 13px; font-weight: 500; margin: 0; text-transform: uppercase; letter-spacing: 0.5px;">
            WEA Resource Management System
          </p>
        </div>
        <div style="padding: 32px;">
          <p style="color: #cbd5e1; font-size: 14px; line-height: 1.6; margin: 0 0 20px 0;">
            Dear ${applicantName},<br/><br/>
            Thank you for your interest in the <strong>${position}</strong> position at WEA. We appreciate the time you took to apply and share your experience with us.
          </p>
          <p style="color: #cbd5e1; font-size: 14px; line-height: 1.6; margin: 0 0 20px 0;">
            After careful review of your application and qualifications, we regret to inform you that we have decided to move forward with other candidates whose experience more closely aligns with the requirements of this role.
          </p>
          ${reason ? `
          <div style="background: rgba(239, 68, 68, 0.05); border-left: 4px solid #ef4444; border-radius: 4px; padding: 16px; margin: 24px 0;">
            <p style="color: #f8fafc; font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; margin: 0 0 8px 0;">
              Feedback from HR Team:
            </p>
            <p style="color: #cbd5e1; font-size: 14px; line-height: 1.6; margin: 0; font-style: italic;">
              "${reason}"
            </p>
          </div>
          ` : ''}
          <p style="color: #cbd5e1; font-size: 14px; line-height: 1.6; margin: 0 0 20px 0;">
            We were very impressed by your background, and we will keep your resume in our database for future opportunities that may fit your skills.
          </p>
          <p style="color: #cbd5e1; font-size: 14px; line-height: 1.6; margin: 0;">
            Thank you again for your time, and we wish you the best of luck in your job search.<br/><br/>
            Best regards,<br/>
            WEA HR & Recruitment Team
          </p>
        </div>
      </div>
    `),
  };

  return await sendEmail(mailOptions);
};

const sendFeedbackRequestEmail = async ({
  to,
  clientName,
  projectName,
  employeeNames = [],
  introMessage,
  feedbackLink,
  expiresAt,
}) => {
  const expiryText = expiresAt
    ? new Date(expiresAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
    : null;

  const defaultIntro = `We hope you've been satisfied with the progress of <strong>${projectName}</strong>. We'd love to hear your feedback on the team members who worked on it.`;

  const mailOptions = {
    from: process.env.SMTP_FROM || '"WEA Resource Management" <noreply@wea.com>',
    to,
    subject: `We'd love your feedback - ${projectName} at WEA`,
    html: getEmailWrapper(`
      <div style="background: #1e293b; border: 1px solid #334155; border-radius: 20px; overflow: hidden;">
        <div style="padding: 32px 32px 24px 32px; text-align: center; border-bottom: 1px solid #334155;">
          <div style="margin-bottom: 16px;">
            ${getLogoHtml()}
          </div>
          <h1 style="font-family: 'Outfit', sans-serif; color: #f8fafc; font-size: 22px; font-weight: 800; letter-spacing: -0.5px; margin: 0 0 4px 0;">
            We'd Love Your Feedback
          </h1>
          <p style="color: #94a3b8; font-size: 13px; font-weight: 500; margin: 0; text-transform: uppercase; letter-spacing: 0.5px;">
            WEA Resource Management System
          </p>
        </div>
        <div style="padding: 32px;">
          <p style="color: #cbd5e1; font-size: 14px; line-height: 1.6; margin: 0 0 20px 0;">
            Dear ${clientName},<br/><br/>
            ${introMessage ? introMessage.replace(/\n/g, '<br/>') : defaultIntro}
          </p>
          ${employeeNames.length ? `
          <div style="background: rgba(255,255,255,0.03); border: 1px solid #334155; border-radius: 12px; padding: 16px; margin-bottom: 24px;">
            <p style="margin: 0 0 8px 0; color: #94a3b8; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">Team members on this project</p>
            <p style="margin: 0; color: #f8fafc; font-size: 14px;">${employeeNames.join(', ')}</p>
          </div>
          ` : ''}
          <div style="text-align: center; margin: 28px 0;">
            <a href="${feedbackLink}" style="display: inline-block; background: #3b82f6; color: #ffffff; text-decoration: none; font-weight: 700; font-size: 14px; padding: 14px 32px; border-radius: 10px;">
              Share Your Feedback
            </a>
          </div>
          <p style="color: #64748b; font-size: 12px; line-height: 1.6; margin: 0 0 20px 0; text-align: center;">
            Or copy this link into your browser:<br/>
            <a href="${feedbackLink}" style="color: #3b82f6; word-break: break-all;">${feedbackLink}</a>
          </p>
          ${expiryText ? `<p style="color: #64748b; font-size: 12px; margin: 0 0 20px 0; text-align: center;">This link expires on ${expiryText}.</p>` : ''}
          <p style="color: #cbd5e1; font-size: 14px; line-height: 1.6; margin: 0;">
            Your feedback helps us improve our services and helps the team grow.<br/><br/>
            Best regards,<br/>
            WEA Project Management Team
          </p>
        </div>
      </div>
    `),
  };

  return await sendEmail(mailOptions);
};

module.exports = {
  sendEmail,
  getLogoHtml,
  sendInterviewEmail,
  sendOnboardingOfferEmail,
  sendRejectionEmail,
  sendFeedbackRequestEmail,
  sendAdminWelcomeEmail,
};