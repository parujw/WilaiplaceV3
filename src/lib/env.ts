/**
 * อ่าน environment variable แบบเผื่อวางค่าผิดรูปเล็กน้อย
 *
 * วางค่าในหน้า dashboard ของ Vercel แล้วติดอะไรมาด้วยได้ง่ายมาก
 *   - ช่องว่างหรือขึ้นบรรทัดใหม่ท้ายค่า
 *   - เครื่องหมายคำพูดครอบ เพราะก๊อปมาจากไฟล์ .env
 *   - อักขระล่องหน (zero-width space) ที่ติดมาจากการก๊อปในเว็บ
 *
 * ค่าพวกนี้ทำให้ Firebase ตอบ api-key-not-valid ทั้งที่คีย์ถูก
 * และหาสาเหตุยากมากเพราะมองด้วยตาไม่เห็น
 */
export function env(name: string): string | undefined {
  const raw = process.env[name];
  if (raw == null) return undefined;

  let value = raw.replace(/[​-‍﻿]/g, "").trim();
  // ครอบด้วย " หรือ ' ทั้งหน้าหลัง = ตั้งใจใส่เป็น quote ไม่ใช่ส่วนหนึ่งของค่า
  if (value.length >= 2 && (value.at(0) === '"' || value.at(0) === "'") && value.at(-1) === value.at(0)) {
    value = value.slice(1, -1).trim();
  }

  return value === "" ? undefined : value;
}
