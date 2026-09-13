/**
 * RPG-OS Request Body Size Limits
 * 
 * Per-route body size limits to prevent DoS via oversized payloads.
 * 
 * Limits by category:
 * - Normal JSON APIs: 1 MB
 * - Government/Fiscal submissions: 5 MB (allows larger documents)
 * - Webhooks: 500 KB (small, structured payloads)
 * - File uploads: 25 MB (explicit multipart)
 * - SAF-T exports: 50 MB (large XML exports)
 */

export type BodySizeCategory = 
  | 'json'        // 1 MB - normal JSON APIs
  | 'government'  // 5 MB - government/fiscal documents
  | 'webhook'     // 500 KB - webhook payloads
  | 'file'        // 25 MB - file uploads
  | 'saft';       // 50 MB - SAF-T exports

const CATEGORY_LIMITS: Record<BodySizeCategory, number> = {
  json: 1 * 1024 * 1024,        // 1 MB
  government: 5 * 1024 * 1024,  // 5 MB
  webhook: 500 * 1024,          // 500 KB
  file: 25 * 1024 * 1024,       // 25 MB
  saft: 50 * 1024 * 1024,       // 50 MB
};

export interface BodySizeLimitResult {
  allowed: boolean;
  limit: number;
  received: number;
  category: BodySizeCategory;
}

function parseContentLength(request: Request): number | null {
  const contentLength = request.headers.get('content-length');
  if (!contentLength) return null;
  const parsed = parseInt(contentLength, 10);
  return isNaN(parsed) ? null : parsed;
}

export function checkBodySizeLimit(
  request: Request,
  category: BodySizeCategory
): BodySizeLimitResult {
  const limit = CATEGORY_LIMITS[category];
  const contentLength = parseContentLength(request);
  
  // If no content-length header, we can't check upfront
  // The actual body parsing will enforce limits
  if (contentLength === null) {
    return {
      allowed: true,
      limit,
      received: 0,
      category,
    };
  }
  
  const allowed = contentLength <= limit;
  
  return {
    allowed,
    limit,
    received: contentLength,
    category,
  };
}

export function createBodySizeLimitResponse(result: BodySizeLimitResult): Response {
  return new Response(
    JSON.stringify({
      error: 'Payload Too Large',
      message: `Request body exceeds maximum size for ${result.category}. Limit: ${formatBytes(result.limit)}, Received: ${formatBytes(result.received)}`,
      limit: result.limit,
      received: result.received,
    }),
    {
      status: 413,
      headers: {
        'Content-Type': 'application/json',
        'X-Body-Limit': String(result.limit),
        'X-Body-Received': String(result.received),
      },
    }
  );
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Middleware wrapper for API routes
 */
export function withBodySizeLimit(
  category: BodySizeCategory,
  handler: (request: Request) => Promise<Response>
) {
  return async function(request: Request): Promise<Response> {
    const result = checkBodySizeLimit(request, category);
    
    if (!result.allowed) {
      return createBodySizeLimitResponse(result);
    }
    
    return handler(request);
  };
}

/**
 * Get limit for a category (for documentation/headers)
 */
export function getBodySizeLimit(category: BodySizeCategory): number {
  return CATEGORY_LIMITS[category];
}