import "server-only";

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

const apiKey = () => process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? process.env.FIREBASE_API_KEY;

export const projectId = () =>
  process.env.FIREBASE_PROJECT_ID ?? process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;

export const storageBucket = () =>
  process.env.FIREBASE_STORAGE_BUCKET ??
  process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ??
  (projectId() ? `${projectId()}.firebasestorage.app` : undefined);

/** null = ตั้งค่าไม่ครบ ล็อกอิน Google ไม่ได้ */
export function webConfig(): FirebaseWebConfig | null {
  const key = apiKey();
  const project = projectId();
  if (!key || !project) return null;

  return {
    apiKey: key,
    // ค่าเริ่มต้นของ Firebase เสมอ ไม่ต้องตั้งเองถ้าไม่ได้ใช้โดเมนพิเศษ
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? `${project}.firebaseapp.com`,
    projectId: project,
    storageBucket: storageBucket() ?? `${project}.firebasestorage.app`,
  };
}

/** ค่าที่ขาดอยู่ — ใช้บอกในหน้าล็อกอินว่ายังต้องตั้งอะไรอีก (ชื่อตัวแปรเท่านั้น ไม่ใช่ค่า) */
export function missingFirebaseEnv(): string[] {
  const missing: string[] = [];
  if (!projectId()) missing.push("NEXT_PUBLIC_FIREBASE_PROJECT_ID");
  if (!apiKey()) missing.push("NEXT_PUBLIC_FIREBASE_API_KEY");
  if (!process.env.FIREBASE_CLIENT_EMAIL) missing.push("FIREBASE_CLIENT_EMAIL");
  if (!process.env.FIREBASE_PRIVATE_KEY) missing.push("FIREBASE_PRIVATE_KEY");
  return missing;
}
