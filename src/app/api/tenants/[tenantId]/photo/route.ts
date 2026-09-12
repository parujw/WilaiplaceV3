import { NextResponse } from "next/server";
import { getStorage } from "firebase-admin/storage";
import { db } from "@/lib/db";
import { adminApp, isFirebaseConfigured } from "@/lib/firebase-admin";
import { storageBucket } from "@/lib/firebase-config";
import { audit } from "@/lib/repo";
import { getSessionUser } from "@/lib/session";
import type { Tenant } from "@/lib/types";

/** รูปที่ย่อจากฝั่ง client แล้วไม่ควรเกินนี้ ถ้าเกินแปลว่าย่อไม่สำเร็จ */
const MAX_BYTES = 1_500_000;

export async function POST(request: Request, { params }: { params: Promise<{ tenantId: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "ยังไม่ได้ล็อกอิน" }, { status: 401 });
  if (user.role === "viewer") return NextResponse.json({ error: "ไม่มีสิทธิ์แก้ไข" }, { status: 403 });

  const { tenantId } = await params;
  const tenant = await db().get<Tenant>("tenants", tenantId);
  if (!tenant) return NextResponse.json({ error: "ไม่พบผู้เช่า" }, { status: 404 });

  const { dataUrl } = (await request.json()) as { dataUrl?: string };
  if (!dataUrl) return NextResponse.json({ error: "ไม่มีรูป" }, { status: 400 });

  const match = dataUrl.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/);
  if (!match) return NextResponse.json({ error: "รองรับเฉพาะรูป JPEG, PNG หรือ WebP" }, { status: 400 });

  const [, contentType, base64] = match;
  const bytes = Buffer.from(base64, "base64");
  if (bytes.byteLength > MAX_BYTES) {
    return NextResponse.json({ error: "ไฟล์ใหญ่เกินไป ลองถ่ายใหม่หรือเลือกรูปที่เล็กลง" }, { status: 413 });
  }

  let photoUrl: string;
  const bucketName = storageBucket();

  if (isFirebaseConfigured() && bucketName) {
    const ext = contentType.split("/")[1];
    const file = getStorage(adminApp()).bucket(bucketName).file(`tenants/${tenantId}.${ext}`);
    await file.save(bytes, { contentType, resumable: false, metadata: { cacheControl: "public, max-age=86400" } });
    await file.makePublic();
    photoUrl = `https://storage.googleapis.com/${bucketName}/${file.name}?v=${Date.now()}`;
  } else {
    // โหมดสาธิต — เก็บรูปไว้ในข้อมูลเลย ไม่ต้องมี Storage
    photoUrl = dataUrl;
  }

  await db().update("tenants", tenantId, { photoUrl });
  await audit(user, {
    propertyId: tenant.propertyId,
    action: "tenant.photo.update",
    targetType: "tenant",
    targetId: tenantId,
    before: { photoUrl: tenant.photoUrl ? "(มีรูปเดิม)" : null },
    after: { photoUrl: "(อัปโหลดรูปใหม่)" },
  });

  return NextResponse.json({ ok: true, photoUrl });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ tenantId: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "ยังไม่ได้ล็อกอิน" }, { status: 401 });

  const { tenantId } = await params;
  const tenant = await db().get<Tenant>("tenants", tenantId);
  if (!tenant) return NextResponse.json({ error: "ไม่พบผู้เช่า" }, { status: 404 });

  await db().update("tenants", tenantId, { photoUrl: null });
  await audit(user, {
    propertyId: tenant.propertyId,
    action: "tenant.photo.remove",
    targetType: "tenant",
    targetId: tenantId,
    before: { photoUrl: "(มีรูป)" },
    after: { photoUrl: null },
  });
  return NextResponse.json({ ok: true });
}
