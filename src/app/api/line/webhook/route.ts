import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  REDEEM_MESSAGE, checkRedeemable, extractCode, type LineLink,
} from "@/lib/line-link";
import { getProfile, isLineConfigured, reply, text, verifySignature } from "@/lib/line";
import type { Tenant } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * รับเหตุการณ์จากไลน์ — ตอนนี้ทำอย่างเดียวคือรับรหัสผูกบัญชีจากผู้เช่า
 *
 * LINE ต้องได้ 200 กลับไปเสมอและเร็ว ไม่งั้นมันจะยิงซ้ำแล้วปิด webhook ทิ้ง
 * เพราะงั้นข้อผิดพลาดภายในของเราต้องไม่ทำให้ตอบ 500 — log ไว้แล้วตอบ 200
 * ยกเว้นลายเซ็นไม่ผ่าน อันนั้นตอบ 401 เพราะไม่ใช่ LINE ที่ยิงมา
 */

interface LineEvent {
  type: string;
  replyToken?: string;
  source?: { userId?: string };
  message?: { type: string; text?: string };
}

/** ไลน์ไอดีนี้ผูกกับผู้เช่ารายไหนอยู่แล้วหรือเปล่า */
async function boundTenant(lineUserId: string): Promise<Tenant | null> {
  const found = await db().list<Tenant>("tenants", {
    where: [{ field: "lineUserId", op: "==", value: lineUserId }],
    limit: 1,
  });
  return found[0] ?? null;
}

async function handleText(event: LineEvent, body: string): Promise<void> {
  const lineUserId = event.source?.userId;
  const replyToken = event.replyToken;
  if (!lineUserId || !replyToken) return;

  const code = extractCode(body);
  if (!code) {
    const already = await boundTenant(lineUserId);
    await reply(replyToken, [
      text(
        already
          ? `สวัสดีค่ะคุณ${already.name} บัญชีนี้ผูกกับระบบแล้ว ใบแจ้งหนี้จะส่งมาที่นี่ทุกเดือน`
          : "กรุณาพิมพ์รหัสผูกบัญชีที่ได้รับจากผู้จัดการ เช่น ABC123",
      ),
    ]);
    return;
  }

  const link = await db().get<LineLink>("lineLinks", code);
  const existing = await boundTenant(lineUserId);
  const problem = checkRedeemable(link, new Date(), existing?.id ?? null);

  if (problem) {
    await reply(replyToken, [text(REDEEM_MESSAGE[problem])]);
    return;
  }

  const tenant = await db().get<Tenant>("tenants", link!.tenantId);
  if (!tenant) {
    await reply(replyToken, [text(REDEEM_MESSAGE["not-found"])]);
    return;
  }

  const profile = await getProfile(lineUserId);
  const now = new Date().toISOString();

  // เขียนสองที่ให้จบพร้อมกัน ไม่งั้นจะเหลือรหัสที่ใช้แล้วแต่ไม่ได้ผูกใคร
  await db().batch([
    { type: "update", collection: "tenants", id: tenant.id, data: { lineUserId } },
    {
      type: "update",
      collection: "lineLinks",
      id: code,
      data: { usedAt: now, usedByLineUserId: lineUserId, ...(profile ? { usedByName: profile.displayName } : {}) },
    },
  ]);

  await reply(replyToken, [
    text(`ผูกบัญชีเรียบร้อยค่ะ คุณ${tenant.name}\nตั้งแต่รอบถัดไป ใบแจ้งหนี้จะส่งมาที่แชตนี้`),
  ]);
}

export async function POST(request: Request) {
  // ต้องอ่าน raw body ก่อน parse เพราะลายเซ็นคิดจากไบต์ที่ส่งมาจริง
  const raw = await request.text();

  if (!verifySignature(raw, request.headers.get("x-line-signature"))) {
    return new NextResponse("ลายเซ็นไม่ถูกต้อง", { status: 401 });
  }

  try {
    const { events = [] } = JSON.parse(raw) as { events?: LineEvent[] };

    for (const event of events) {
      if (event.type === "message" && event.message?.type === "text") {
        await handleText(event, event.message.text ?? "");
      } else if (event.type === "follow" && event.replyToken) {
        const already = event.source?.userId ? await boundTenant(event.source.userId) : null;
        await reply(event.replyToken, [
          text(
            already
              ? `ยินดีต้อนรับกลับค่ะคุณ${already.name}`
              : "ขอบคุณที่เพิ่มเพื่อนค่ะ\nกรุณาพิมพ์รหัสผูกบัญชีที่ได้รับจากผู้จัดการ เพื่อรับใบแจ้งหนี้ทางแชตนี้",
          ),
        ]);
      }
    }
  } catch (err) {
    // ตอบ 200 ไว้ก่อนเสมอ ถ้าตอบ error LINE จะยิงซ้ำแล้วปิด webhook ทิ้ง
    console.error("line webhook failed", err);
  }

  return NextResponse.json({ ok: true });
}

/** ให้กดทดสอบจากหน้า LINE Developers Console ได้ว่าปลายทางมีอยู่จริง */
export async function GET() {
  return NextResponse.json({ ok: true, configured: isLineConfigured() });
}
