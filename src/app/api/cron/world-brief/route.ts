import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { isLineConfigured, push, text } from "@/lib/line";
import { getWorld, listProperties } from "@/lib/repo";
import { dailyBrief } from "@/lib/world";

export const dynamic = "force-dynamic";

/**
 * WILAI สรุปเช้า — Vercel Cron เรียกทุกวัน 08:00 เวลาไทย (01:00 UTC ดู vercel.json)
 *
 * ต้องตั้งค่า:
 *   CRON_SECRET          Vercel แนบมาเป็น Authorization: Bearer <ค่านี้> ให้เอง ไม่ตั้ง = ปิดเส้นนี้
 *   LINE_OWNER_USER_IDS  LINE userId ของเจ้าของ คั่นด้วยจุลภาค (พิมพ์ "myid" หาบอทเพื่อดูของตัวเอง)
 *   LINE_CHANNEL_ACCESS_TOKEN / LINE_CHANNEL_SECRET  ตัวเดียวกับที่ใช้ส่งบิล
 *
 * อ่านอย่างเดียว ไม่แก้ข้อมูลในระบบ แค่ส่งข้อความสรุป
 */
export async function GET(request: Request) {
  const secret = env("CRON_SECRET");
  if (!secret) return NextResponse.json({ error: "ยังไม่ได้ตั้ง CRON_SECRET" }, { status: 503 });
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const properties = await listProperties();
  const buildings = await Promise.all(properties.map(async (p) => ({ name: p.name, world: await getWorld(p.id) })));
  const message = dailyBrief(buildings, { appUrl: env("NEXT_PUBLIC_APP_URL") ?? new URL(request.url).origin });

  const owners = (env("LINE_OWNER_USER_IDS") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!isLineConfigured() || owners.length === 0) {
    return NextResponse.json({ sent: 0, skipped: "ยังไม่ได้ตั้งค่า LINE หรือ LINE_OWNER_USER_IDS", message });
  }

  const results = await Promise.allSettled(owners.map((to) => push(to, [text(message)])));
  const failed = results.filter((r) => r.status === "rejected").map((r) => String((r as PromiseRejectedResult).reason));
  if (failed.length) console.error("world-brief: ส่งไม่สำเร็จ", failed);
  return NextResponse.json({ sent: owners.length - failed.length, failed: failed.length }, { status: failed.length === owners.length ? 502 : 200 });
}
