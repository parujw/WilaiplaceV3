import { cycleLabel, thaiDate } from "@/lib/format";
import { requireContext } from "@/lib/guard";
import {
  BLANK_PAGES_MAX,
  blankPageCount,
  chunk,
  cycleFromMonthInput,
  slipDueDate,
  SLIPS_PER_PAGE,
} from "@/lib/meter-slip";
import { sarabun } from "../font";
import { PrintBar } from "../PrintBar";
import { SendToLine } from "../SendToLine";
import "../slips.css";

export const dynamic = "force-dynamic";

/**
 * ใบจดมิเตอร์เปล่า — สำหรับอาคารอื่นที่ยังไม่ได้อยู่ในระบบ
 *
 * ไม่มีห้อง ไม่มีชื่อ ไม่มีเลขครั้งก่อน ผู้เช่าเขียนเองทั้งหมด
 * แต่ QR กับไอดีไลน์ยังอยู่ ส่งกลับมาที่บัญชีเดียวกับอาคารหลัก
 *
 * ชื่ออาคาร เบอร์โทร และรอบเดือนกรอกมาจากฟอร์มบนจอได้ (ไม่พิมพ์ติดกระดาษ)
 * เว้นว่างไว้ก็จะกลายเป็นเส้นให้เขียนบนใบแทน
 */
export default async function BlankMeterSlipsPage({
  searchParams,
}: {
  searchParams: Promise<{ building?: string; phone?: string; month?: string; due?: string; pages?: string }>;
}) {
  const params = await searchParams;
  const { property } = await requireContext();

  const building = params.building?.trim() ?? "";
  // ไม่ได้ส่ง phone มาเลย = เปิดหน้าครั้งแรก ใช้เบอร์ของเจ้าของไปก่อน ลบทิ้งในฟอร์มได้
  const phone = params.phone === undefined ? (property.phone ?? "") : params.phone.trim();
  const cycle = cycleFromMonthInput(params.month);
  const dueDay = /^\d{1,2}$/.test(params.due ?? "") ? Number(params.due) : null;
  // กำหนดส่งต้องผูกกับเดือน ไม่รู้เดือนก็บอกวันที่ไม่ได้
  const dueDate = cycle && dueDay ? slipDueDate(cycle, dueDay) : null;
  const pageCount = blankPageCount(params.pages);

  const pages = chunk(
    Array.from({ length: pageCount * SLIPS_PER_PAGE }, (_, i) => i),
    SLIPS_PER_PAGE,
  );

  return (
    <main className={`${sarabun.className} slips`}>
      <PrintBar backHref="/meter" />

      <form className="blank-setup" method="get">
        <p className="blank-setup-title">ใบเปล่าสำหรับอาคารอื่น</p>
        <p className="blank-setup-note">ช่องที่เว้นว่างจะพิมพ์เป็นเส้นให้ผู้เช่าเขียนเอง · ฟอร์มนี้ไม่ติดไปกับกระดาษ</p>
        <div className="blank-setup-grid">
          <label>
            ชื่ออาคาร
            <input name="building" defaultValue={building} placeholder="เว้นว่างให้เขียนเอง" />
          </label>
          <label>
            เบอร์โทร
            <input name="phone" defaultValue={phone} inputMode="tel" placeholder="ไม่ใส่ก็ได้" />
          </label>
          <label>
            รอบเดือน
            <input
              name="month"
              type="month"
              defaultValue={cycle ? `${cycle.slice(0, 4)}-${cycle.slice(4, 6)}` : ""}
            />
          </label>
          <label>
            ส่งคืนภายในวันที่
            <input name="due" type="number" min={1} max={31} defaultValue={dueDay ?? ""} placeholder="ต้องเลือกเดือน" />
          </label>
          <label>
            จำนวนแผ่น (แผ่นละ {SLIPS_PER_PAGE} ใบ)
            <input name="pages" type="number" min={1} max={BLANK_PAGES_MAX} defaultValue={pageCount} />
          </label>
        </div>
        <button type="submit">อัปเดตใบ</button>
      </form>

      {pages.map((page, pageIndex) => (
        <section className="page" key={pageIndex}>
          {page.map((slipIndex) => (
            <article className="slip" key={slipIndex}>
              <header className="slip-head">
                <div className="head-main">
                  <p className="title">ใบจดมิเตอร์น้ำ–ไฟ ด้วยตนเอง</p>
                  {building ? (
                    <p className="org">
                      {building}
                      {phone ? ` · โทร ${phone}` : ""}
                    </p>
                  ) : (
                    <p className="org blank-line">
                      อาคาร <span className="rule" />
                      {phone ? <span className="org-phone">โทร {phone}</span> : null}
                    </p>
                  )}
                </div>
                <div className="cycle">
                  <p className="cycle-label">รอบเดือน</p>
                  {cycle ? (
                    <p className="cycle-value">{cycleLabel(cycle, "full")}</p>
                  ) : (
                    <p className="cycle-value">
                      <span className="rule cycle-rule" />
                    </p>
                  )}
                </div>
              </header>

              <div className="who blank-who">
                <span className="field room-field">
                  <span className="room">ห้อง</span> <span className="rule" />
                </span>
                <span className="field">
                  ชื่อผู้เช่า <span className="rule" />
                </span>
                {dueDate ? (
                  <p className="due">
                    ส่งคืนภายใน <strong>{thaiDate(dueDate, "full")}</strong>
                  </p>
                ) : null}
              </div>

              <table className="reads blank-reads">
                <thead>
                  <tr>
                    <th className="what">มิเตอร์</th>
                    <th className="prev-box">เลขครั้งก่อน (ถ้าทราบ)</th>
                    <th className="now">เลขครั้งนี้ — เขียนในช่องนี้</th>
                  </tr>
                </thead>
                <tbody>
                  {(["ไฟฟ้า", "น้ำ"] as const).map((meter) => (
                    <tr key={meter}>
                      <td className="what">
                        {meter} <span className="unit">(หน่วย)</span>
                      </td>
                      <td className="prev-box">
                        <span className="box soft" />
                      </td>
                      <td className="now">
                        <span className="box" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <p className="hint">
                <strong>เลขครั้งก่อน</strong> ดูจากใบหรือบิลเดือนที่แล้ว ถ้าไม่ทราบเว้นว่างไว้
                เจ้าหน้าที่จะเทียบให้เอง
              </p>

              <div className="fill">
                <span className="field">
                  วันที่จด <span className="rule short" />
                </span>
                <span className="field">
                  ผู้จด <span className="rule" />
                </span>
                <span className="field">
                  โทร <span className="rule" />
                </span>
              </div>

              <div className="sign-row">
                <span className="sign">
                  <span className="sign-line" />
                  <span className="sign-label">ลงชื่อผู้เช่า</span>
                </span>
                <span className="check">
                  <span className="tick" /> มิเตอร์ชำรุด / อ่านเลขไม่ได้
                </span>
              </div>

              <SendToLine />
            </article>
          ))}
        </section>
      ))}
    </main>
  );
}
