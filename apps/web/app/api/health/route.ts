import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json(
    { status: 'ok' },
    {
      status: 200,
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Content-Type': 'application/json',
      },
    }
  );
}

export async function HEAD() {
  return new Response(null, { status: 200 });
}