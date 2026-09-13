/**
 * RPG-OS Rate Limiter
 * 
 * Simple in-memory rate limiter for API routes.
 * 
 * PRODUCTION NOTE: This implementation uses process memory.
 * For multi-instance deployments, replace with Redis-backed store (e.g., @upstash/ratelimit).
 * 
 * Categories:
 * - AUTH/SESSION: strict (10 req/min)
 * - PAYMENT/BILLING: strict (20 req/min)  
 * - GOVERNMENT/FISCAL: strict (30 req/min)
 * - WEBHOOKS: abuse/replay protection (50 req/min)
 * - READ APIs: moderate (100 req/min)
 * - ADMIN MUTATIONS: strict (15 req/min)
 */

export type RateLimitCategory = 
  | 'auth'
  | 'payment'
  | 'government'
  | 'webhook'
  | 'read'
  | 'admin';

interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
}

const CATEGORY_CONFIG: Record<RateLimitCategory, RateLimitConfig> = {
  auth: { windowMs: 60_000, maxRequests: 10 },
  payment: { windowMs: 60_000, maxRequests: 20 },
  government: { windowMs: 60_000, maxRequests: 30 },
  webhook: { windowMs: 60_000, maxRequests: 50 },
  read: { windowMs: 60_000, maxRequests: 100 },
  admin: { windowMs: 60_000, maxRequests: 15 },
};

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const stores = new Map<RateLimitCategory, Map<string, RateLimitEntry>>();

for (const cat of Object.keys(CATEGORY_CONFIG) as RateLimitCategory[]) {
  stores.set(cat, new Map());
}

function getClientKey(request: Request, prefix: string = ''): string {
  // Try to get real IP from headers (for production behind proxy)
  const forwarded = request.headers.get('x-forwarded-for');
  const realIp = request.headers.get('x-real-ip');
  const ip = forwarded?.split(',')[0]?.trim() || realIp || 'unknown';
  
  // Include user agent for additional differentiation
  const ua = request.headers.get('user-agent') || 'unknown';
  const uaHash = simpleHash(ua).toString(36).substring(0, 8);
  
  return `${prefix}${ip}:${uaHash}`;
}

function simpleHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function cleanExpiredEntries(category: RateLimitCategory): void {
  const store = stores.get(category);
  if (!store) return;
  
  const now = Date.now();
  for (const [key, entry] of store.entries()) {
    if (entry.resetAt < now) {
      store.delete(key);
    }
  }
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
  limit: number;
}

export function rateLimit(
  request: Request,
  category: RateLimitCategory,
  customKey?: string
): RateLimitResult {
  const config = CATEGORY_CONFIG[category];
  const store = stores.get(category)!;
  
  const key = customKey || getClientKey(request, `${category}:`);
  const now = Date.now();
  
  // Clean expired entries periodically (10% chance)
  if (Math.random() < 0.1) {
    cleanExpiredEntries(category);
  }
  
  let entry = store.get(key);
  
  if (!entry || entry.resetAt < now) {
    // New window
    entry = {
      count: 0,
      resetAt: now + config.windowMs,
    };
    store.set(key, entry);
  }
  
  entry.count++;
  
  const remaining = Math.max(0, config.maxRequests - entry.count);
  const allowed = entry.count <= config.maxRequests;
  
  return {
    allowed,
    remaining,
    resetAt: entry.resetAt,
    limit: config.maxRequests,
  };
}

export function createRateLimitHeaders(result: RateLimitResult): Record<string, string> {
  return {
    'X-RateLimit-Limit': String(result.limit),
    'X-RateLimit-Remaining': String(result.remaining),
    'X-RateLimit-Reset': String(Math.ceil(result.resetAt / 1000)),
  };
}

export function rateLimitMiddleware(
  category: RateLimitCategory,
  getKey?: (request: Request) => string
) {
  return async function middleware(request: Request): Promise<Response | null> {
    const key = getKey ? getKey(request) : undefined;
    const result = rateLimit(request, category, key);
    
    if (!result.allowed) {
      return new Response(
        JSON.stringify({ 
          error: 'Too Many Requests',
          message: `Rate limit exceeded for ${category}. Try again later.`,
        }),
        {
          status: 429,
          headers: {
            'Content-Type': 'application/json',
            ...createRateLimitHeaders(result),
            'Retry-After': String(Math.ceil((result.resetAt - Date.now()) / 1000)),
          },
        }
      );
    }
    
    // Return null to continue - headers will be added by caller
    return null;
  };
}

/**
 * Apply rate limit headers to an existing response
 */
export function applyRateLimitHeaders(response: Response, result: RateLimitResult): Response {
  const newHeaders = new Headers(response.headers);
  const headers = createRateLimitHeaders(result);
  for (const [key, value] of Object.entries(headers)) {
    newHeaders.set(key, value);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: newHeaders,
  });
}