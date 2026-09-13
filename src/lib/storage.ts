import "server-only";
import { getStorage } from "firebase-admin/storage";
import { adminApp, isFirebaseConfigured } from "./firebase-admin";
import { bucketCandidates } from "./firebase-config";

/**
 * เก็บไฟล์ไว้บน Firebase Storage แล้วคืนที่อยู่สาธารณะ
 *
 * ใช้กับไฟล์ที่ระบบอื่นต้องมาดึงเอง — เช่น LINE ต้องดึงรูปใบแจ้งหนี้จาก URL ของเรา
 * ส่ง data URL ไปให้ไม่ได้ และจะให้ LINE มาเรียกเส้นที่ต้องวาดใหม่ทุกครั้งก็ช้าเกินไป
 * วาดครั้งเดียวเก็บไว้ แล้วส่งแต่ที่อยู่
 */
/** เก็บขึ้น Storage ได้ไหม — โหมดสาธิตที่ไม่มี Firebase จะเก็บรูปเป็น data URL แทน */
export function canUploadPublic(): boolean {
  return isFirebaseConfigured() && bucketCandidates().length > 0;
}

/** ข้อความบอกทางแก้ตอนหา bucket ไม่เจอ — เจอบ่อยเพราะต้องไปกดเปิดใน Console ก่อน */
function bucketMissing(tried: string[]): Error {
  return new Error(
    `หา Firebase Storage ไม่เจอ (ลองชื่อ ${tried.join(" และ ")} แล้ว) — ` +
      "ถ้ายังไม่เคยเปิดใช้ ให้ไปที่ Firebase Console > Build > Storage แล้วกด Get started ก่อน " +
      "ถ้าเปิดแล้วแต่ชื่อไม่ตรง ให้คัดลอกชื่อ bucket จากหน้านั้นมาใส่ FIREBASE_STORAGE_BUCKET แล้ว Redeploy",
  );
}

function isBucketMissing(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return message.includes("does not exist") || message.includes("notFound") || message.includes("404");
}

export async function uploadPublic(
  path: string,
  bytes: Buffer,
  contentType: string,
): Promise<string> {
  const candidates = bucketCandidates();
  if (!isFirebaseConfigured() || candidates.length === 0) {
    throw new Error(
      "ยังไม่ได้ตั้งค่า Firebase จึงเก็บไฟล์ให้ระบบภายนอกมาดึงไม่ได้ — ตั้ง FIREBASE_PROJECT_ID ก่อน",
    );
  }

  const storage = getStorage(adminApp());

  for (const [index, bucketName] of candidates.entries()) {
    const file = storage.bucket(bucketName).file(path);
    try {
      await file.save(bytes, {
        contentType,
        resumable: false,
        metadata: { cacheControl: "public, max-age=31536000" },
      });
      await file.makePublic();
      return `https://storage.googleapis.com/${bucketName}/${file.name}`;
    } catch (err) {
      // ชื่อไม่ตรงก็ลองชื่อถัดไป ส่วนพังด้วยเหตุอื่น (สิทธิ์ เน็ต) ต้องโยนออกไปตามจริง
      const last = index === candidates.length - 1;
      if (!isBucketMissing(err)) throw err;
      if (last) throw bucketMissing(candidates);
    }
  }

  throw bucketMissing(candidates);
}
