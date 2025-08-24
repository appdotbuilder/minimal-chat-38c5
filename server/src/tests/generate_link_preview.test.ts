import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { generateLinkPreview, type LinkPreview } from '../handlers/generate_link_preview';

// Mock fetch for testing
const mockFetch = mock();
const originalFetch = global.fetch;

// Helper function to create mock Response objects
const createMockResponse = (options: {
  ok?: boolean;
  status?: number;
  statusText?: string;
  contentType?: string;
  contentLength?: string;
  text?: string;
  url?: string;
}) => {
  const {
    ok = true,
    status = 200,
    statusText = 'OK',
    contentType = 'text/html',
    contentLength,
    text = '',
    url = 'https://example.com/'
  } = options;

  const mockHeaders = new Headers();
  mockHeaders.append('content-type', contentType);
  if (contentLength) {
    mockHeaders.append('content-length', contentLength);
  }

  return {
    ok,
    status,
    statusText,
    headers: mockHeaders,
    text: () => Promise.resolve(text),
    json: () => Promise.resolve({}),
    blob: () => Promise.resolve(new Blob([], { type: 'text/html' })),
    arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
    body: null,
    bodyUsed: false,
    clone: () => ({}),
    type: 'default' as const,
    url,
    redirected: false,
  };
};

describe('generateLinkPreview', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    // Setup fetch mock with preconnect property
    const fetchWithPreconnect = Object.assign(mockFetch, {
      preconnect: mock(() => {}),
    });
    global.fetch = fetchWithPreconnect as typeof fetch;
  });

  afterEach(() => {
    mockFetch.mockClear();
  });

  it('should generate link preview with Open Graph tags', async () => {
    const mockHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Page Title</title>
        <meta property="og:title" content="OG Title" />
        <meta property="og:description" content="OG Description" />
        <meta property="og:image" content="https://example.com/image.jpg" />
        <meta name="description" content="Meta Description" />
      </head>
      <body>Content</body>
      </html>
    `;

    mockFetch.mockResolvedValue(createMockResponse({
      contentType: 'text/html; charset=utf-8',
      text: mockHtml,
      url: 'https://example.com/'
    }));

    const result = await generateLinkPreview('https://example.com');

    expect(result).toEqual({
      url: 'https://example.com/',
      title: 'OG Title',
      description: 'OG Description',
      image: 'https://example.com/image.jpg',
    });

    expect(mockFetch).toHaveBeenCalledWith(
      'https://example.com/',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          'User-Agent': 'Mozilla/5.0 (compatible; LinkPreviewBot/1.0)',
        }),
      })
    );
  });

  it('should fallback to Twitter Card tags when Open Graph is missing', async () => {
    const mockHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Page Title</title>
        <meta name="twitter:title" content="Twitter Title" />
        <meta name="twitter:description" content="Twitter Description" />
        <meta name="twitter:image" content="/relative-image.jpg" />
      </head>
      <body>Content</body>
      </html>
    `;

    mockFetch.mockResolvedValue(createMockResponse({
      text: mockHtml,
      url: 'https://example.com/page'
    }));

    const result = await generateLinkPreview('https://example.com/page');

    expect(result).toEqual({
      url: 'https://example.com/page',
      title: 'Twitter Title',
      description: 'Twitter Description',
      image: 'https://example.com/relative-image.jpg',
    });
  });

  it('should fallback to HTML title and meta description', async () => {
    const mockHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>HTML Title</title>
        <meta name="description" content="HTML Meta Description" />
      </head>
      <body>Content</body>
      </html>
    `;

    mockFetch.mockResolvedValue(createMockResponse({
      text: mockHtml
    }));

    const result = await generateLinkPreview('https://example.com');

    expect(result).toEqual({
      url: 'https://example.com/',
      title: 'HTML Title',
      description: 'HTML Meta Description',
      image: null,
    });
  });

  it('should clean HTML entities in extracted text', async () => {
    const mockHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Title with &quot;quotes&quot; &amp; entities</title>
        <meta property="og:description" content="Description with&nbsp;spaces &lt;and&gt; &#39;entities&#39;" />
      </head>
      <body>Content</body>
      </html>
    `;

    mockFetch.mockResolvedValue(createMockResponse({
      text: mockHtml
    }));

    const result = await generateLinkPreview('https://example.com');

    expect(result?.title).toBe('Title with "quotes" & entities');
    expect(result?.description).toBe('Description with spaces <and> \'entities\'');
  });

  it('should return null for invalid URLs', async () => {
    const invalidUrls = [
      'not-a-url',
      'ftp://example.com',
      'javascript:alert("xss")',
      'data:text/html,<script>alert("xss")</script>',
      'file:///etc/passwd',
    ];

    for (const url of invalidUrls) {
      const result = await generateLinkPreview(url);
      expect(result).toBeNull();
    }

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('should block private and local network addresses', async () => {
    const blockedUrls = [
      'http://localhost:8080',
      'http://127.0.0.1',
      'http://10.0.0.1',
      'http://192.168.1.1',
      'http://172.16.0.1',
      'http://169.254.1.1',
    ];

    for (const url of blockedUrls) {
      const result = await generateLinkPreview(url);
      expect(result).toBeNull();
    }

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('should return null when fetch fails', async () => {
    mockFetch.mockResolvedValue(createMockResponse({
      ok: false,
      status: 404,
      statusText: 'Not Found'
    }));

    const result = await generateLinkPreview('https://example.com/not-found');

    expect(result).toBeNull();
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('should return null for non-HTML content', async () => {
    mockFetch.mockResolvedValue(createMockResponse({
      contentType: 'application/json',
      text: '{"data": "json"}'
    }));

    const result = await generateLinkPreview('https://example.com/api.json');

    expect(result).toBeNull();
  });

  it('should return null when content is too large', async () => {
    mockFetch.mockResolvedValue(createMockResponse({
      contentLength: '2097152', // 2MB, over the 1MB limit
      text: '<html></html>'
    }));

    const result = await generateLinkPreview('https://example.com/large-page');

    expect(result).toBeNull();
  });

  it('should handle network errors gracefully', async () => {
    mockFetch.mockRejectedValue(new Error('Network error'));

    const result = await generateLinkPreview('https://example.com');

    expect(result).toBeNull();
  });

  it('should handle timeout errors gracefully', async () => {
    mockFetch.mockRejectedValue(new DOMException('The operation was aborted.', 'AbortError'));

    const result = await generateLinkPreview('https://example.com');

    expect(result).toBeNull();
  });

  it('should resolve relative image URLs correctly', async () => {
    const mockHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Test</title>
        <meta property="og:image" content="/images/preview.jpg" />
      </head>
      <body>Content</body>
      </html>
    `;

    mockFetch.mockResolvedValue(createMockResponse({
      text: mockHtml
    }));

    const result = await generateLinkPreview('https://example.com/blog/post');

    expect(result?.image).toBe('https://example.com/images/preview.jpg');
  });

  it('should handle malformed HTML gracefully', async () => {
    const malformedHtml = `
      <html>
      <head>
        <title>Broken Title
        <meta property="og:title" content="OG Title" />
        <meta property="og:description" content="Description with unescaped > characters" />
      </head>
      <body>
        <p>Unclosed paragraph
        <div>Nested divs
          <span>Unclosed span
      </body>
    `;

    mockFetch.mockResolvedValue({
      ok: true,
      headers: new Map([['content-type', 'text/html']]),
      text: () => Promise.resolve(malformedHtml),
    });

    const result = await generateLinkPreview('https://example.com');

    expect(result).toEqual({
      url: 'https://example.com/',
      title: 'OG Title',
      description: 'Description with unescaped > characters',
      image: null,
    });
  });

  it('should prioritize Open Graph over Twitter Card tags', async () => {
    const mockHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>HTML Title</title>
        <meta property="og:title" content="OG Title" />
        <meta property="og:description" content="OG Description" />
        <meta name="twitter:title" content="Twitter Title" />
        <meta name="twitter:description" content="Twitter Description" />
        <meta name="description" content="Meta Description" />
      </head>
      <body>Content</body>
      </html>
    `;

    mockFetch.mockResolvedValue(createMockResponse({
      text: mockHtml
    }));

    const result = await generateLinkPreview('https://example.com');

    expect(result?.title).toBe('OG Title');
    expect(result?.description).toBe('OG Description');
  });

  it('should return partial data when some metadata is missing', async () => {
    const mockHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Only Title Available</title>
      </head>
      <body>Content</body>
      </html>
    `;

    mockFetch.mockResolvedValue(createMockResponse({
      text: mockHtml
    }));

    const result = await generateLinkPreview('https://example.com');

    expect(result).toEqual({
      url: 'https://example.com/',
      title: 'Only Title Available',
      description: null,
      image: null,
    });
  });
});