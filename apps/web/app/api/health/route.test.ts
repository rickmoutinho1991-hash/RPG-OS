import { describe, it, expect, vi } from 'vitest';
import { GET, HEAD } from './route';

describe('/api/health', () => {
  it('GET returns 200 with status ok', async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    
    const data = await response.json();
    expect(data).toEqual({ status: 'ok' });
  });

  it('GET does not leak secrets', async () => {
    const response = await GET();
    const text = await response.text();
    
    // Should not contain any sensitive patterns
    expect(text).not.toMatch(/secret/i);
    expect(text).not.toMatch(/password/i);
    expect(text).not.toMatch(/token/i);
    expect(text).not.toMatch(/key/i);
    expect(text).not.toMatch(/credential/i);
  });

  it('HEAD returns 200', async () => {
    const response = await HEAD();
    expect(response.status).toBe(200);
  });

  it('Response has correct cache headers', async () => {
    const response = await GET();
    const cacheControl = response.headers.get('Cache-Control');
    expect(cacheControl).toContain('no-cache');
    expect(cacheControl).toContain('no-store');
    expect(cacheControl).toContain('must-revalidate');
  });
});