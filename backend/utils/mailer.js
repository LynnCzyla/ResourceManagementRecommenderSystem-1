// backend/utils/mailer.js
// Shared nodemailer transporter so every route (forgotPassword, interviews,
// etc.) sends real emails automatically instead of opening a mail client.
const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: process.env.SMTP_PORT || 587,
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
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
    `
  };

  await transporter.sendMail(mailOptions);
};

module.exports = { transporter, sendInterviewEmail };