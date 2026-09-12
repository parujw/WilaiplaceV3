/**
 * ย้ายข้อมูลจากวิไลเพลส V2 (Google Sheets export) เข้า Firestore ของ V3
 *
 *   npm run migrate:v2 -- --dry-run     ดูผลก่อน ไม่เขียนอะไร
 *   npm run migrate:v2                  เขียนจริง
 *   npm run migrate:v2 -- --force       เขียนทับของเดิมที่มีอยู่แล้ว
 *
 * รันได้หลายครั้ง — ใช้ id เดิมเสมอ ไม่สร้างซ้ำ
 * ก่อนรัน: ตรวจข้อมูลใน V2 ให้ตรงกันก่อน ข้อมูลเพี้ยนที่ย้ายมาจะเพี้ยนต่อ
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { cert, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { migrateV2, type V2Export } from "../src/lib/migrate/from-v2.ts";

const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run");
const force = args.has("--force");

try {
  process.loadEnvFile(path.join(process.cwd(), ".env.local"));
} catch {
  // ไม่มี .env.local ก็ไม่เป็นไร ถ้าตั้ง env มาทางอื่นแล้ว
}

const v2 = JSON.parse(readFileSync(path.join(process.cwd(), "data/v2-export.json"), "utf8")) as V2Export;
const result = migrateV2(v2);

const collections = {
  properties: [result.property],
  rooms: result.rooms,
  tenants: result.tenants,
  leases: result.leases,
  meterReadings: result.meterReadings,
  bills: result.bills,
  payments: result.payments,
  utilityCosts: result.utilityCosts,
} as const;

console.log("=== สรุปข้อมูลที่จะย้าย ===");
for (const [name, docs] of Object.entries(collections)) {
  console.log(`  ${name.padEnd(16)} ${docs.length} เอกสาร`);
}

if (result.issues.length > 0) {
  console.log(`\n=== ข้อมูล V2 ที่ไม่ตรงกัน (${result.issues.length} รายการ) ===`);
  for (const issue of result.issues) console.log(`  • ${issue}`);
  console.log("\nรายการเหล่านี้ย้ายเข้าไปตามที่เป็น ควรตามแก้ใน V3 หลังย้ายเสร็จ");
}

// เลขรันต้องต่อจากของเดิม ไม่ใช่เริ่มใหม่ที่ 1
const lastSeq = (values: string[], prefix: string) =>
  values.reduce((max, no) => (no.startsWith(prefix) ? Math.max(max, Number(no.slice(-4)) || 0) : max), 0);

const counters = {
  bill: lastSeq(result.bills.map((b) => b.billNo), "BILL-"),
  invoice: lastSeq(result.bills.map((b) => b.invoiceNo), "INV-"),
  receipt: lastSeq(result.payments.map((p) => p.receiptNo), "WLP-"),
  maintenance: Number(v2.settings.seq_maintenance ?? 0),
};
console.log("\n=== เลขรันที่จะตั้งต่อ ===");
for (const [key, value] of Object.entries(counters)) console.log(`  ${key.padEnd(12)} ${value}`);

if (dryRun) {
  console.log("\n--dry-run: ไม่ได้เขียนอะไรลง Firestore");
  process.exit(0);
}

const { FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY } = process.env;
if (!FIREBASE_PROJECT_ID || !FIREBASE_CLIENT_EMAIL || !FIREBASE_PRIVATE_KEY) {
  console.error("\nยังไม่ได้ตั้ง FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY");
  process.exit(1);
}

initializeApp({
  credential: cert({
    projectId: FIREBASE_PROJECT_ID,
    clientEmail: FIREBASE_CLIENT_EMAIL,
    privateKey: FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
  }),
});
const db = getFirestore();

let written = 0;
let skipped = 0;

for (const [name, docs] of Object.entries(collections)) {
  // Firestore รับได้ 500 เขียนต่อ batch
  for (let i = 0; i < docs.length; i += 400) {
    const chunk = docs.slice(i, i + 400);
    const existing = force
      ? []
      : (await Promise.all(chunk.map((d) => db.collection(name).doc(d.id).get())))
          .filter((s) => s.exists)
          .map((s) => s.id);
    const existingIds = new Set(existing);

    const batch = db.batch();
    let count = 0;
    for (const doc of chunk) {
      if (existingIds.has(doc.id)) {
        skipped++;
        continue;
      }
      batch.set(db.collection(name).doc(doc.id), doc);
      count++;
    }
    if (count > 0) await batch.commit();
    written += count;
  }
  console.log(`  เขียน ${name} เรียบร้อย`);
}

const counterBatch = db.batch();
for (const [key, value] of Object.entries(counters)) {
  counterBatch.set(db.collection("counters").doc(key), { id: key, value }, { merge: !force });
}
counterBatch.set(
  db.collection("counters").doc("migrationIssues"),
  { id: "migrationIssues", value: result.issues.length, issues: result.issues },
);
await counterBatch.commit();

console.log(`\nเสร็จแล้ว — เขียน ${written} เอกสาร, ข้าม ${skipped} เอกสารที่มีอยู่แล้ว`);
if (skipped > 0 && !force) console.log("ถ้าต้องการเขียนทับให้รันใหม่ด้วย --force");
