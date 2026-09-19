/**
 * แยกรายได้ตามชนิดรายการในบิล — คำนวณล้วน ไม่แตะฐานข้อมูล
 *
 * ตอบคำถามว่าเงินที่ออกบิลไปมาจากอะไรบ้าง ค่าเช่ากี่เปอร์เซ็นต์ ค่าไฟกี่เปอร์เซ็นต์
 * ซึ่งบอกได้ว่าถ้าจะเพิ่มรายได้ควรไปขยับตรงไหน และค่าน้ำค่าไฟที่เก็บมา
 * พอจ่ายบิลการไฟฟ้ากับการประปาหรือเปล่า
 *
 * สามเรื่องที่ต้องระวัง ไม่งั้นตัวเลขจะหลอกตัวเอง
 *
 *   ยอดค้างยกมา ไม่ใช่รายได้ใหม่
 *     เป็นหนี้จากบิลเดือนก่อนที่ถูกเอามาใส่บิลใหม่ นับด้วยเมื่อไหร่รายได้จะพองเป็นสองเท่า
 *     ของเดือนที่มีคนค้างเยอะ จึงตัดออกทั้งหมด
 *
 *   เงินประกัน ไม่ใช่รายได้
 *     เป็นเงินที่ต้องคืนตอนย้ายออก อยู่ในมือแต่ไม่ใช่ของเรา
 *     เอาไปรวมกับค่าเช่าแล้วจะนึกว่าเดือนนั้นได้เยอะ ทั้งที่ต้องกันไว้คืน จึงแยกออกมาต่างหาก
 *
 *   ส่วนลด เป็นค่าติดลบ
 *     ถ้าปล่อยรวมอยู่ในสัดส่วนจะได้ชิ้นส่วนติดลบซึ่งวาดไม่ได้ จึงแยกไปเป็นตัวหัก
 */

import type { Bill, BillLineType, Cycle } from "./types";

/**
 * ลำดับคงที่ของหมวดรายได้ — สีผูกกับหมวด ไม่ใช่ผูกกับอันดับ
 * กรองรอบบิลแล้วหมวดไหนหายไป หมวดที่เหลือต้องไม่เปลี่ยนสี
 */
export const REVENUE_CATEGORIES = ["rent", "electricity", "water", "ac", "other"] as const;
export type RevenueCategory = (typeof REVENUE_CATEGORIES)[number];

export const CATEGORY_LABEL: Record<RevenueCategory, string> = {
  rent: "ค่าเช่าห้อง",
  electricity: "ค่าไฟ",
  water: "ค่าน้ำ",
  ac: "ค่าแอร์",
  other: "อื่นๆ",
};

/** ชนิดรายการในบิล → หมวดรายได้ — internet/parking/other กองรวมกันเป็นอื่นๆ */
function categoryOf(type: BillLineType): RevenueCategory | null {
  switch (type) {
    case "rent":
    case "electricity":
    case "water":
    case "ac":
      return type;
    case "internet":
    case "parking":
    case "other":
      return "other";
    default:
      // deposit / carryOver / discount ไม่ใช่รายได้ปกติ นับแยกต่างหาก
      return null;
  }
}

export interface RevenueSlice {
  category: RevenueCategory;
  label: string;
  amount: number;
  /** สัดส่วนของรายได้ทั้งหมด 0-1 */
  share: number;
}

export interface RevenueMix {
  slices: RevenueSlice[];
  /** รายได้รวม ไม่รวมเงินประกันและไม่รวมยอดค้างยกมา */
  revenue: number;
  /** เงินประกันที่เก็บมา ต้องคืนตอนย้ายออก จึงไม่ใช่รายได้ */
  deposit: number;
  /** ส่วนลดที่ให้ไป เก็บเป็นค่าบวกเพื่อเอาไปแสดงว่าเป็นตัวหัก */
  discount: number;
  /** ยอดค้างยกมาที่ตัดออกไม่นับ — โชว์ไว้ให้เห็นว่าทำไมยอดไม่ตรงกับหน้าบิล */
  carryOver: number;
  /** จำนวนบิลที่เอามาคิด */
  bills: number;
}

/**
 * แยกรายได้ตามหมวดจากบิลที่ให้มา
 * ใส่ cycle มาก็คิดเฉพาะรอบนั้น ไม่ใส่ก็คิดทุกรอบ
 */
export function revenueMix(bills: Bill[], cycle?: Cycle): RevenueMix {
  const live = bills.filter((b) => b.status !== "void" && (!cycle || b.cycle === cycle));

  const totals = new Map<RevenueCategory, number>();
  let deposit = 0;
  let discount = 0;
  let carryOver = 0;

  for (const bill of live) {
    for (const line of bill.lines) {
      if (line.type === "deposit") {
        deposit += line.amount;
        continue;
      }
      if (line.type === "carryOver") {
        carryOver += line.amount;
        continue;
      }
      if (line.type === "discount") {
        // เก็บเป็นค่าบวก ตัวมันเองติดลบอยู่แล้ว
        discount += Math.abs(line.amount);
        continue;
      }
      const category = categoryOf(line.type);
      if (category) totals.set(category, (totals.get(category) ?? 0) + line.amount);
    }
  }

  const revenue = [...totals.values()].reduce((sum, n) => sum + n, 0);

  const slices = REVENUE_CATEGORIES
    .map((category) => ({
      category,
      label: CATEGORY_LABEL[category],
      amount: totals.get(category) ?? 0,
      share: revenue > 0 ? (totals.get(category) ?? 0) / revenue : 0,
    }))
    .filter((s) => s.amount !== 0)
    // เรียงจากมากไปน้อยเพื่ออ่านง่าย สีไม่ได้ผูกกับลำดับนี้ จึงไม่เปลี่ยนตาม
    .sort((a, b) => b.amount - a.amount);

  return { slices, revenue, deposit, discount, carryOver, bills: live.length };
}

/** ค่าน้ำค่าไฟที่เก็บได้ เทียบกับรายได้ทั้งหมด — ส่วนนี้เป็นเงินที่ต้องจ่ายต่อให้การไฟฟ้า/ประปา */
export function utilityShare(mix: RevenueMix): number {
  if (mix.revenue <= 0) return 0;
  const utilities = mix.slices
    .filter((s) => s.category === "electricity" || s.category === "water")
    .reduce((sum, s) => sum + s.amount, 0);
  return utilities / mix.revenue;
}
