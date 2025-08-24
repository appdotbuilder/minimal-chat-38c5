import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { type UploadImageInput } from '../schema';
import { uploadImage } from '../handlers/upload_image';

// Valid base64 image data (1x1 transparent PNG)
const VALID_PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChAI8DdvyogAAAABJRU5ErkJggg==';

// Valid JPEG base64 data (simple valid base64 string)
const VALID_JPEG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChAI8DdvyogAAAABJRU5ErkJggg==';

// Test input template
const createTestInput = (overrides: Partial<UploadImageInput> = {}): UploadImageInput => ({
  file_data: VALID_PNG_BASE64,
  file_name: 'test_image.png',
  content_type: 'image/png',
  author_id: 'test-user-123',
  ...overrides
});

describe('uploadImage', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  it('should successfully upload a valid PNG image', async () => {
    const input = createTestInput();
    const result = await uploadImage(input);

    expect(result.url).toBeDefined();
    expect(result.url).toMatch(/^https?:\/\/.+\/uploads\/.+\.png$/);
    expect(result.url).toContain(input.author_id);
    expect(result.url).toContain('test_image');
  });

  it('should successfully upload a valid JPEG image', async () => {
    const input = createTestInput({
      file_data: VALID_JPEG_BASE64,
      file_name: 'photo.jpeg',
      content_type: 'image/jpeg'
    });
    const result = await uploadImage(input);

    expect(result.url).toBeDefined();
    expect(result.url).toMatch(/^https?:\/\/.+\/uploads\/.+\.jpg$/);
    expect(result.url).toContain('photo');
  });

  it('should handle data URL format', async () => {
    const input = createTestInput({
      file_data: `data:image/png;base64,${VALID_PNG_BASE64}`,
    });
    const result = await uploadImage(input);

    expect(result.url).toBeDefined();
    expect(result.url).toContain(input.author_id);
  });

  it('should generate unique URLs for same file', async () => {
    const input = createTestInput();
    
    const result1 = await uploadImage(input);
    // Add small delay to ensure different timestamps
    await new Promise(resolve => setTimeout(resolve, 10));
    const result2 = await uploadImage(input);

    expect(result1.url).toBeDefined();
    expect(result2.url).toBeDefined();
    expect(result1.url).not.toEqual(result2.url);
  });

  it('should sanitize filename properly', async () => {
    const input = createTestInput({
      file_name: 'test file with spaces & special chars!@#$%^.png'
    });
    const result = await uploadImage(input);

    expect(result.url).toContain('test_file_with_spaces_special_chars');
    expect(result.url).not.toContain('!@#$%^');
  });

  it('should reject unsupported image types', async () => {
    const input = createTestInput({
      content_type: 'image/bmp'
    });

    await expect(uploadImage(input)).rejects.toThrow(/unsupported image type/i);
  });

  it('should reject non-image content types', async () => {
    const input = createTestInput({
      content_type: 'text/plain'
    });

    await expect(uploadImage(input)).rejects.toThrow(/unsupported image type/i);
  });

  it('should reject empty filename', async () => {
    const input = createTestInput({
      file_name: ''
    });

    await expect(uploadImage(input)).rejects.toThrow(/file name cannot be empty/i);
  });

  it('should reject whitespace-only filename', async () => {
    const input = createTestInput({
      file_name: '   '
    });

    await expect(uploadImage(input)).rejects.toThrow(/file name cannot be empty/i);
  });

  it('should reject invalid base64 data', async () => {
    const input = createTestInput({
      file_data: 'invalid-base64-data!@#$%'
    });

    await expect(uploadImage(input)).rejects.toThrow(/invalid file data format/i);
  });

  it('should reject invalid data URL format', async () => {
    const input = createTestInput({
      file_data: 'data:image/png;base64' // Missing comma
    });

    await expect(uploadImage(input)).rejects.toThrow(/invalid data url format/i);
  });

  it('should handle very large file rejection', async () => {
    // Create a large base64 string by repeating a pattern that maintains valid base64
    // Each chunk should be a multiple of 4 characters to maintain base64 validity
    const chunk = 'ABCD'; // 4-character base64 chunk
    const repetitions = 2 * 1024 * 1024; // 2M repetitions = 8MB of base64 data
    const largeBase64 = chunk.repeat(repetitions);
    
    const input = createTestInput({
      file_data: largeBase64
    });

    await expect(uploadImage(input)).rejects.toThrow(/file too large/i);
  });

  it('should support WebP format', async () => {
    const input = createTestInput({
      content_type: 'image/webp',
      file_name: 'modern.webp'
    });
    const result = await uploadImage(input);

    expect(result.url).toContain('.webp');
    expect(result.url).toContain('modern');
  });

  it('should support GIF format', async () => {
    const input = createTestInput({
      content_type: 'image/gif',
      file_name: 'animated.gif'
    });
    const result = await uploadImage(input);

    expect(result.url).toContain('.gif');
    expect(result.url).toContain('animated');
  });

  it('should include timestamp in generated URL', async () => {
    const input = createTestInput();
    const beforeUpload = Date.now();
    const result = await uploadImage(input);
    const afterUpload = Date.now();

    // Extract timestamp from URL pattern
    const timestampMatch = result.url.match(/\/([^_]+_(\d+)_[^/]+)$/);
    expect(timestampMatch).toBeTruthy();
    
    if (timestampMatch) {
      const extractedTimestamp = parseInt(timestampMatch[2]);
      expect(extractedTimestamp).toBeGreaterThanOrEqual(beforeUpload);
      expect(extractedTimestamp).toBeLessThanOrEqual(afterUpload);
    }
  });

  it('should limit filename length in URL', async () => {
    const longFileName = 'a'.repeat(100) + '.png'; // 100 character filename
    const input = createTestInput({
      file_name: longFileName
    });
    const result = await uploadImage(input);

    // The sanitized filename should be much shorter than 100 characters
    const urlParts = result.url.split('/');
    const fileName = urlParts[urlParts.length - 1];
    const baseNameLength = fileName.split('_').slice(2).join('_').replace(/\.[^.]+$/, '').length;
    expect(baseNameLength).toBeLessThanOrEqual(50);
  });

  it('should use custom base URL from environment', async () => {
    // Save original environment
    const originalBaseUrl = process.env['IMAGE_BASE_URL'];
    
    // Set custom base URL
    process.env['IMAGE_BASE_URL'] = 'https://my-custom-cdn.com';
    
    try {
      const input = createTestInput();
      const result = await uploadImage(input);
      
      expect(result.url).toStartWith('https://my-custom-cdn.com/uploads/');
    } finally {
      // Restore original environment
      if (originalBaseUrl) {
        process.env['IMAGE_BASE_URL'] = originalBaseUrl;
      } else {
        delete process.env['IMAGE_BASE_URL'];
      }
    }
  });
});