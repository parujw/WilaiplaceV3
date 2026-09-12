import "server-only";
import { cert, getApp, getApps, initializeApp, type App } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { env } from "./env";
import { projectId, storageBucket } from "./firebase-config";

/** ตั้งค่าฝั่ง server ครบหรือยัง — ถ้ายัง แอปจะรันในโหมดสาธิตด้วยข้อมูล V2 ในเครื่อง */
export function isFirebaseConfigured(): boolean {
  return Boolean(projectId() && env("FIREBASE_CLIENT_EMAIL") && env("FIREBASE_PRIVATE_KEY"));
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
          clientEmail: env("FIREBASE_CLIENT_EMAIL"),
          // Vercel เก็บ newline เป็น \n ต้องแปลงกลับ
          privateKey: env("FIREBASE_PRIVATE_KEY")!.replace(/\\n/g, "\n"),
        }),
        storageBucket: storageBucket(),
      });
  return cached;
}

let cachedDb: ReturnType<typeof getFirestore> | null = null;

export function adminDb() {
  if (cachedDb) return cachedDb;
  const instance = getFirestore(adminApp());
  // Firestore โยน error ถ้าเจอ undefined ในเอกสาร แต่ในโค้ดเรา undefined แปลว่า
  // "ไม่ได้ตั้งค่านี้" ไม่ใช่ค่าที่ต้องเก็บ ให้ข้ามไปเลยเหมือนที่ JSON ทำ
  // ที่เก็บข้อมูลสองแบบจะได้ทำงานเหมือนกัน ไม่ใช่พังเฉพาะบน Firestore
  // ต้องเรียก settings() ก่อนใช้งานครั้งแรก และเรียกซ้ำไม่ได้ จึง cache ไว้
  instance.settings({ ignoreUndefinedProperties: true });
  cachedDb = instance;
  return cachedDb;
}
export const adminAuth = () => getAuth(adminApp());
