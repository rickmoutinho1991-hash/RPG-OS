import { NextRequest, NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({ status: "ready" });
}

export async function HEAD() {
  return new NextResponse(null, { status: 200 });
}