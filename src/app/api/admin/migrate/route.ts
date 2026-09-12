import { NextResponse } from "next/server";
import { db, isFirebaseConfigured } from "@/lib/db";
import { applyMigration, collectionsOf } from "@/lib/migrate/apply";
import { migrateV2, type V2Export } from "@/lib/migrate/from-v2";
import { audit } from "@/lib/repo";
import { getSessionUser } from "@/lib/session";
import type { CollectionName, Store } from "@/lib/db/store";
import type { AllowlistEntry } from "@/lib/types";

/**
 * ย้ายข้อมูล V2 เข้า Firestore โดยไม่ต้องใช้ terminal
 * เจ้าของอัปโหลดไฟล์ export จากหน้าตั้งค่า ดูผลก่อน แล้วค่อยกดยืนยัน
 */

const MAX_BYTES = 5_000_000;

function targetFor(store: Store) {
  return {
    async exists(collection: string, id: string) {
      return (await store.get(collection as CollectionName, id)) !== null;
    },
    async write(docs: Array<{ collection: string; id: string; data: Record<string, unknown> }>) {
      if (docs.length === 0) return;
      await store.batch(
        docs.map((d) => ({
          type: "set" as const,
          collection: d.collection as CollectionName,
          id: d.id,
          data: d.data,
        })),
      );
    },
  };
}

function looksLikeV2Export(value: unknown): value is V2Export {
  const v = value as Partial<V2Export> | null;
  return Boolean(
    v && typeof v === "object" &&
      v.property && v.settings &&
      Array.isArray(v.rooms) && Array.isArray(v.tenants) &&
      Array.isArray(v.bills) && Array.isArray(v.payments),
  );
}

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "ยังไม่ได้ล็อกอิน" }, { status: 401 });
  if (user.role !== "owner") {
    return NextResponse.json({ error: "เฉพาะเจ้าของเท่านั้นที่ย้ายข้อมูลได้" }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as {
    export?: unknown;
    dryRun?: boolean;
    force?: boolean;
  } | null;

  if (!body?.export) return NextResponse.json({ error: "ไม่มีไฟล์ข้อมูล" }, { status: 400 });
  if (JSON.stringify(body.export).length > MAX_BYTES) {
    return NextResponse.json({ error: "ไฟล์ใหญ่เกินไป" }, { status: 413 });
  }
  if (!looksLikeV2Export(body.export)) {
    return NextResponse.json(
      { error: "ไฟล์นี้ไม่ใช่ export ของ V2 — ต้องมี property, settings, rooms, tenants, bills, payments" },
      { status: 400 },
    );
  }

  const v2 = body.export;

  let result;
  try {
    result = migrateV2(v2);
  } catch (err) {
    return NextResponse.json(
      { error: `แปลงข้อมูลไม่สำเร็จ: ${err instanceof Error ? err.message : "ไม่ทราบสาเหตุ"}` },
      { status: 400 },
    );
  }

  const store = db();
  const target = targetFor(store);

  // ดูก่อนว่าจะเขียนอะไรบ้าง ยังไม่แตะข้อมูล
  if (body.dryRun !== false) {
    const preview = [];
    for (const { name, docs } of collectionsOf(result)) {
      let existing = 0;
      for (const doc of docs) if (await target.exists(name, doc.id)) existing++;
      preview.push({ collection: name, total: docs.length, existing });
    }
    return NextResponse.json({
      ok: true,
      dryRun: true,
      storeMode: store.mode,
      firestore: isFirebaseConfigured(),
      preview,
      issues: result.issues,
    });
  }

  const report = await applyMigration(target, result, v2, { force: body.force === true });

  // ให้เจ้าของเข้าได้ต่อแม้ภายหลังจะถอด OWNER_EMAILS ออกจาก env
  const email = user.email.toLowerCase();
  if (!(await store.get<AllowlistEntry>("allowlist", email))) {
    await store.set("allowlist", email, {
      email,
      role: "owner",
      name: user.name,
      photoUrl: user.photoUrl,
      propertyIds: [],
    });
  }

  await audit(user, {
    propertyId: result.property.id,
    action: "data.migrate-v2",
    targetType: "property",
    targetId: result.property.id,
    before: null,
    after: { written: report.written, skipped: report.skipped, counters: report.counters },
  });

  return NextResponse.json({
    ok: true,
    dryRun: false,
    storeMode: store.mode,
    firestore: isFirebaseConfigured(),
    report,
    issues: result.issues,
  });
}
