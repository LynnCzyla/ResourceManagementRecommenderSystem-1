// backend/routes/Public/jobOfferPublic.js
//
// Public, unauthenticated routes for applicant job offer decision (Accept / Decline).
// Validates 14-day signed JWT tokens and records responses in the database.
const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const supabase = require('../../supabase');
const { logAuditEvent } = require('../../utils/auditLogger');

const getJwtSecret = () => process.env.SUPABASE_JWT_SECRET || process.env.JWT_SECRET || 'wea-job-offer-secret-key-2026';

// GET /api/public/offer/:token — View job offer details
router.get('/offer/:token', async (req, res) => {
  try {
    const { token } = req.params;
    if (!token) {
      return res.status(400).json({ success: false, error: 'Token is required', code: 'MISSING_TOKEN' });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, getJwtSecret());
    } catch (jwtErr) {
      if (jwtErr.name === 'TokenExpiredError') {
        return res.status(410).json({
          success: false,
          error: 'This job offer link was valid for 14 days and has expired. Please contact the HR office.',
          code: 'EXPIRED'
        });
      }
      return res.status(400).json({
        success: false,
        error: 'Invalid or corrupted offer link. Please contact the HR office.',
        code: 'INVALID'
      });
    }

    const { hiredEmployeeId, applicationId } = decoded;

    // Fetch latest employee and application details from DB
    const { data: emp } = await supabase
      .from('hired_employees')
      .select('*')
      .eq('id', hiredEmployeeId)
      .maybeSingle();

    const appId = applicationId || emp?.application_id;
    let appData = null;
    if (appId) {
      const { data } = await supabase
        .from('job_applications')
        .select(`
          notes,
          position_applied,
          department,
          branch_id,
          branches:branch_id (
            name,
            location,
            currency_code
          )
        `)
        .eq('id', appId)
        .maybeSingle();
      appData = data;
    }

    const notesStr = appData?.notes || '';
    const isAccepted = notesStr.includes('OFFER_ACCEPTED') || emp?.status === 'Offer Accepted';
    const isDeclined = notesStr.includes('OFFER_DECLINED') || (emp?.status === 'Inactive' && notesStr.includes('OFFER_DECLINED'));
    const alreadyResponded = isAccepted || isDeclined;
    const currentStatus = isAccepted ? 'Offer Accepted' : isDeclined ? 'Offer Declined' : 'Pending';

    res.json({
      success: true,
      data: {
        applicantName: decoded.applicantName || emp?.name || 'Applicant',
        email: decoded.email || emp?.email,
        position: decoded.position || appData?.position_applied || 'Position Offered',
        department: appData?.department || 'N/A',
        branchName: appData?.branches?.name || 'WEA Headquarters',
        salary: decoded.salary ?? emp?.salary,
        currency: decoded.currency || appData?.branches?.currency_code || 'PHP',
        employmentType: decoded.employmentType || 'Full-time',
        startDate: decoded.startDate || emp?.hire_date || null,
        workLocation: decoded.workLocation || appData?.branches?.location || 'Office Main Headquarters',
        workingHours: decoded.workingHours || '8:00 AM - 5:00 PM (Mon-Fri)',
        benefits: decoded.benefits || null,
        conditions: decoded.conditions || null,
        instructions: decoded.instructions || null,
        expiresAt: new Date(decoded.exp * 1000).toISOString(),
        alreadyResponded,
        status: currentStatus,
      }
    });
  } catch (error) {
    console.error('Error fetching job offer details:', error);
    res.status(500).json({ success: false, error: 'Failed to retrieve offer details.' });
  }
});

// POST /api/public/offer/:token/respond — Submit decision (Accept or Decline)
router.post('/offer/:token/respond', async (req, res) => {
  try {
    const { token } = req.params;
    const { decision, reason } = req.body;

    if (!token) {
      return res.status(400).json({ success: false, error: 'Token is required' });
    }

    if (decision !== 'accept' && decision !== 'decline') {
      return res.status(400).json({ success: false, error: 'Decision must be either "accept" or "decline"' });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, getJwtSecret());
    } catch (jwtErr) {
      if (jwtErr.name === 'TokenExpiredError') {
        return res.status(410).json({
          success: false,
          error: 'This job offer link was valid for 14 days and has expired. Please contact the HR office.',
          code: 'EXPIRED'
        });
      }
      return res.status(400).json({
        success: false,
        error: 'Invalid or expired offer link. Please contact the HR office.',
        code: 'INVALID'
      });
    }

    const { hiredEmployeeId, applicationId, applicantName, position, branchId } = decoded;

    // Fetch employee and application records
    const { data: emp, error: empErr } = await supabase
      .from('hired_employees')
      .select('*')
      .eq('id', hiredEmployeeId)
      .maybeSingle();

    if (empErr || !emp) {
      return res.status(404).json({ success: false, error: 'Employee offer record not found.' });
    }

    const appId = applicationId || emp.application_id;
    let appData = null;
    let existingNotes = '';
    if (appId) {
      const { data } = await supabase
        .from('job_applications')
        .select('id, notes, branch_id, position_applied, job_posting_id')
        .eq('id', appId)
        .maybeSingle();
      appData = data;
      existingNotes = data?.notes || '';
    }

    // ENFORCE: Only one answer is allowed!
    const isAlreadyAccepted = existingNotes.includes('OFFER_ACCEPTED');
    const isAlreadyDeclined = existingNotes.includes('OFFER_DECLINED');
    if (isAlreadyAccepted || isAlreadyDeclined) {
      return res.status(400).json({
        success: false,
        error: 'You have already submitted an answer for this job offer. Only one response is allowed.',
        alreadyResponded: true,
        status: isAlreadyAccepted ? 'Offer Accepted' : 'Offer Declined'
      });
    }

    const resolvedName = applicantName || emp.name;
    const resolvedPosition = position || appData?.position_applied || 'Position';
    const targetBranchId = branchId || appData?.branch_id;

    if (decision === 'accept') {
      // 1. Update application notes with OFFER_ACCEPTED
      if (appId) {
        let updatedNotes = existingNotes;
        if (!updatedNotes.includes('OFFER_SENT')) {
          updatedNotes = `${updatedNotes} OFFER_SENT`.trim();
        }
        updatedNotes = `${updatedNotes} OFFER_ACCEPTED`.trim();
        await supabase
          .from('job_applications')
          .update({ notes: updatedNotes })
          .eq('id', appId);
      }

      // 2. Update hired_employees status to Active
      await supabase
        .from('hired_employees')
        .update({ status: 'Active' })
        .eq('id', hiredEmployeeId);

      // Close the posting only after an offer is accepted, not when HR creates the offer.
      if (appData?.job_posting_id) {
        const { data: posting } = await supabase
          .from('job_postings')
          .select('id, status, description, source_request_id, hr_resource_requests:source_request_id(quantity_needed)')
          .eq('id', appData.job_posting_id)
          .maybeSingle();
        const { count: acceptedCount } = await supabase
          .from('job_applications')
          .select('id', { count: 'exact', head: true })
          .eq('job_posting_id', appData.job_posting_id)
          .eq('status', 'Hired')
          .ilike('notes', '%OFFER_ACCEPTED%');
        const vacancyMatch = posting?.description?.match(/\[VACANCY:\s*(\d+)\]/i);
        const quantity = Number(posting?.hr_resource_requests?.quantity_needed)
          || (vacancyMatch ? Number(vacancyMatch[1]) : 1);
        if (posting?.status === 'Active' && (acceptedCount || 0) >= quantity) {
          await supabase.from('job_postings').update({ status: 'Closed' }).eq('id', posting.id);
        }
      }

      // 3. Notify Admins and Super Admins
      try {
        const { data: admins } = await supabase
          .from('profiles')
          .select('id')
          .in('role', ['Administrator', 'Super Admin'])
          .eq('status', 'Active');

        if (admins && admins.length > 0) {
          const adminNotifs = admins.map(adm => ({
            recipient_id: adm.id,
            type: 'info',
            text: `🎉 Candidate ${resolvedName} has accepted the job offer for ${resolvedPosition}. Ready for account creation in User Management.`,
            read: false,
          }));
          await supabase.from('notifications').insert(adminNotifs);
        }
      } catch (adminNotifErr) {
        console.error('Failed to notify admins of offer acceptance:', adminNotifErr);
      }

      // 4. Notify Branch HR
      try {
        let hrQuery = supabase.from('profiles').select('id').eq('role', 'Human Resources').eq('status', 'Active');
        if (targetBranchId) {
          hrQuery = hrQuery.eq('branch_id', targetBranchId);
        }
        const { data: hrUsers } = await hrQuery;
        if (hrUsers && hrUsers.length > 0) {
          const hrNotifs = hrUsers.map(hr => ({
            recipient_id: hr.id,
            type: 'info',
            text: `🎉 Candidate ${resolvedName} has accepted the job offer for ${resolvedPosition}.`,
            read: false,
          }));
          await supabase.from('notifications').insert(hrNotifs);
        }
      } catch (hrNotifErr) {
        console.error('Failed to notify branch HR of offer acceptance:', hrNotifErr);
      }

      // 5. Audit log
      try {
        await logAuditEvent({
          req,
          action: 'Updated',
          systemCategory: 'HR - Hired Employees',
          logDescription: `Applicant ${resolvedName} formally accepted job offer for ${resolvedPosition} via portal link`,
        });
      } catch (logErr) {
        console.warn('Audit log error on offer acceptance:', logErr.message);
      }

      return res.status(200).json({
        success: true,
        message: 'Job offer formally accepted! Welcome to the WEA team.',
        decision: 'accept',
        status: 'Offer Accepted'
      });
    } else {
      // DECISION: DECLINE
      // 1. Update application notes with OFFER_DECLINED
      if (appId) {
        let updatedNotes = existingNotes;
        if (!updatedNotes.includes('OFFER_SENT')) {
          updatedNotes = `${updatedNotes} OFFER_SENT`.trim();
        }
        updatedNotes = `${updatedNotes} OFFER_DECLINED`.trim();
        if (reason) {
          updatedNotes = `${updatedNotes} (Reason: ${reason})`.trim();
        }
        await supabase
          .from('job_applications')
          .update({ notes: updatedNotes })
          .eq('id', appId);
      }

      // 2. Move to Archived by setting hired_employees status to Inactive
      await supabase
        .from('hired_employees')
        .update({ status: 'Inactive' })
        .eq('id', hiredEmployeeId);

      // 3. Notify the branch HR
      try {
        let hrQuery = supabase.from('profiles').select('id').eq('role', 'Human Resources').eq('status', 'Active');
        if (targetBranchId) {
          hrQuery = hrQuery.eq('branch_id', targetBranchId);
        }
        const { data: hrUsers } = await hrQuery;
        if (hrUsers && hrUsers.length > 0) {
          const hrNotifs = hrUsers.map(hr => ({
            recipient_id: hr.id,
            type: 'alert',
            text: `⚠️ Candidate ${resolvedName} has declined the job offer for ${resolvedPosition}. Record moved to Archived.`,
            read: false,
          }));
          await supabase.from('notifications').insert(hrNotifs);
        }
      } catch (hrNotifErr) {
        console.error('Failed to notify branch HR of offer decline:', hrNotifErr);
      }

      // 4. Audit log
      try {
        await logAuditEvent({
          req,
          action: 'Updated',
          systemCategory: 'HR - Hired Employees',
          logDescription: `Applicant ${resolvedName} declined job offer for ${resolvedPosition} via portal link${reason ? ` (Reason: ${reason})` : ''}`,
        });
      } catch (logErr) {
        console.warn('Audit log error on offer decline:', logErr.message);
      }

      return res.status(200).json({
        success: true,
        message: 'Job offer declined. Thank you for notifying us.',
        decision: 'decline',
        status: 'Offer Declined'
      });
    }
  } catch (error) {
    console.error('Error recording offer response:', error);
    res.status(500).json({ success: false, error: 'Failed to record response. Please try again.' });
  }
});

module.exports = router;
