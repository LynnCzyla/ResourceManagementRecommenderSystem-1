// backend/routes/cvTemplate.js
const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const supabase = require('../supabase');
const { verifyToken } = require('./Middleware/auth');
const { requireRole } = require('./Middleware/roleGuard');

const BUCKET = 'cv-templates';
const FOLDER = 'current';
const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

// Multer memory storage with 5 MB limit
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_SIZE_BYTES }
});

// Helper: list files in current/
async function listCurrentFiles() {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .list(FOLDER);

  if (error) {
    console.error('❌ Supabase storage list error:', error);
    throw error;
  }

  return (data || []).filter(
    (item) => item.name && item.name !== '.emptyFolderPlaceholder'
  );
}

// Helper: delete everything in current/
async function deleteAllInCurrent() {
  const files = await listCurrentFiles();
  if (files && files.length > 0) {
    const filePaths = files.map((f) => `${FOLDER}/${f.name}`);
    const { error } = await supabase.storage
      .from(BUCKET)
      .remove(filePaths);
    if (error) {
      console.error('❌ Supabase storage remove error:', error);
      throw error;
    }
  }
}

// ============================================================
// GET /api/cv-template (HR + applicant)
// Lists "current/". If empty, return null.
// Otherwise return file name, upload date, view signed URL & download signed URL (60 min).
// ============================================================
router.get('/', async (req, res) => {
  try {
    const files = await listCurrentFiles();

    if (!files || files.length === 0) {
      return res.json({
        success: true,
        data: null,
        message: 'No CV template available yet.'
      });
    }

    const currentFile = files[0];
    const fullPath = `${FOLDER}/${currentFile.name}`;

    // 60-minute signed URL for preview/view
    const { data: viewData, error: viewErr } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(fullPath, 3600);

    if (viewErr) throw viewErr;

    // 60-minute signed URL with download flag
    const { data: downloadData, error: dlErr } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(fullPath, 3600, { download: currentFile.name });

    if (dlErr) throw dlErr;

    return res.json({
      success: true,
      data: {
        file_name: currentFile.name,
        uploaded_at: currentFile.created_at || currentFile.updated_at || new Date().toISOString(),
        size: currentFile.metadata?.size || null,
        view_url: viewData.signedUrl,
        download_url: downloadData.signedUrl
      }
    });
  } catch (err) {
    console.error('❌ Error in GET /api/cv-template:', err);
    return res.status(500).json({
      success: false,
      error: 'Failed to retrieve CV template',
      message: err.message
    });
  }
});

// ============================================================
// POST /api/cv-template (HR only)
// Validate type (PDF/DOCX) and size (<=5MB), delete current/, upload new file
// ============================================================
router.post(
  '/',
  verifyToken,
  requireRole(['Human Resources', 'HR', 'Admin', 'Super Admin']),
  (req, res, next) => {
    upload.single('template')(req, res, (err) => {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({
            success: false,
            message: 'File size exceeds the 5 MB limit.'
          });
        }
        return res.status(400).json({ success: false, message: err.message });
      } else if (err) {
        return res.status(400).json({ success: false, message: err.message });
      }
      next();
    });
  },
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: 'No file provided. Please choose a PDF or DOCX file.'
        });
      }

      const originalName = req.file.originalname || '';
      const ext = path.extname(originalName).toLowerCase();
      const mime = req.file.mimetype || '';

      const isPdf = ext === '.pdf' || mime === 'application/pdf';
      const isDocx =
        ext === '.docx' ||
        mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
        mime === 'application/msword';

      if (!isPdf && !isDocx) {
        return res.status(400).json({
          success: false,
          message: 'Invalid file format. Only PDF and DOCX files are allowed.'
        });
      }

      if (req.file.size > MAX_SIZE_BYTES) {
        return res.status(400).json({
          success: false,
          message: 'File exceeds 5 MB limit.'
        });
      }

      // Delete everything inside current/
      await deleteAllInCurrent();

      // Clean filename to prevent storage path issues
      const cleanFileName = originalName.replace(/[^a-zA-Z0-9._-]/g, '_');
      const targetPath = `${FOLDER}/${cleanFileName}`;

      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(targetPath, req.file.buffer, {
          contentType: mime || (isPdf ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'),
          upsert: true
        });

      if (uploadError) {
        console.error('❌ Supabase storage upload error:', uploadError);
        throw uploadError;
      }

      // Generate signed URLs (60 min)
      const { data: viewData, error: viewErr } = await supabase.storage
        .from(BUCKET)
        .createSignedUrl(targetPath, 3600);
      if (viewErr) throw viewErr;

      const { data: downloadData, error: dlErr } = await supabase.storage
        .from(BUCKET)
        .createSignedUrl(targetPath, 3600, { download: cleanFileName });
      if (dlErr) throw dlErr;

      return res.json({
        success: true,
        message: 'CV template uploaded successfully.',
        data: {
          file_name: cleanFileName,
          uploaded_at: new Date().toISOString(),
          size: req.file.size,
          view_url: viewData.signedUrl,
          download_url: downloadData.signedUrl
        }
      });
    } catch (err) {
      console.error('❌ Error in POST /api/cv-template:', err);
      return res.status(500).json({
        success: false,
        error: 'Failed to upload CV template',
        message: err.message
      });
    }
  }
);

// ============================================================
// DELETE /api/cv-template (HR only)
// Delete everything inside "current/"
// ============================================================
router.delete(
  '/',
  verifyToken,
  requireRole(['Human Resources', 'HR', 'Admin', 'Super Admin']),
  async (req, res) => {
    try {
      await deleteAllInCurrent();

      return res.json({
        success: true,
        message: 'CV template removed successfully.'
      });
    } catch (err) {
      console.error('❌ Error in DELETE /api/cv-template:', err);
      return res.status(500).json({
        success: false,
        error: 'Failed to remove CV template',
        message: err.message
      });
    }
  }
);

module.exports = router;
