/**
 * ใบให้ผู้เช่าจดเลขมิเตอร์เองแล้วส่งกลับมา
 *
 * เจ้าของเดินเก็บเลขมิเตอร์ 17 ห้องเองทุกเดือน งานนี้ย้ายไปให้ผู้เช่าจดแทน
 * ของที่ตัดสินใจได้โดยไม่ต้องมีเบราว์เซอร์อยู่ในไฟล์นี้ เพื่อเทสต์ได้ตรงๆ
 */

/**
 * ใบต่อกระดาษ A4 หนึ่งแผ่น
 *
 * เคยใส่ 3 ใบ แต่พอเพิ่มช่องแก้เลขครั้งก่อน ช่องเซ็นชื่อ และ QR ไลน์เข้าไป
 * ที่เหลือให้เขียนแคบจนต้องเขียนตัวจิ๋ว ซึ่งขัดกับจุดประสงค์ของใบนี้
 * 2 ใบ × 130mm ยังพอดี A4 (เหลือใช้ได้ 277mm หลังหักขอบ) และเขียนสบาย
 */
export const SLIPS_PER_PAGE = 2;

/** วันสุดท้ายของเดือน — ก.พ. ปีอธิกสุรทินก็ได้ 29 ถูกต้อง */
function lastDayOfMonth(year: number, month: number): number {
  // วันที่ 0 ของเดือนถัดไป = วันสุดท้ายของเดือนนี้
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * วันที่ขอให้ส่งใบคืน = วันที่ `day` ของเดือนตามรอบบิล
 *
 * ถ้า day เกินจำนวนวันของเดือนนั้น ให้เลื่อนมาเป็นวันสุดท้ายของเดือน
 * ไม่ใช่ปล่อยให้ล้นไปเดือนถัดไป เพราะกำหนดส่งต้องอยู่ก่อนวันออกบิลเสมอ
 */
export function slipDueDate(cycle: string, day: number): string | null {
  if (!/^\d{6}$/.test(cycle)) return null;

  const year = Number(cycle.slice(0, 4));
  const month = Number(cycle.slice(4, 6));
  if (month < 1 || month > 12) return null;
  if (!Number.isInteger(day) || day < 1) return null;

  const safeDay = Math.min(day, lastDayOfMonth(year, month));
  return `${year}-${String(month).padStart(2, "0")}-${String(safeDay).padStart(2, "0")}`;
}

/**
 * แบ่งรายการเป็นหน้าๆ ละ `size` ใบ
 *
 * ต้องแบ่งเองในโค้ด ไม่ปล่อยให้เบราว์เซอร์ตัดหน้าตามเนื้อที่
 * เพราะความสูงที่เหลือต่างกันไม่กี่มิลลิเมตรก็ทำให้ได้ 2 ใบต่อหน้าสลับกับ 3 ใบ
 * แล้วเส้นตัดกระดาษจะไม่ตรงกันทุกแผ่น ตัดด้วยกรรไกรทีเดียวไม่ได้
 */
export function chunk<T>(items: T[], size: number): T[][] {
  if (!Number.isInteger(size) || size < 1) return items.length > 0 ? [items] : [];

  const pages: T[][] = [];
  for (let i = 0; i < items.length; i += size) pages.push(items.slice(i, i + size));
  return pages;
}

/**
 * ใบเปล่าสำหรับอาคารอื่นที่ยังไม่ได้อยู่ในระบบ — สั่งพิมพ์เป็นจำนวนแผ่น
 * เพดานกันพิมพ์ผิดหลักแล้วเครื่องพิมพ์ปล่อยกระดาษเป็นร้อยแผ่น
 */
export const BLANK_PAGES_DEFAULT = 1;
export const BLANK_PAGES_MAX = 20;

/** จำนวนแผ่นที่ขอมาทาง URL — อ่านไม่ออกใช้ค่าเริ่มต้น เกินเพดานก็ตัดเหลือเพดาน */
export function blankPageCount(param: string | undefined): number {
  if (!/^\d{1,3}$/.test(param ?? "")) return BLANK_PAGES_DEFAULT;
  const pages = Number(param);
  if (pages < 1) return BLANK_PAGES_DEFAULT;
  return Math.min(pages, BLANK_PAGES_MAX);
}

/**
 * "2026-10" จากช่องเลือกเดือนของเบราว์เซอร์ → "202610" แบบรอบบิล
 * ว่างหรือใช้ไม่ได้คืน null = ให้ผู้เช่าเขียนเดือนเอง
 */
export function cycleFromMonthInput(value: string | undefined): string | null {
  const match = /^(\d{4})-(\d{2})$/.exec(value ?? "");
  if (!match) return null;
  const month = Number(match[2]);
  if (month < 1 || month > 12) return null;
  return `${match[1]}${match[2]}`;
}
