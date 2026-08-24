// backend/utils/mailer.js
// Shared nodemailer transporter so every route (forgotPassword, interviews,
// etc.) sends real emails automatically instead of opening a mail client.
const nodemailer = require("nodemailer");
const path = require("path");

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: process.env.SMTP_PORT || 587,
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

const getLogoAttachment = () => ({
  filename: 'WEA_logo_bgremoved.png',
  path: path.join(__dirname, '../../main/src/assets/WEA_logo_bgremoved.png'),
  cid: 'wealogo'
});

const sendInterviewEmail = async ({ to, applicantName, position, date, time, interviewer, interviewType, location, notes }) => {
  const mailOptions = {
    from: process.env.SMTP_FROM || '"WEA Resource Management" <noreply@wea.com>',
    to,
    subject: `Interview Invitation - ${position} at WEA`,
    html: `
      <div style="font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 32px 16px; background-color: #0f172a;">
        <div style="background: #1e293b; border: 1px solid #334155; border-radius: 20px; overflow: hidden;">
          <div style="padding: 32px 32px 24px 32px; text-align: center; border-bottom: 1px solid #334155;">
            <div style="margin-bottom: 16px;">
              <img src="cid:wealogo" alt="WEA Logo" style="height: 65px; object-fit: contain;" />
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
      </div>
    `,
    attachments: [getLogoAttachment()]
  };

  await transporter.sendMail(mailOptions);
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
    html: `
      <div style="font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 650px; margin: 0 auto; padding: 32px 16px; background-color: #0f172a;">
        <div style="background: #1e293b; border: 1px solid #334155; border-radius: 20px; overflow: hidden;">
          <div style="padding: 32px; text-align: center; border-bottom: 1px solid #334155;">
            <div style="margin-bottom: 16px;">
              <img src="cid:wealogo" alt="WEA Logo" style="height: 65px; object-fit: contain;" />
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
      </div>
    `,
    attachments: [getLogoAttachment()]
  };

  await transporter.sendMail(mailOptions);
};

const sendRejectionEmail = async ({ to, applicantName, position, reason }) => {
  const mailOptions = {
    from: process.env.SMTP_FROM || '"WEA Resource Management" <noreply@wea.com>',
    to,
    subject: `Application Update - ${position} at WEA`,
    html: `
      <div style="font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 32px 16px; background-color: #0f172a;">
        <div style="background: #1e293b; border: 1px solid #334155; border-radius: 20px; overflow: hidden;">
          <div style="padding: 32px 32px 24px 32px; text-align: center; border-bottom: 1px solid #334155;">
            <div style="margin-bottom: 16px;">
              <img src="cid:wealogo" alt="WEA Logo" style="height: 65px; object-fit: contain;" />
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
      </div>
    `,
    attachments: [getLogoAttachment()]
  };

  await transporter.sendMail(mailOptions);
};

// Sent to the CLIENT when a PM sends out a project feedback request.
// Mirrors the look of sendInterviewEmail/sendOnboardingOfferEmail (same
// dark card, logo via cid, WEA branding) so all outbound mail looks
// consistent, but the CTA is a button linking to the public,
// no-login feedback form at APP_URL/feedback/:token.
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
    html: `
      <div style="font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 32px 16px; background-color: #0f172a;">
        <div style="background: #1e293b; border: 1px solid #334155; border-radius: 20px; overflow: hidden;">
          <div style="padding: 32px 32px 24px 32px; text-align: center; border-bottom: 1px solid #334155;">
            <div style="margin-bottom: 16px;">
              <img src="cid:wealogo" alt="WEA Logo" style="height: 65px; object-fit: contain;" />
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
              <a href="${feedbackLink}" style="display: inline-block; background: var(--wea-accent, #3b82f6); background-color: #3b82f6; color: #ffffff; text-decoration: none; font-weight: 700; font-size: 14px; padding: 14px 32px; border-radius: 10px;">
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
      </div>
    `,
    attachments: [getLogoAttachment()]
  };

  await transporter.sendMail(mailOptions);
};

module.exports = { transporter, sendInterviewEmail, sendOnboardingOfferEmail, sendRejectionEmail, sendFeedbackRequestEmail };