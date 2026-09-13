import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GET, HEAD } from './route';
import { createAdminClient } from '../../../lib/supabase/admin';

vi.mock('../../../lib/supabase/admin', () => ({
  createAdminClient: vi.fn(),
}));

describe('/api/ready', () => {
  let mockSupabase: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabase = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
    };
    (vi.mocked(createAdminClient)).mockReturnValue(mockSupabase);
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('GET returns 200 with status ready when database is available', async () => {
    mockSupabase.from.mockReturnValue({
      select: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue({ data: [{ id: '1' }], error: null }),
      }),
    });

    const response = await GET();
    expect(response.status).toBe(200);
    
    const data = await response.json();
    expect(data).toEqual({ status: 'ready' });
  });

  it('GET returns 503 when database is unavailable', async () => {
    mockSupabase.from.mockReturnValue({
      select: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue({ data: null, error: { message: 'connection failed' } }),
      }),
    });

    const response = await GET();
    expect(response.status).toBe(503);
    
    const data = await response.json();
    expect(data).toEqual({ status: 'not_ready', reason: 'database_unavailable' });
  });

  it('GET returns 503 when database throws', async () => {
    mockSupabase.from.mockImplementation(() => {
      throw new Error('Connection refused');
    });

    const response = await GET();
    expect(response.status).toBe(503);
    
    const data = await response.json();
    expect(data).toEqual({ status: 'not_ready', reason: 'internal_error' });
  });

  it('HEAD returns 200', async () => {
    const response = await HEAD();
    expect(response.status).toBe(200);
  });

  it('Response has correct cache headers', async () => {
    mockSupabase.from.mockReturnValue({
      select: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue({ data: [{ id: '1' }], error: null }),
      }),
    });

    const response = await GET();
    const cacheControl = response.headers.get('Cache-Control');
    expect(cacheControl).toContain('no-cache');
    expect(cacheControl).toContain('no-store');
    expect(cacheControl).toContain('must-revalidate');
  });

  it('Response does not leak secrets', async () => {
    mockSupabase.from.mockReturnValue({
      select: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue({ data: [{ id: '1' }], error: null }),
      }),
    });

    const response = await GET();
    const text = await response.text();
    
    expect(text).not.toMatch(/secret/i);
    expect(text).not.toMatch(/password/i);
    expect(text).not.toMatch(/token/i);
    expect(text).not.toMatch(/key/i);
    expect(text).not.toMatch(/credential/i);
  });
});