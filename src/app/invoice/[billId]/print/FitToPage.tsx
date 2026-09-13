"use client";

import { useEffect } from "react";

/**
 * ย่อใบแจ้งหนี้ให้จบในหน้าเดียวเสมอ
 *
 * ตอนแรกคุมด้วยการวัดความสูงให้พอดี A4 แต่เอาไม่อยู่จริง เพราะ
 *   - บางเครื่องตั้งกระดาษเป็น Letter ซึ่งเตี้ยกว่า A4 อยู่ 18 มม.
 *   - กล่องพิมพ์ของเบราว์เซอร์มักใส่ขอบของตัวเองเพิ่มอีก
 *   - บิลที่มีรายการเยอะกว่าปกติก็ยาวกว่าที่วัดไว้
 * เกินนิดเดียวก็ดันไปหน้าสองทันที
 *
 * จึงวัดความสูงจริงตอนจะพิมพ์ แล้วย่อทั้งแผ่นด้วย zoom ให้พอดีหน้า
 * ใช้ zoom ไม่ใช่ transform เพราะ zoom มีผลกับการตัดหน้าจริง ส่วน transform ไม่มี
 */

/** ความสูงที่ใช้ได้จริง เผื่อขอบของเบราว์เซอร์ไว้แล้ว — อิงกระดาษ Letter ที่เตี้ยกว่า A4 */
const SAFE_HEIGHT_PT = 760;
const PX_PER_PT = 96 / 72;

function fit() {
  const sheet = document.querySelector<HTMLElement>(".sheet");
  if (!sheet) return;

  // ต้องล้างค่าเดิมก่อนวัดเสมอ ไม่งั้นตอนสั่งพิมพ์ซ้ำจะวัดความสูงที่ย่อไปแล้ว
  // แล้วย่อทับลงไปอีกรอบ ใบจะเล็กลงเรื่อยๆ ทุกครั้งที่กดพิมพ์
  sheet.style.removeProperty("--print-zoom");
  void sheet.offsetHeight;

  const heightPt = sheet.scrollHeight / PX_PER_PT;
  const scale = Math.min(1, SAFE_HEIGHT_PT / heightPt);

  // ย่อเฉพาะตอนที่จำเป็น และไม่ย่อจนอ่านไม่ออก
  sheet.style.setProperty("--print-zoom", String(Math.max(0.7, scale)));
}

export function FitToPage() {
  useEffect(() => {
    const run = () => fit();

    // รอให้ฟอนต์กับรูป QR โหลดเสร็จก่อน ไม่งั้นวัดความสูงได้ไม่ตรง
    void document.fonts?.ready.then(run);
    run();

    window.addEventListener("beforeprint", run);
    window.addEventListener("resize", run);
    return () => {
      window.removeEventListener("beforeprint", run);
      window.removeEventListener("resize", run);
    };
  }, []);

  return null;
}
