import "server-only";
import { isFirebaseConfigured } from "../firebase-admin";
import { firestoreStore } from "./firestore";
import { localStore, localStoreIsPersistent } from "./local";
import type { Store } from "./store";

/**
 * เลือกที่เก็บข้อมูลตามการตั้งค่า
 *   ตั้งค่า Firebase ครบ  → Firestore (ของจริง)
 *   ยังไม่ได้ตั้ง         → ไฟล์ในเครื่องที่ย้ายข้อมูล V2 มาแล้ว (โหมดสาธิต)
 */
export function db(): Store {
  return isFirebaseConfigured() ? firestoreStore : localStore;
}

/** true = แก้ไขแล้วข้อมูลค้างอยู่ / false = อยู่ในหน่วยความจำ หายเมื่อเซิร์ฟเวอร์รีสตาร์ต */
export function storeIsPersistent(): boolean {
  return isFirebaseConfigured() || localStoreIsPersistent();
}

export { isFirebaseConfigured };
export type { Store } from "./store";
