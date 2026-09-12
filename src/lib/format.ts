/** ตัวช่วยจัดรูปแบบ — ใช้ได้ทั้งฝั่ง server และ client */

const MONTHS_SHORT = ["ม.ค.","ก.พ.","มี.ค.","เม.ย.","พ.ค.","มิ.ย.","ก.ค.","ส.ค.","ก.ย.","ต.ค.","พ.ย.","ธ.ค."];
const MONTHS_FULL = ["มกราคม","กุมภาพันธ์","มีนาคม","เมษายน","พฤษภาคม","มิถุนายน","กรกฎาคม","สิงหาคม","กันยายน","ตุลาคม","พฤศจิกายน","ธันวาคม"];

export function baht(amount: number, opts?: { decimals?: boolean }): string {
  return amount.toLocaleString("th-TH", {
    minimumFractionDigits: opts?.decimals ? 2 : 0,
    maximumFractionDigits: opts?.decimals ? 2 : 0,
  });
}

/** 4716 → "4.7k" สำหรับการ์ดสรุปที่พื้นที่แคบ */
export function compactBaht(amount: number): string {
  if (Math.abs(amount) >= 1_000_000) return `${(amount / 1_000_000).toFixed(1)}M`;
  if (Math.abs(amount) >= 1_000) return `${(amount / 1_000).toFixed(1)}k`;
  return String(Math.round(amount));
}

/** "202609" → "ก.ย. 69" */
export function cycleLabel(cycle: string, style: "short" | "full" = "short"): string {
  const year = Number(cycle.slice(0, 4)) + 543;
  const month = Number(cycle.slice(4, 6)) - 1;
  if (Number.isNaN(month) || month < 0 || month > 11) return cycle;
  return style === "full"
    ? `${MONTHS_FULL[month]} ${year}`
    : `${MONTHS_SHORT[month]} ${String(year).slice(2)}`;
}

/** "2026-09-12" → "12 ก.ย. 2569" */
export function thaiDate(iso: string | null | undefined, style: "short" | "full" = "short"): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  const month = style === "full" ? MONTHS_FULL[m - 1] : MONTHS_SHORT[m - 1];
  return `${d} ${month} ${y + 543}`;
}

export function initials(name: string): string {
  const clean = name
    .replace(/[()[\]{}<>"'.,·—–-]/g, " ")
    .replace(/^\s*(คุณ|นาย|นางสาว|นาง|น\s*ส)\s*/, "")
    .trim();
  const parts = clean.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2);
  return parts[0][0] + parts[1][0];
}

export const METHOD_LABEL: Record<string, string> = {
  cash: "เงินสด",
  transfer: "โอนธนาคาร",
  promptpay: "พร้อมเพย์",
  other: "อื่นๆ",
};

export const BILL_STATUS_LABEL: Record<string, string> = {
  unpaid: "ค้างชำระ",
  partial: "ชำระบางส่วน",
  paid: "ชำระแล้ว",
  void: "ยกเลิก",
};

export const MAINTENANCE_STATUS_LABEL: Record<string, string> = {
  open: "รอดำเนินการ",
  in_progress: "กำลังซ่อม",
  done: "เสร็จแล้ว",
  cancelled: "ยกเลิก",
};

export const CONDITION_LABEL: Record<string, string> = {
  ready: "พร้อมใช้",
  cleaning: "กำลังทำความสะอาด",
  repair: "กำลังซ่อม",
};
