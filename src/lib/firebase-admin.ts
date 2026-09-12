import "server-only";
import { cert, getApp, getApps, initializeApp, type App } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

/**
 * รหัสโปรเจกต์กับ bucket ใช้ค่าเดียวกับฝั่ง client ได้ ไม่ต้องตั้งซ้ำ
 * จะตั้งแยกก็ได้ถ้าอยากชี้คนละโปรเจกต์
 */
export const projectId = () =>
  process.env.FIREBASE_PROJECT_ID ?? process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;

export const storageBucket = () =>
  process.env.FIREBASE_STORAGE_BUCKET ?? process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;

/** ค่าที่ขาดอยู่ — ใช้บอกในหน้าล็อกอินว่ายังต้องตั้งอะไรอีก */
export function missingFirebaseEnv(): string[] {
  const missing: string[] = [];
  if (!projectId()) missing.push("FIREBASE_PROJECT_ID");
  if (!process.env.FIREBASE_CLIENT_EMAIL) missing.push("FIREBASE_CLIENT_EMAIL");
  if (!process.env.FIREBASE_PRIVATE_KEY) missing.push("FIREBASE_PRIVATE_KEY");
  return missing;
}

/** ตั้งค่า Firebase ครบหรือยัง — ถ้ายัง แอปจะรันในโหมดสาธิตด้วยข้อมูล V2 ในเครื่อง */
export function isFirebaseConfigured(): boolean {
  return missingFirebaseEnv().length === 0;
}

let cached: App | null = null;

export function adminApp(): App {
  if (cached) return cached;
  if (!isFirebaseConfigured()) {
    throw new Error("ยังไม่ได้ตั้งค่า Firebase — ดู .env.example");
  }
  cached = getApps().length
    ? getApp()
    : initializeApp({
        credential: cert({
          projectId: projectId(),
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          // Vercel เก็บ newline เป็น \n ต้องแปลงกลับ
          privateKey: process.env.FIREBASE_PRIVATE_KEY!.replace(/\\n/g, "\n"),
        }),
        storageBucket: storageBucket(),
      });
  return cached;
}

export const adminDb = () => getFirestore(adminApp());
export const adminAuth = () => getAuth(adminApp());
