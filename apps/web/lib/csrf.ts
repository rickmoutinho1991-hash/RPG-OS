/**
 * RPG-OS CSRF Protection
 * 
 * Double-submit cookie pattern for browser-authenticated mutations.
 * Webhooks are exempt - they use signature-based authentication instead.
 * 
 * Usage:
 * 1. Client reads csrf token from cookie (set by middleware or login)
 * 2. Client includes token in `x-csrf-token` header for mutations
 * 3. Server validates token matches cookie
 */

import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';

const CSRF_COOKIE_NAME = 'csrf_token';
const CSRF_HEADER_NAME = 'x-csrf-token';
const CSRF_TOKEN_BYTES = 32;

function generateCsrfToken(): string {
  const bytes = new Uint8Array(CSRF_TOKEN_BYTES);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

export async function getOrCreateCsrfToken(): Promise<string> {
  const cookieStore = await cookies();
  const existing = cookieStore.get(CSRF_COOKIE_NAME);
  
  if (existing?.value) {
    return existing.value;
  }
  
  const token = generateCsrfToken();
  cookieStore.set(CSRF_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: 60 * 60 * 24 * 30, // 30 days
  });
  
  return token;
}

export async function validateCsrfToken(request: NextRequest): Promise<boolean> {
  const cookieStore = await cookies();
  const cookieToken = cookieStore.get(CSRF_COOKIE_NAME)?.value;
  const headerToken = request.headers.get(CSRF_HEADER_NAME);
  
  if (!cookieToken || !headerToken) {
    return false;
  }
  
  return constantTimeEqual(cookieToken, headerToken);
}

export function csrfProtection() {
  return async function middleware(request: NextRequest): Promise<Response | null> {
    // Only protect mutating methods
    const method = request.method;
    if (['GET', 'HEAD', 'OPTIONS'].includes(method)) {
      return null;
    }
    
    // Skip for webhooks (they use signature auth)
    const path = request.nextUrl.pathname;
    if (path.startsWith('/api/webhooks/')) {
      return null;
    }
    
    // Skip for API routes that use service-to-service auth
    if (path.startsWith('/api/') && request.headers.get('x-service-auth')) {
      return null;
    }
    
    const isValid = await validateCsrfToken(request);
    
    if (!isValid) {
      return NextResponse.json(
        { 
          error: 'CSRF token validation failed',
          message: 'Invalid or missing CSRF token. Include x-csrf-token header.',
        },
        { 
          status: 403,
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );
    }
    
    return null;
  };
}

/**
 * Get CSRF token for client-side use
 * Call this in a server component or action to provide token to client
 */
export async function getCsrfTokenForClient(): Promise<string> {
  return getOrCreateCsrfToken();
}

/**
 * Middleware to ensure CSRF cookie is set on login/auth pages
 */
export function ensureCsrfCookie(response: NextResponse): NextResponse {
  // The cookie will be set by getOrCreateCsrfToken when first accessed
  // This is a placeholder for any additional cookie configuration
  return response;
}