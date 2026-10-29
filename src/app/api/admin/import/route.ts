import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import type { CollectionName, WriteOp } from "@/lib/db/store";
import { planImport, type ImportPlan } from "@/lib/import/new-property";
import { readWorkbook, WorkbookError } from "@/lib/import/xlsx";
import { audit, getProperty } from "@/lib/repo";
import { getSessionUser } from "@/lib/session";

/**
 * นำเข้าอาคารใหม่จากไฟล์ Excel
 *
 * ส่งไฟล์มาสองรอบ — รอบแรก dryRun ตรวจทุกแถวแล้วบอกผลโดยไม่แตะข้อมูล
 * รอบสองเมื่อเจ้าของกดยืนยัน ตรวจซ้ำทั้งหมดอีกครั้งแล้วค่อยเขียน
 * ไม่เชื่อผลของรอบแรก เพราะระหว่างนั้นอาจมีคนสร้างอาคารรหัสเดียวกันหรือเพิ่มผู้เช่าไปแล้ว
 */

const MAX_BYTES = 5_000_000;

export const maxDuration = 60;

function summary(plan: ImportPlan) {
  return {
    propertyId: plan.property.id,
    propertyName: plan.property.name,
    firstCycle: plan.firstCycle,
    rooms: plan.rooms.length,
    occupied: plan.leases.length,
    vacant: plan.rooms.length - plan.leases.length,
    meterReadings: plan.meterReadings.length,
    rates: plan.property.defaultRates,
    roomList: plan.rooms.map((room) => {
      const lease = plan.leases.find((l) => l.id === room.activeLeaseId);
      const tenant = plan.tenants.find((t) => t.id === lease?.tenantId);
      const reading = plan.meterReadings.find((r) => r.roomId === room.id);
      return {
        roomNo: room.roomNo,
        floor: room.floor,
        tenant: tenant?.name ?? null,
        rent: lease?.rent ?? room.baseRent,
        elec: reading?.elecCurrent ?? null,
        water: reading?.waterCurrent ?? null,
      };
    }),
  };
}

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "ยังไม่ได้ล็อกอิน" }, { status: 401 });
  if (user.role !== "owner") {
    return NextResponse.json({ error: "เฉพาะเจ้าของเท่านั้นที่เพิ่มอาคารได้" }, { status: 403 });
  }

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "ไม่มีไฟล์" }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "ไฟล์ใหญ่เกิน 5 MB" }, { status: 413 });
  const dryRun = form?.get("dryRun") !== "false";

  let sheets;
  try {
    sheets = await readWorkbook(await file.arrayBuffer());
  } catch (err) {
    if (err instanceof WorkbookError) return NextResponse.json({ error: err.message }, { status: 400 });
    throw err;
  }

  const store = db();
  // รหัสผู้เช่าใช้ร่วมกันทุกอาคาร ต้องต่อเลขจากของทุกอาคาร ไม่ใช่เริ่ม T0001 ใหม่แล้วทับของอาคารแรก
  const existingTenantIds = (await store.list<{ id: string }>("tenants")).map((t) => t.id);
  const { plan, errors, warnings } = planImport({
    ...sheets,
    existingTenantIds,
    today: new Date().toISOString().slice(0, 10),
  });

  if (plan && (await getProperty(plan.property.id))) {
    errors.push({
      sheet: "อาคาร",
      row: null,
      message: `มีอาคารรหัส ${plan.property.id} อยู่ในระบบแล้ว — ใช้รหัสอื่น หรือแก้อาคารเดิมในแอปแทน`,
    });
  }

  if (!plan || errors.length > 0) {
    return NextResponse.json({ ok: false, errors, warnings }, { status: 422 });
  }

  if (dryRun) {
    return NextResponse.json({ ok: true, dryRun: true, summary: summary(plan), warnings });
  }

  const docs: Array<[CollectionName, Array<{ id: string }>]> = [
    ["rooms", plan.rooms],
    ["tenants", plan.tenants],
    ["leases", plan.leases],
    ["meterReadings", plan.meterReadings],
    // อาคารเขียนท้ายสุด พังกลางทางแล้วจะไม่มีอาคารครึ่งๆ กลางๆ โผล่ในหน้าเลือกอาคาร
    ["properties", [plan.property]],
  ];
  const ops: WriteOp[] = docs.flatMap(([collection, items]) =>
    items.map((item) => ({ type: "set" as const, collection, id: item.id, data: item as unknown as Record<string, unknown> })),
  );
  // Firestore รับได้ 500 การเขียนต่อ batch
  for (let i = 0; i < ops.length; i += 400) await store.batch(ops.slice(i, i + 400));

  await audit(user, {
    propertyId: plan.property.id,
    action: "property.import-xlsx",
    targetType: "property",
    targetId: plan.property.id,
    before: null,
    after: {
      rooms: plan.rooms.length,
      tenants: plan.tenants.length,
      leases: plan.leases.length,
      meterReadings: plan.meterReadings.length,
      firstCycle: plan.firstCycle,
    },
  });

  return NextResponse.json({ ok: true, dryRun: false, summary: summary(plan), warnings });
}
