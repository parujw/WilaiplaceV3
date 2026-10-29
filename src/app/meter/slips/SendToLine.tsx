import { LINE_CONTACT } from "@/lib/line-contact";

/**
 * กล่อง QR + ไอดีไลน์ท้ายใบ — ใช้ร่วมกันทั้งใบที่มีชื่อผู้เช่าและใบเปล่า
 * เปลี่ยนข้อความตรงนี้ที่เดียว ใบทุกแบบจะบอกผู้เช่าเหมือนกัน
 */
export function SendToLine() {
  return (
    <div className="send">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={LINE_CONTACT.qrPath} alt={`QR เพิ่มเพื่อนไลน์ ${LINE_CONTACT.id}`} className="qr" />
      <div className="send-body">
        <p className="send-title">ส่งกลับทางไลน์</p>
        <p>
          สแกน QR นี้ หรือค้นหาไอดี <strong className="line-id">{LINE_CONTACT.id}</strong> ในไลน์ แล้วกดเพิ่มเพื่อน
        </p>
        <p>
          แล้วถ่ายรูปใบนี้ <strong>พร้อมรูปหน้าปัดมิเตอร์</strong> ส่งมาในแชท —
          เขียนตัวเลขให้ครบทุกหลักตามที่เห็นบนหน้าปัด ถ้าเลขไม่ชัดเจ้าหน้าที่จะดูจากรูปให้
        </p>
      </div>
    </div>
  );
}
