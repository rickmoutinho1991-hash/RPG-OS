import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET() {
  try {
    // Quick Supabase connectivity check
    const supabase = createAdminClient();
    
    // Simple query to verify database connectivity
    const { error } = await supabase
      .from('organizations')
      .select('id')
      .limit(1);

    if (error) {
      console.error('[Ready] Database check failed:', error.message);
      return NextResponse.json(
        { status: 'not_ready', reason: 'database_unavailable' },
        {
          status: 503,
          headers: {
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Content-Type': 'application/json',
          },
        }
      );
    }

    return NextResponse.json(
      { status: 'ready' },
      {
        status: 200,
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Content-Type': 'application/json',
        },
      }
    );
  } catch (error) {
    console.error('[Ready] Unexpected error:', error);
    return NextResponse.json(
      { status: 'not_ready', reason: 'internal_error' },
      {
        status: 503,
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Content-Type': 'application/json',
        },
      }
    );
  }
}

export async function HEAD() {
  return new Response(null, { status: 200 });
}