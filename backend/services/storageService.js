const supabase = require('../supabase');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

class StorageService {
    constructor() {
        this.bucketName = process.env.SUPABASE_BUCKET || 'documents';
        this.ensureBucket();
    }

    async ensureBucket() {
        try {
            // Check if bucket exists
            const { data: buckets, error } = await supabase
                .storage
                .listBuckets();

            if (error) {
                console.error('Error listing buckets:', error);
                return;
            }

            const bucketExists = buckets.some(b => b.name === this.bucketName);
            
            if (!bucketExists) {
                // Create bucket if it doesn't exist
                const { error: createError } = await supabase
                    .storage
                    .createBucket(this.bucketName, {
                        public: false,
                        allowedMimeTypes: ['image/png', 'image/jpeg', 'image/jpg', 'application/pdf'],
                        fileSizeLimit: 5242880 // 5MB
                    });

                if (createError) {
                    console.error('Error creating bucket:', createError);
                } else {
                    console.log(`✅ Storage bucket '${this.bucketName}' created`);
                }
            } else {
                console.log(`✅ Storage bucket '${this.bucketName}' exists`);
            }
        } catch (error) {
            console.error('Error ensuring bucket:', error);
        }
    }

    async uploadFile(file, employeeId, documentType) {
        try {
            // Generate unique file name
            const fileExt = path.extname(file.originalname);
            const fileName = `${employeeId}/${documentType}/${uuidv4()}${fileExt}`;
            
            // Upload to Supabase Storage
            const { data, error } = await supabase
                .storage
                .from(this.bucketName)
                .upload(fileName, file.buffer, {
                    contentType: file.mimetype,
                    cacheControl: '3600'
                });

            if (error) {
                throw new Error(`Storage upload failed: ${error.message}`);
            }

            // Get public URL (if bucket is public) or signed URL
            const { data: urlData } = supabase
                .storage
                .from(this.bucketName)
                .getPublicUrl(fileName);

            return {
                filePath: fileName,
                publicUrl: urlData.publicUrl,
                fileName: file.originalname,
                fileSize: file.size,
                mimeType: file.mimetype
            };

        } catch (error) {
            console.error('Upload error:', error);
            throw error;
        }
    }

    async deleteFile(filePath) {
        try {
            const { error } = await supabase
                .storage
                .from(this.bucketName)
                .remove([filePath]);

            if (error) {
                console.error('Delete error:', error);
                throw error;
            }

            return true;
        } catch (error) {
            console.error('Delete error:', error);
            throw error;
        }
    }

    async getFileUrl(filePath) {
        try {
            const { data } = supabase
                .storage
                .from(this.bucketName)
                .getPublicUrl(filePath);

            return data.publicUrl;
        } catch (error) {
            console.error('Get URL error:', error);
            throw error;
        }
    }
}

module.exports = new StorageService();