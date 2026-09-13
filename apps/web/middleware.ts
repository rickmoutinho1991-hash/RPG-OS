import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const response = NextResponse.next();

  // Security headers
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');

  // Content-Security-Policy - compatible with Next.js/Turbopack
  // Allows unsafe-inline/unsafe-eval for Next.js runtime, but restricts other sources
  const csp = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'", // Next.js requires unsafe-inline/eval for runtime
    "style-src 'self' 'unsafe-inline'", // Next.js uses inline styles
    "img-src 'self' data: https: blob:", // Allow images from self, data URLs, HTTPS, and blob
    "font-src 'self' data:", // Fonts from self and data URLs
    "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.stripe.com https://api.portaldasfinancas.gov.pt", // Supabase, Stripe, AT
    "frame-ancestors 'none'", // Prevent clickjacking
    "form-action 'self'", // Forms only to same origin
    "base-uri 'self'", // Base URI only self
    "object-src 'none'", // No plugins
  ].join('; ');

  response.headers.set('Content-Security-Policy', csp);

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder files
     * - API routes that need special handling
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js)$).*)',
  ],
};