import "server-only";
import { env } from "./env";

/**
 * Firebase web config ที่ส่งให้ฝั่ง client
 *
 * อ่านตอนรัน ไม่ใช่ตอน build แล้วส่งเป็น prop ลงไป
 * เพราะ NEXT_PUBLIC_* ถูกฝังลงในไฟล์ตอน build ถ้า deploy ซ้ำโดยใช้ build cache เดิม
 * ค่าที่เพิ่งตั้งใน Vercel จะไม่เข้าไปด้วย และหน้าเว็บจะพังแบบเงียบๆ หาสาเหตุยาก
 *
 * ค่าพวกนี้ไม่ใช่ความลับ ถูกส่งไปกับหน้าเว็บอยู่แล้วตามการออกแบบของ Firebase
 */
export interface FirebaseWebConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
}

const apiKey = () => env("NEXT_PUBLIC_FIREBASE_API_KEY") ?? env("FIREBASE_API_KEY");

export const projectId = () => env("FIREBASE_PROJECT_ID") ?? env("NEXT_PUBLIC_FIREBASE_PROJECT_ID");

export const storageBucket = () => bucketCandidates()[0];

/**
 * ชื่อ bucket ที่เป็นไปได้ เรียงจากน่าจะใช่ที่สุด
 *
 * Firebase เปลี่ยนรูปแบบชื่อกลางทาง โปรเจกต์ที่สร้างใหม่ได้ .firebasestorage.app
 * ส่วนของเก่าเป็น .appspot.com เดาผิดทีเดียวจะได้ "The specified bucket does not exist"
 * ซึ่งอ่านแล้วนึกว่ายังไม่ได้เปิด Storage ทั้งที่เปิดแล้วแต่ชื่อคนละแบบ
 * ตั้ง FIREBASE_STORAGE_BUCKET เองเมื่อไหร่ ใช้ค่านั้นอย่างเดียว ไม่ต้องเดา
 */
export function bucketCandidates(): string[] {
  const explicit = env("FIREBASE_STORAGE_BUCKET") ?? env("NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET");
  if (explicit) return [explicit];

  const project = projectId();
  if (!project) return [];
  return [`${project}.firebasestorage.app`, `${project}.appspot.com`];
}

/** null = ตั้งค่าไม่ครบ ล็อกอิน Google ไม่ได้ */
export function webConfig(): FirebaseWebConfig | null {
  const key = apiKey();
  const project = projectId();
  if (!key || !project) return null;

  return {
    apiKey: key,
    // ค่าเริ่มต้นของ Firebase เสมอ ไม่ต้องตั้งเองถ้าไม่ได้ใช้โดเมนพิเศษ
    authDomain: env("NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN") ?? `${project}.firebaseapp.com`,
    projectId: project,
    storageBucket: storageBucket() ?? `${project}.firebasestorage.app`,
  };
}

/** ค่าที่ขาดอยู่ — ใช้บอกในหน้าล็อกอินว่ายังต้องตั้งอะไรอีก (ชื่อตัวแปรเท่านั้น ไม่ใช่ค่า) */
export function missingFirebaseEnv(): string[] {
  const missing: string[] = [];
  if (!projectId()) missing.push("NEXT_PUBLIC_FIREBASE_PROJECT_ID");
  if (!apiKey()) missing.push("NEXT_PUBLIC_FIREBASE_API_KEY");
  if (!env("FIREBASE_CLIENT_EMAIL")) missing.push("FIREBASE_CLIENT_EMAIL");
  if (!env("FIREBASE_PRIVATE_KEY")) missing.push("FIREBASE_PRIVATE_KEY");
  return missing;
}
