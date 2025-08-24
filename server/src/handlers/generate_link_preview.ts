export interface LinkPreview {
  url: string;
  title: string | null;
  description: string | null;
  image: string | null;
}

export async function generateLinkPreview(url: string): Promise<LinkPreview | null> {
  try {
    // Validate URL format
    const validatedUrl = validateUrl(url);
    if (!validatedUrl) {
      return null;
    }

    // Fetch the webpage content
    const response = await fetch(validatedUrl, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; LinkPreviewBot/1.0)',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate',
        'Connection': 'keep-alive',
      },
      // Security: Limit response size and timeout
      signal: AbortSignal.timeout(10000), // 10 second timeout
    });

    if (!response.ok) {
      console.error(`Failed to fetch URL ${validatedUrl}: ${response.status} ${response.statusText}`);
      return null;
    }

    // Check content type
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('text/html')) {
      console.error(`URL ${validatedUrl} is not HTML content: ${contentType}`);
      return null;
    }

    // Limit response size for security
    const MAX_SIZE = 1024 * 1024; // 1MB limit
    const contentLength = response.headers.get('content-length');
    if (contentLength && parseInt(contentLength) > MAX_SIZE) {
      console.error(`URL ${validatedUrl} content too large: ${contentLength} bytes`);
      return null;
    }

    const html = await response.text();

    // Extract metadata from HTML
    const preview = extractMetadata(html, validatedUrl);

    return preview;
  } catch (error) {
    console.error('Link preview generation failed:', error);
    return null;
  }
}

function validateUrl(url: string): string | null {
  try {
    const parsedUrl = new URL(url);
    
    // Only allow HTTP and HTTPS protocols
    if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
      return null;
    }

    // Block private/local network addresses for security
    const hostname = parsedUrl.hostname.toLowerCase();
    
    // Block localhost and loopback
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1') {
      return null;
    }

    // Block private IP ranges
    const privateRanges = [
      /^10\./,
      /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
      /^192\.168\./,
      /^169\.254\./, // Link-local
      /^fc00:/, // IPv6 private
      /^fe80:/, // IPv6 link-local
    ];

    if (privateRanges.some(range => range.test(hostname))) {
      return null;
    }

    return parsedUrl.toString();
  } catch (error) {
    console.error('Invalid URL:', error);
    return null;
  }
}

function extractMetadata(html: string, url: string): LinkPreview {
  // Initialize result with defaults
  const preview: LinkPreview = {
    url,
    title: null,
    description: null,
    image: null,
  };

  try {
    // Extract Open Graph tags (priority)
    const ogTitle = extractMetaContent(html, 'property="og:title"');
    const ogDescription = extractMetaContent(html, 'property="og:description"');
    const ogImage = extractMetaContent(html, 'property="og:image"');

    // Extract Twitter Card tags (fallback)
    const twitterTitle = extractMetaContent(html, 'name="twitter:title"');
    const twitterDescription = extractMetaContent(html, 'name="twitter:description"');
    const twitterImage = extractMetaContent(html, 'name="twitter:image"');

    // Extract standard meta tags (fallback)
    const metaDescription = extractMetaContent(html, 'name="description"');

    // Extract title tag
    const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
    const htmlTitle = titleMatch ? titleMatch[1].trim() : null;

    // Set title (priority: OG > Twitter > HTML title)
    preview.title = cleanText(ogTitle || twitterTitle || htmlTitle);

    // Set description (priority: OG > Twitter > meta description)
    preview.description = cleanText(ogDescription || twitterDescription || metaDescription);

    // Set image (priority: OG > Twitter)
    const imageUrl = ogImage || twitterImage;
    if (imageUrl) {
      preview.image = resolveUrl(imageUrl, url);
    }

    return preview;
  } catch (error) {
    console.error('Metadata extraction failed:', error);
    return preview;
  }
}

function extractMetaContent(html: string, attribute: string): string | null {
  // Create regex pattern to match meta tags with the specified attribute
  const pattern = new RegExp(`<meta[^>]*\\s${attribute.replace(/"/g, '"')}[^>]*\\scontent=["']([^"']*?)["'][^>]*>`, 'i');
  const match = html.match(pattern);
  return match ? match[1] : null;
}

function cleanText(text: string | null): string | null {
  if (!text) return null;
  
  // Decode HTML entities and clean up text
  return text
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    || null;
}

function resolveUrl(relativeUrl: string, baseUrl: string): string | null {
  try {
    const resolved = new URL(relativeUrl, baseUrl);
    
    // Only return HTTP/HTTPS URLs
    if (resolved.protocol === 'http:' || resolved.protocol === 'https:') {
      return resolved.toString();
    }
    
    return null;
  } catch (error) {
    console.error('URL resolution failed:', error);
    return null;
  }
}