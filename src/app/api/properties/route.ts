import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { canUploadPublic, uploadPublic } from "@/lib/storage";
import { audit, getProperty } from "@/lib/repo";
import { getSessionUser } from "@/lib/session";
import type { PaymentInfo, Property } from "@/lib/types";

const MAX_BYTES = 2_000_000;

/** อัปโหลดรูปอาคาร — เก็บบน Storage ถ้ามี ไม่งั้นเก็บเป็น data URL ในโหมดสาธิต */
async function storePhoto(propertyId: string, dataUrl: string): Promise<string> {
  const match = dataUrl.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/);
  if (!match) throw new Error("รองรับเฉพาะรูป JPEG, PNG หรือ WebP");
  const [, contentType, base64] = match;
  const bytes = Buffer.from(base64, "base64");
  if (bytes.byteLength > MAX_BYTES) throw new Error("ไฟล์ใหญ่เกินไป");

  // โหมดสาธิตไม่มี Storage — เก็บรูปไว้ในข้อมูลเลย
  if (!canUploadPublic()) return dataUrl;

  const url = await uploadPublic(`properties/${propertyId}.${contentType.split("/")[1]}`, bytes, contentType);
  // ต่อท้ายด้วยเวลา ไม่งั้นเปลี่ยนรูปแล้วเบราว์เซอร์ยังโชว์รูปเก่าที่แคชไว้
  return `${url}?v=${Date.now()}`;
}

/** สร้างอาคารใหม่ในเครือ — เฉพาะเจ้าของ */
export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "ยังไม่ได้ล็อกอิน" }, { status: 401 });
  if (user.role !== "owner") return NextResponse.json({ error: "เฉพาะเจ้าของเท่านั้นที่เพิ่มอาคารได้" }, { status: 403 });

  const body = (await request.json()) as {
    id?: string; name?: string; shortName?: string; address?: string; phone?: string; floors?: number;
  };

  const id = (body.id ?? "").trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]{1,30}$/.test(id)) {
    return NextResponse.json({ error: "รหัสอาคารใช้ได้เฉพาะ a-z, 0-9 และ - (2-31 ตัว)" }, { status: 400 });
  }
  if (!body.name?.trim()) return NextResponse.json({ error: "ต้องระบุชื่ออาคาร" }, { status: 400 });
  if (await getProperty(id)) return NextResponse.json({ error: `มีอาคารรหัส ${id} อยู่แล้ว` }, { status: 409 });

  const property: Property = {
    id,
    name: body.name.trim(),
    shortName: (body.shortName ?? id).trim().toUpperCase(),
    address: body.address?.trim() ?? "",
    photoUrl: null,
    phone: body.phone?.trim() ?? "",
    floors: Math.max(1, Number(body.floors) || 1),
    defaultRates: { elec: 8, water: 20, ac: 500, internet: 0, parking: 0 },
    paymentDueDay: 5,
    active: true,
  };

  await db().set("properties", id, property as unknown as Record<string, unknown>);
  await audit(user, {
    propertyId: id, action: "property.create", targetType: "property", targetId: id,
    before: null, after: property,
  });

  return NextResponse.json({ ok: true, propertyId: id });
}

/** แก้ข้อมูลอาคารที่ V2 ไม่มี เช่น ที่อยู่และรูปอาคาร */
export async function PATCH(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "ยังไม่ได้ล็อกอิน" }, { status: 401 });
  if (user.role === "viewer") return NextResponse.json({ error: "ไม่มีสิทธิ์แก้ไข" }, { status: 403 });

  const body = (await request.json()) as {
    propertyId?: string;
    name?: string;
    nameEn?: string;
    address?: string;
    phone?: string;
    preparedBy?: string;
    photoDataUrl?: string | null;
    payment?: Partial<PaymentInfo>;
    qrDataUrl?: string | null;
  };
  if (!body.propertyId) return NextResponse.json({ error: "ไม่ได้ระบุอาคาร" }, { status: 400 });

  const property = await getProperty(body.propertyId);
  if (!property) return NextResponse.json({ error: "ไม่พบอาคาร" }, { status: 404 });

  const patch: Record<string, unknown> = {};
  const text = (value: unknown) => (typeof value === "string" ? value.trim() : undefined);

  if (text(body.name)) patch.name = text(body.name);
  if (typeof body.nameEn === "string") patch.nameEn = text(body.nameEn);
  if (typeof body.address === "string") patch.address = text(body.address);
  if (typeof body.phone === "string") patch.phone = text(body.phone);
  if (typeof body.preparedBy === "string") patch.preparedBy = text(body.preparedBy);

  if (body.photoDataUrl === null) {
    patch.photoUrl = null;
  } else if (typeof body.photoDataUrl === "string" && body.photoDataUrl) {
    try {
      patch.photoUrl = await storePhoto(property.id, body.photoDataUrl);
    } catch (err) {
      return NextResponse.json({ error: err instanceof Error ? err.message : "อัปโหลดรูปไม่สำเร็จ" }, { status: 400 });
    }
  }

  // ข้อมูลบัญชีที่พิมพ์ลงใบแจ้งหนี้ — เขียนทั้งก้อนเสมอ จะได้ไม่มี field ค้างจากของเดิม
  if (body.payment || body.qrDataUrl !== undefined) {
    const current: PaymentInfo = property.payment ?? {
      method: "", accountName: "", accountNo: "", reference: "", qrUrl: null, note: "",
    };
    const next: PaymentInfo = {
      method: text(body.payment?.method) ?? current.method,
      accountName: text(body.payment?.accountName) ?? current.accountName,
      accountNo: text(body.payment?.accountNo) ?? current.accountNo,
      reference: text(body.payment?.reference) ?? current.reference,
      note: text(body.payment?.note) ?? current.note,
      qrUrl: current.qrUrl,
    };

    if (body.qrDataUrl === null) {
      next.qrUrl = null;
    } else if (typeof body.qrDataUrl === "string" && body.qrDataUrl) {
      try {
        next.qrUrl = await storePhoto(`${property.id}-qr`, body.qrDataUrl);
      } catch (err) {
        return NextResponse.json({ error: err instanceof Error ? err.message : "อัปโหลด QR ไม่สำเร็จ" }, { status: 400 });
      }
    }

    patch.payment = next;
  }

  if (Object.keys(patch).length === 0) return NextResponse.json({ error: "ไม่มีอะไรให้แก้" }, { status: 400 });

  await db().update("properties", property.id, patch);
  await audit(user, {
    propertyId: property.id, action: "property.update", targetType: "property", targetId: property.id,
    before: { name: property.name, address: property.address, phone: property.phone },
    after: {
      ...patch,
      photoUrl: patch.photoUrl ? "(อัปโหลดรูปใหม่)" : patch.photoUrl,
      payment: patch.payment
        ? { ...(patch.payment as PaymentInfo), qrUrl: (patch.payment as PaymentInfo).qrUrl ? "(มีรูป QR)" : null }
        : undefined,
    },
  });

  return NextResponse.json({ ok: true });
}
