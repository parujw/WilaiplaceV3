import "server-only";
import { cert, getApp, getApps, initializeApp, type App } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

/** ตั้งค่า Firebase ครบหรือยัง — ถ้ายัง แอปจะรันในโหมดสาธิตด้วยข้อมูล V2 ในเครื่อง */
export function isFirebaseConfigured(): boolean {
  return Boolean(
    process.env.FIREBASE_PROJECT_ID &&
      process.env.FIREBASE_CLIENT_EMAIL &&
      process.env.FIREBASE_PRIVATE_KEY,
  );
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
          projectId: process.env.FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          // Vercel เก็บ newline เป็น \n ต้องแปลงกลับ
          privateKey: process.env.FIREBASE_PRIVATE_KEY!.replace(/\\n/g, "\n"),
        }),
        storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
      });
  return cached;
}

export const adminDb = () => getFirestore(adminApp());
export const adminAuth = () => getAuth(adminApp());
