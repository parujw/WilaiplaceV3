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

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { cert, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { applyMigration, collectionsOf, countersOf } from "../src/lib/migrate/apply.ts";
import { migrateV2, type V2Export } from "../src/lib/migrate/from-v2.ts";

const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run");
const force = args.has("--force");

try {
  process.loadEnvFile(path.join(process.cwd(), ".env.local"));
} catch {
  // ไม่มี .env.local ก็ไม่เป็นไร ถ้าตั้ง env มาทางอื่นแล้ว
}

const exportPath = path.join(process.cwd(), "data/v2-export.json");
if (!existsSync(exportPath)) {
  console.error(
    [
      `ไม่พบ ${exportPath}`,
      "",
      "ไฟล์นี้มีข้อมูลผู้เช่าจริงจึงไม่เก็บใน git — ต้องวางเองในเครื่องก่อนย้ายข้อมูล",
      "โครงสร้างดูได้จาก data/v2-export.sample.json (ชื่อเป็นของสมมติ)",
    ].join("\n"),
  );
  process.exit(1);
}

const v2 = JSON.parse(readFileSync(exportPath, "utf8")) as V2Export;
const result = migrateV2(v2);

console.log("=== สรุปข้อมูลที่จะย้าย ===");
for (const { name, docs } of collectionsOf(result)) {
  console.log(`  ${name.padEnd(16)} ${docs.length} เอกสาร`);
}

if (result.issues.length > 0) {
  console.log(`\n=== ข้อมูล V2 ที่ไม่ตรงกัน (${result.issues.length} รายการ) ===`);
  for (const issue of result.issues) console.log(`  • ${issue}`);
  console.log("\nรายการเหล่านี้ย้ายเข้าไปตามที่เป็น ควรตามแก้ใน V3 หลังย้ายเสร็จ");
}

const counters = countersOf(result, v2);
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
const firestore = getFirestore();
// ให้เหมือนฝั่งแอป — undefined แปลว่าไม่ได้ตั้งค่านั้น ไม่ใช่ค่าที่ต้องเก็บ
firestore.settings({ ignoreUndefinedProperties: true });

const report = await applyMigration(
  {
    async existingIds(collection: string, ids: string[]) {
      // select() ไม่เอา field ใดเลย ได้แค่รายชื่อ id มาเทียบ อ่านรอบเดียวจบ
      const snapshot = await firestore.collection(collection).select().get();
      const present = new Set(snapshot.docs.map((d) => d.id));
      return new Set(ids.filter((id) => present.has(id)));
    },
    async write(docs) {
      if (docs.length === 0) return;
      const batch = firestore.batch();
      for (const doc of docs) batch.set(firestore.collection(doc.collection).doc(doc.id), doc.data);
      await batch.commit();
    },
  },
  result,
  v2,
  { force },
);

for (const row of report.byCollection) {
  console.log(`  ${row.collection.padEnd(16)} เขียน ${row.written} ข้าม ${row.skipped}`);
}

console.log(`\nเสร็จแล้ว — เขียน ${report.written} เอกสาร, ข้าม ${report.skipped} เอกสารที่มีอยู่แล้ว`);
if (report.skipped > 0 && !force) console.log("ถ้าต้องการเขียนทับให้รันใหม่ด้วย --force");
