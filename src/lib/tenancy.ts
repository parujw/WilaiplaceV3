/**
 * การเช่าหนึ่งครั้งอาจกินหลายสัญญา — คำนวณล้วน ไม่แตะฐานข้อมูล
 *
 * ผู้เช่าคนหนึ่งย้ายจากห้อง 502 ไป 503 ในระบบคือสัญญาสองฉบับ
 * แต่ในความเป็นจริงคือการเช่าต่อเนื่องครั้งเดียว หนี้เก่ายังเป็นหนี้ของเขา
 * และเงินประกันก้อนเดิมก็ยังเป็นก้อนเดิม
 *
 * ไฟล์นี้ร้อยสัญญาที่ต่อกันด้วย transferredFrom กลับเป็นการเช่าครั้งเดียว
 *
 * ทำไมต้องมี: เดิมยอดค้างของห้องคิดจาก roomId อย่างเดียว
 * พอผู้เช่าเก่าย้ายออกโดยยังค้างเงิน ผู้เช่าใหม่ที่เข้ามาห้องนั้นจะเห็นหนี้ของคนเก่า
 * และร้ายกว่านั้นคือตอนออกบิล ยอดค้างเก่าจะถูกยกมาใส่บิลของผู้เช่าใหม่
 * กลายเป็นเรียกเก็บเงินผิดคนจริงๆ ไม่ใช่แค่แสดงผลผิด
 */

import type { Bill, Lease } from "./types";

/**
 * รหัสสัญญาทั้งหมดที่เป็นการเช่าครั้งเดียวกันกับสัญญาที่ให้มา
 * ไล่ย้อนตาม transferredFrom กลับไปจนสุดสาย
 */
export function tenancyLeaseIds(leases: Lease[], leaseId: string | null): Set<string> {
  const ids = new Set<string>();
  if (!leaseId) return ids;

  const byId = new Map(leases.map((l) => [l.id, l]));
  let current: string | undefined = leaseId;

  // กันลูปไว้ด้วย ข้อมูลเสียหายไม่ควรทำให้ทั้งหน้าค้าง
  while (current && !ids.has(current)) {
    ids.add(current);
    current = byId.get(current)?.transferredFrom;
  }
  return ids;
}

/**
 * ยอดค้างของผู้เช่าที่อยู่ห้องนี้ตอนนี้
 *
 * นับบิลของสัญญาในสายการเช่าเดียวกัน บวกบิลที่ไม่ได้ผูกสัญญาแต่ออกในชื่อคนเดียวกัน
 * (เช่น บิลมัดจำตอนจองที่ออกก่อนทำสัญญา)
 * บิลของผู้เช่าคนก่อนไม่นับ — หนี้นั้นยังอยู่ในระบบและตามตัวเขาได้จากหน้าผู้เช่า
 * แค่ไม่ใช่หนี้ของคนที่อยู่ห้องนี้ตอนนี้
 */
export function outstandingOfTenancy(
  bills: Bill[],
  leaseIds: Set<string>,
  tenantId: string | null,
): number {
  return bills
    .filter((b) => b.status !== "void" && b.balance > 0)
    .filter((b) =>
      b.leaseId ? leaseIds.has(b.leaseId) : Boolean(tenantId) && b.tenantSnapshot.tenantId === tenantId,
    )
    .reduce((sum, b) => sum + b.balance, 0);
}

/** ยอดค้างจากรอบก่อนๆ ที่ต้องยกมาใส่บิลใหม่ — ของการเช่าครั้งนี้เท่านั้น */
export function carryOverFor(
  bills: Bill[],
  leaseIds: Set<string>,
  tenantId: string | null,
  beforeCycle: string,
): number {
  return outstandingOfTenancy(
    bills.filter((b) => b.cycle < beforeCycle),
    leaseIds,
    tenantId,
  );
}
