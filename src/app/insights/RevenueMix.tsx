"use client";

import { useState } from "react";
import { CATEGORY_LABEL, revenueMix, utilityShare, type RevenueCategory } from "@/lib/revenue-mix";
import { baht, cycleLabel } from "@/lib/format";
import type { Bill } from "@/lib/types";

/**
 * รายได้มาจากอะไรบ้าง
 *
 * ใช้แถบเดียวซ้อนกัน (part-to-whole) เพราะคำถามคือ "ค่าเช่ากินสัดส่วนเท่าไหร่"
 * ไม่ใช่ "ค่าเช่าเดือนนี้เทียบเดือนก่อนเป็นยังไง" — อันหลังเป็นกราฟคนละแบบ
 * ไม่ใช้วงกลม เพราะสายตาเทียบมุมได้แย่กว่าเทียบความยาว โดยเฉพาะตอนค่าใกล้กัน
 *
 * สีผูกกับหมวด ไม่ได้ผูกกับอันดับ สลับรอบบิลแล้วหมวดที่เหลือจึงไม่เปลี่ยนสี
 * และมีรายการข้างล่างกำกับทุกหมวดพร้อมตัวเลข อ่านได้โดยไม่ต้องแยกสีออก
 */

/* พาเล็ตแยกหมวด ผ่านการตรวจ CVD แล้ว (ดู dataviz validator)
   ลำดับคงที่ตามหมวด ไม่ใช่ตามขนาด */
const COLOR: Record<RevenueCategory, string> = {
  rent: "#2a78d6",
  electricity: "#eb6834",
  water: "#1baf7a",
  ac: "#eda100",
  other: "#e87ba4",
};

export function RevenueMix({ bills, cycles }: { bills: Bill[]; cycles: string[] }) {
  const [cycle, setCycle] = useState<string>("");
  const mix = revenueMix(bills, cycle || undefined);
  const utilities = utilityShare(mix);

  const chip = (active: boolean) =>
    `shrink-0 rounded-full px-3.5 py-2 text-[13px] font-semibold transition ${
      active ? "bg-accent text-white" : "bg-surface text-ink-2"
    }`;

  return (
    <div className="space-y-3">
      <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4">
        <button type="button" onClick={() => setCycle("")} className={chip(cycle === "")}>
          ทุกรอบ
        </button>
        {cycles.slice(0, 6).map((c) => (
          <button key={c} type="button" onClick={() => setCycle(c)} className={chip(cycle === c)}>
            {cycleLabel(c)}
          </button>
        ))}
      </div>

      {mix.bills === 0 ? (
        <div className="card px-6 py-10 text-center">
          <p className="font-semibold">ยังไม่มีบิลในรอบนี้</p>
          <p className="mt-1 text-sm text-muted">ออกบิลแล้วตัวเลขจะขึ้นที่นี่</p>
        </div>
      ) : mix.revenue === 0 ? (
        // รอบที่ออกแต่บิลมัดจำจะมาทางนี้ — มีบิลจริงแต่ยังไม่มีรายได้
        // บอกตรงๆ ว่าทำไมเป็นศูนย์ ดีกว่าขึ้นว่า "ยังไม่มีบิล" ซึ่งไม่จริง
        <div className="card space-y-3 p-5">
          <div>
            <p className="text-[15px] font-bold">รอบนี้ยังไม่มีรายได้</p>
            <p className="mt-1 text-[13px] leading-relaxed text-muted">
              ออกบิลไปแล้ว {mix.bills} ใบ แต่เป็นรายการที่ไม่นับเป็นรายได้ทั้งหมด
            </p>
          </div>
          {mix.deposit > 0 ? (
            <div className="rounded-xl bg-surface-2 px-4 py-3">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-[13px] text-muted">เงินประกันที่เก็บมา</span>
                <span className="text-[17px] font-bold tabular-nums">{baht(mix.deposit)} ฿</span>
              </div>
              <p className="mt-1 text-[11px] leading-snug text-muted">
                ไม่นับเป็นรายได้ เพราะต้องคืนตอนผู้เช่าย้ายออก
              </p>
            </div>
          ) : null}
          {mix.carryOver > 0 ? (
            <div className="rounded-xl bg-surface-2 px-4 py-3">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-[13px] text-muted">ยอดค้างยกมา</span>
                <span className="text-[17px] font-bold tabular-nums">{baht(mix.carryOver)} ฿</span>
              </div>
              <p className="mt-1 text-[11px] leading-snug text-muted">
                เป็นหนี้ของบิลเดือนก่อนที่ยกมาใส่บิลใหม่ ไม่ใช่รายได้ใหม่
              </p>
            </div>
          ) : null}
        </div>
      ) : (
        <>
          <div className="card p-5">
            <p className="text-[13px] text-muted">
              รายได้ที่ออกบิล {cycle ? cycleLabel(cycle, "full") : "ทุกรอบรวมกัน"}
            </p>
            <p className="mt-0.5 text-[30px] font-bold leading-none tracking-tight">
              {baht(mix.revenue)} <span className="text-[15px] font-semibold text-muted">บาท</span>
            </p>

            {/* แถบสัดส่วน — เว้นช่องว่างสีพื้น 2px ระหว่างชิ้น ไม่ใช้เส้นขอบ */}
            <div className="mt-4 flex h-6 w-full gap-[2px] overflow-hidden rounded-lg">
              {mix.slices.map((s, i) => (
                <div
                  key={s.category}
                  style={{ width: `${s.share * 100}%`, background: COLOR[s.category] }}
                  className={`h-full ${i === 0 ? "rounded-l-lg" : ""} ${
                    i === mix.slices.length - 1 ? "rounded-r-lg" : ""
                  }`}
                  title={`${s.label} ${baht(s.amount)} บาท`}
                />
              ))}
            </div>

            {/* รายการกำกับ — อ่านได้โดยไม่ต้องแยกสีออก และเป็นตารางตัวเลขในตัว */}
            <ul className="mt-4 space-y-2.5">
              {mix.slices.map((s) => (
                <li key={s.category} className="flex items-baseline gap-2.5">
                  <span
                    aria-hidden
                    className="mt-1 h-2.5 w-2.5 shrink-0 rounded-sm"
                    style={{ background: COLOR[s.category] }}
                  />
                  <span className="flex-1 text-[14px]">{s.label}</span>
                  <span className="text-[13px] tabular-nums text-muted">{baht(s.amount)}</span>
                  <span className="w-11 text-right text-[14px] font-bold tabular-nums">
                    {Math.round(s.share * 100)}%
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="card p-4">
              <p className="text-[12px] leading-tight text-muted">ค่าน้ำค่าไฟ</p>
              <p className="mt-1.5 text-[24px] font-bold leading-none tracking-tight">
                {Math.round(utilities * 100)}
                <span className="ml-1 text-[13px] font-semibold text-muted">%</span>
              </p>
              <p className="mt-1.5 text-[11px] leading-snug text-muted">
                ของรายได้ ส่วนนี้เก็บมาแล้วต้องจ่ายต่อให้การไฟฟ้ากับการประปา
              </p>
            </div>
            <div className="card p-4">
              <p className="text-[12px] leading-tight text-muted">เงินประกันที่ถืออยู่</p>
              <p className="mt-1.5 text-[24px] font-bold leading-none tracking-tight">
                {baht(mix.deposit)}
                <span className="ml-1 text-[13px] font-semibold text-muted">฿</span>
              </p>
              <p className="mt-1.5 text-[11px] leading-snug text-muted">
                ไม่นับเป็นรายได้ เพราะต้องคืนตอนผู้เช่าย้ายออก
              </p>
            </div>
          </div>

          {mix.discount > 0 || mix.carryOver > 0 ? (
            <div className="card space-y-2 p-4">
              {mix.discount > 0 ? (
                <div className="flex items-baseline justify-between gap-3 text-[13px]">
                  <span className="text-muted">ส่วนลดที่ให้ไป</span>
                  <span className="font-semibold text-ok">−{baht(mix.discount)} ฿</span>
                </div>
              ) : null}
              {mix.carryOver > 0 ? (
                <div className="flex items-baseline justify-between gap-3 text-[13px]">
                  <span className="text-muted">ยอดค้างยกมา (ไม่นับเป็นรายได้ใหม่)</span>
                  <span className="font-semibold">{baht(mix.carryOver)} ฿</span>
                </div>
              ) : null}
            </div>
          ) : null}

          <p className="px-1 text-[11px] leading-relaxed text-muted">
            คิดจากยอดที่ออกบิล จาก {mix.bills} ใบ ไม่ใช่ยอดที่เก็บได้จริง
            เพราะการรับชำระบันทึกเป็นรายใบ ไม่ได้แยกว่าเงินที่จ่ายมาเป็นค่าอะไร
            อัตราเก็บเงินได้จริงดูที่การ์ดตัวเลขบริหารด้านบน
            <br />
            ยอดค้างยกมาไม่ถูกนับเป็นรายได้ เพราะเป็นหนี้ของบิลเดือนก่อนที่เอามาใส่บิลใหม่
            นับด้วยเมื่อไหร่รายได้ของเดือนที่มีคนค้างเยอะจะพองเป็นสองเท่า
          </p>
        </>
      )}
    </div>
  );
}
