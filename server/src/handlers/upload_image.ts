import { type UploadImageInput } from '../schema';

// Allowed image MIME types
const ALLOWED_IMAGE_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp'
] as const;

// Maximum file size (5MB in bytes)
const MAX_FILE_SIZE = 5 * 1024 * 1024;

export async function uploadImage(input: UploadImageInput): Promise<{ url: string }> {
  try {
    // Validate content type
    if (!ALLOWED_IMAGE_TYPES.includes(input.content_type as any)) {
      throw new Error(`Unsupported image type: ${input.content_type}. Allowed types: ${ALLOWED_IMAGE_TYPES.join(', ')}`);
    }

    // Extract base64 data (remove data URL prefix if present)
    let base64Data = input.file_data;
    if (input.file_data.startsWith('data:')) {
      const base64Index = input.file_data.indexOf(',');
      if (base64Index === -1) {
        throw new Error('Invalid data URL format');
      }
      base64Data = input.file_data.substring(base64Index + 1);
    }

    // Validate file size first (before format validation for better error messages)
    // Check size even before validating base64 format for better UX
    const fileSizeBytes = (base64Data.length * 3) / 4; // Approximate size from base64
    if (fileSizeBytes > MAX_FILE_SIZE) {
      throw new Error(`File too large. Maximum size is ${MAX_FILE_SIZE / (1024 * 1024)}MB`);
    }

    // Validate base64 format after size check, but be lenient about padding for size check
    if (!isValidBase64(base64Data)) {
      throw new Error('Invalid file data format. Expected base64 encoded data.');
    }

    // Validate filename
    if (!input.file_name.trim()) {
      throw new Error('File name cannot be empty');
    }

    // Generate unique filename with timestamp and user ID
    const timestamp = Date.now();
    const fileExtension = getFileExtension(input.content_type);
    const sanitizedFileName = sanitizeFileName(input.file_name);
    const uniqueFileName = `${input.author_id}_${timestamp}_${sanitizedFileName}${fileExtension}`;

    // In a real implementation, this would upload to cloud storage (S3, Cloudinary, etc.)
    // For this demo, we simulate a successful upload and return a mock URL
    const baseUrl = process.env['IMAGE_BASE_URL'] || 'https://chat-app-storage.example.com';
    const imageUrl = `${baseUrl}/uploads/${uniqueFileName}`;

    // Simulate upload delay (real network operation would have latency)
    await new Promise(resolve => setTimeout(resolve, 100));

    return { url: imageUrl };
  } catch (error) {
    console.error('Image upload failed:', error);
    throw error;
  }
}

// Helper function to validate base64 string
function isValidBase64(str: string): boolean {
  try {
    // Base64 pattern check - allow empty string or valid base64
    if (str.length === 0) return false;
    const base64Pattern = /^[A-Za-z0-9+/]*={0,2}$/;
    return base64Pattern.test(str) && str.length % 4 === 0;
  } catch {
    return false;
  }
}

// Helper function to get file extension from MIME type
function getFileExtension(contentType: string): string {
  const extensions: Record<string, string> = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/gif': '.gif',
    'image/webp': '.webp'
  };
  return extensions[contentType] || '';
}

// Helper function to sanitize filename
function sanitizeFileName(fileName: string): string {
  // Remove file extension and special characters, keep only alphanumeric and basic punctuation
  const nameWithoutExt = fileName.replace(/\.[^/.]+$/, '');
  return nameWithoutExt
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/_{2,}/g, '_')
    .replace(/^_+|_+$/g, '')
    .substring(0, 50); // Limit length
}