import "server-only";
import { getStorage } from "firebase-admin/storage";
import { adminApp, isFirebaseConfigured } from "./firebase-admin";
import { storageBucket } from "./firebase-config";

/**
 * เก็บไฟล์ไว้บน Firebase Storage แล้วคืนที่อยู่สาธารณะ
 *
 * ใช้กับไฟล์ที่ระบบอื่นต้องมาดึงเอง — เช่น LINE ต้องดึงรูปใบแจ้งหนี้จาก URL ของเรา
 * ส่ง data URL ไปให้ไม่ได้ และจะให้ LINE มาเรียกเส้นที่ต้องวาดใหม่ทุกครั้งก็ช้าเกินไป
 * วาดครั้งเดียวเก็บไว้ แล้วส่งแต่ที่อยู่
 */
export async function uploadPublic(
  path: string,
  bytes: Buffer,
  contentType: string,
): Promise<string> {
  const bucketName = storageBucket();
  if (!isFirebaseConfigured() || !bucketName) {
    throw new Error(
      "ยังไม่ได้ตั้งค่า Firebase Storage จึงเก็บไฟล์ให้ระบบภายนอกมาดึงไม่ได้ — ตั้ง FIREBASE_STORAGE_BUCKET ก่อน",
    );
  }

  const file = getStorage(adminApp()).bucket(bucketName).file(path);
  await file.save(bytes, {
    contentType,
    resumable: false,
    metadata: { cacheControl: "public, max-age=31536000" },
  });
  await file.makePublic();

  return `https://storage.googleapis.com/${bucketName}/${file.name}`;
}
