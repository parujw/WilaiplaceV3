/**
 * เขียนผลการแปลงข้อมูล V2 ลงที่เก็บข้อมูล
 *
 * แยกออกมาเพราะมีคนเรียกสองทาง และต้องได้ผลเหมือนกันเป๊ะ
 *   scripts/migrate-v2.ts       — รันจากเครื่องตัวเอง (สำหรับคนที่ใช้ terminal เป็น)
 *   /api/admin/migrate          — กดจากในแอป (สำหรับคนที่ไม่ใช้ terminal)
 */

import type { MigrationResult, V2Export } from "./from-v2";

export interface MigrationDoc {
  collection: string;
  id: string;
  data: Record<string, unknown>;
}

/** ที่เก็บข้อมูลปลายทาง — Firestore ตรงๆ หรือผ่าน Store ก็ได้ */
export interface MigrationTarget {
  exists(collection: string, id: string): Promise<boolean>;
  write(docs: MigrationDoc[]): Promise<void>;
}

export interface ApplyReport {
  written: number;
  skipped: number;
  byCollection: Array<{ collection: string; total: number; written: number; skipped: number }>;
  counters: Record<string, number>;
}

export function collectionsOf(result: MigrationResult): Array<{ name: string; docs: Array<{ id: string }> }> {
  return [
    { name: "properties", docs: [result.property] },
    { name: "rooms", docs: result.rooms },
    { name: "tenants", docs: result.tenants },
    { name: "leases", docs: result.leases },
    { name: "meterReadings", docs: result.meterReadings },
    { name: "bills", docs: result.bills },
    { name: "payments", docs: result.payments },
    { name: "utilityCosts", docs: result.utilityCosts },
  ];
}

/** เลขรันต้องต่อจากของเดิม ไม่ใช่เริ่มใหม่ที่ 1 ไม่งั้นเลขซ้ำกับบิลเก่า */
export function countersOf(result: MigrationResult, v2: V2Export): Record<string, number> {
  const lastSeq = (values: string[], prefix: string) =>
    values.reduce((max, no) => (no.startsWith(prefix) ? Math.max(max, Number(no.slice(-4)) || 0) : max), 0);

  return {
    bill: lastSeq(result.bills.map((b) => b.billNo), "BILL-"),
    invoice: lastSeq(result.bills.map((b) => b.invoiceNo), "INV-"),
    receipt: lastSeq(result.payments.map((p) => p.receiptNo), "WLP-"),
    maintenance: Number(v2.settings.seq_maintenance ?? 0),
  };
}

export async function applyMigration(
  target: MigrationTarget,
  result: MigrationResult,
  v2: V2Export,
  options: { force?: boolean } = {},
): Promise<ApplyReport> {
  const counters = countersOf(result, v2);
  const report: ApplyReport = { written: 0, skipped: 0, byCollection: [], counters };

  for (const { name, docs } of collectionsOf(result)) {
    const pending: MigrationDoc[] = [];
    let skipped = 0;

    for (const doc of docs) {
      if (!options.force && (await target.exists(name, doc.id))) {
        skipped++;
        continue;
      }
      pending.push({ collection: name, id: doc.id, data: doc as unknown as Record<string, unknown> });
    }

    // แบ่งเป็นก้อน Firestore รับได้ 500 เขียนต่อ batch
    for (let i = 0; i < pending.length; i += 400) {
      await target.write(pending.slice(i, i + 400));
    }

    report.written += pending.length;
    report.skipped += skipped;
    report.byCollection.push({ collection: name, total: docs.length, written: pending.length, skipped });
  }

  await target.write([
    ...Object.entries(counters).map(([id, value]) => ({
      collection: "counters",
      id,
      data: { id, value },
    })),
    {
      collection: "counters",
      id: "migrationIssues",
      data: { id: "migrationIssues", value: result.issues.length, issues: result.issues },
    },
  ]);

  return report;
}
