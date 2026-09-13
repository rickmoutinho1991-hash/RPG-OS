import { getSessionContext } from "@/lib/session";
import { NextResponse } from "next/server";

export async function GET() {
  const ctx = await getSessionContext();
  return NextResponse.json(ctx);
}