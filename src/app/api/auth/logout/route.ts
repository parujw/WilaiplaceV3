import { NextResponse } from "next/server";
import { DEMO_COOKIE, PROPERTY_COOKIE, SESSION_COOKIE } from "@/lib/session";

export async function POST() {
  const response = NextResponse.json({ ok: true });
  for (const name of [SESSION_COOKIE, DEMO_COOKIE, PROPERTY_COOKIE]) {
    response.cookies.set(name, "", { path: "/", maxAge: 0 });
  }
  return response;
}
