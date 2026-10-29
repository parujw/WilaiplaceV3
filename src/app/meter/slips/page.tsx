import Link from "next/link";
import { lastReadingFor } from "@/lib/billing";
import { cycleLabel, thaiDate } from "@/lib/format";
import { requireContext } from "@/lib/guard";
import { chunk, slipDueDate, SLIPS_PER_PAGE } from "@/lib/meter-slip";
import { currentCycle, getRoomViews, listMeterReadings } from "@/lib/repo";
import { sarabun } from "./font";
import { PrintBar } from "./PrintBar";
import { SendToLine } from "./SendToLine";
import "./slips.css";

export const dynamic = "force-dynamic";

/** วันที่ขอให้ส่งคืนตามค่าเริ่มต้น — ออกบิลสัปดาห์สุดท้ายของเดือน จึงต้องได้เลขก่อนนั้น */
const DEFAULT_DUE_DAY = 25;

interface Slip {
  roomNo: string;
  tenantName: string;
  /** null = ไม่เคยจดมิเตอร์ห้องนี้ ต่างจาก 0 ที่หมายถึงมิเตอร์อ่านได้ศูนย์จริงๆ */
  elecPrevious: number | null;
  waterPrevious: number | null;
  /** วันที่อ่านครั้งก่อน — บอกผู้เช่าว่าเลขที่พิมพ์มาเป็นของวันไหน */
  readAt: string | null;
}

/**
 * เลขครั้งก่อนที่จะพิมพ์ลงใบ
 *
 * ไม่มีเลขเดิมต้องขึ้นขีด ไม่ใช่เลข 0
 * พิมพ์ 0 ไปผู้เช่าจะเข้าใจว่ามิเตอร์ควรขึ้น 0 แล้วโทรมาถามว่ามิเตอร์พัง
 */
function previousText(value: number | null): string {
  return value === null ? "—" : value.toLocaleString("th-TH");
}

/**
 * ใบจดมิเตอร์สำหรับแจกผู้เช่า — พิมพ์ลง A4 แผ่นละ 2 ใบ แล้วตัดตามเส้น
 *
 * เลขครั้งก่อนพิมพ์มาให้แล้ว ผู้เช่าเขียนแค่เลขครั้งนี้ จึงเทียบได้ทันทีว่าเลขเดินถูกทาง
 * ไม่ให้กรอกจำนวนหน่วยเอง เพราะคิดเลขผิดแล้วจะกลายเป็นเรื่องเถียงกันตอนออกบิล
 */
export default async function MeterSlipsPage({
  searchParams,
}: {
  searchParams: Promise<{ cycle?: string; due?: string; room?: string }>;
}) {
  const { cycle: cycleParam, due: dueParam, room: roomParam } = await searchParams;
  const { property } = await requireContext();
  const cycle = /^\d{6}$/.test(cycleParam ?? "") ? cycleParam! : currentCycle();

  const dueDay = /^\d{1,2}$/.test(dueParam ?? "") ? Number(dueParam) : DEFAULT_DUE_DAY;
  const dueDate = slipDueDate(cycle, dueDay);

  const [views, readings] = await Promise.all([getRoomViews(property.id), listMeterReadings(property.id)]);

  const slips: Slip[] = views
    .filter((v) => v.lease && v.tenant)
    // ห้องเดียวก็พิมพ์ได้ เผื่อผู้เช่าทำใบหาย ไม่ต้องพิมพ์ใหม่ทั้งตึก
    .filter((v) => !roomParam || v.room.roomNo === roomParam)
    .map((v) => {
      const previous = lastReadingFor(readings, v.room.id, cycle);
      return {
        roomNo: v.room.roomNo,
        tenantName: v.tenant!.name,
        elecPrevious: previous?.elecCurrent ?? null,
        waterPrevious: previous?.waterCurrent ?? null,
        readAt: previous?.readAt ?? null,
      };
    })
    .sort((a, b) => a.roomNo.localeCompare(b.roomNo, "th", { numeric: true }));

  const pages = chunk(slips, SLIPS_PER_PAGE);

  return (
    <main className={`${sarabun.className} slips`}>
      <PrintBar backHref={`/meter?cycle=${cycle}`} />

      {slips.length === 0 ? (
        <div className="empty">
          <p className="empty-title">ยังไม่มีใบให้พิมพ์</p>
          <p>
            {roomParam
              ? `ไม่พบห้อง ${roomParam} ที่มีผู้เช่าอยู่`
              : "ห้องที่มีผู้เช่าและสัญญาอยู่เท่านั้นที่จะมีใบจดมิเตอร์"}
          </p>
          <Link href="/meter" className="empty-link">
            กลับไปหน้าจดมิเตอร์
          </Link>
        </div>
      ) : (
        pages.map((page, pageIndex) => (
          <section className="page" key={pageIndex}>
            {page.map((slip) => (
              <article className="slip" key={slip.roomNo}>
                <header className="slip-head">
                  <div>
                    <p className="title">ใบจดมิเตอร์น้ำ–ไฟ ด้วยตนเอง</p>
                    <p className="org">
                      {property.name}
                      {property.phone ? ` · โทร ${property.phone}` : ""}
                    </p>
                  </div>
                  <div className="cycle">
                    <p className="cycle-label">รอบเดือน</p>
                    <p className="cycle-value">{cycleLabel(cycle, "full")}</p>
                  </div>
                </header>

                <div className="who">
                  <p className="room">ห้อง {slip.roomNo}</p>
                  <p className="tenant">{slip.tenantName}</p>
                  {dueDate ? (
                    <p className="due">
                      ส่งคืนภายใน <strong>{thaiDate(dueDate, "full")}</strong>
                    </p>
                  ) : null}
                </div>

                <table className="reads">
                  <thead>
                    <tr>
                      <th className="what">มิเตอร์</th>
                      <th className="prev">
                        เลขครั้งก่อน
                        {slip.readAt ? <span className="when"> ({thaiDate(slip.readAt)})</span> : null}
                      </th>
                      <th className="fix">แก้ให้ถูก (ถ้าไม่ตรง)</th>
                      <th className="now">เลขครั้งนี้ — เขียนในช่องนี้</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="what">
                        ไฟฟ้า <span className="unit">(หน่วย)</span>
                      </td>
                      <td className="prev">{previousText(slip.elecPrevious)}</td>
                      <td className="fix">
                        <span className="box soft" />
                      </td>
                      <td className="now">
                        <span className="box" />
                      </td>
                    </tr>
                    <tr>
                      <td className="what">
                        น้ำ <span className="unit">(หน่วย)</span>
                      </td>
                      <td className="prev">{previousText(slip.waterPrevious)}</td>
                      <td className="fix">
                        <span className="box soft" />
                      </td>
                      <td className="now">
                        <span className="box" />
                      </td>
                    </tr>
                  </tbody>
                </table>

                <p className="hint">
                  ช่อง <strong>แก้ให้ถูก</strong> เขียนเฉพาะกรณีเลขครั้งก่อนที่พิมพ์มาไม่ตรงกับหน้าปัดจริง
                  ถ้าตรงอยู่แล้วเว้นว่างไว้
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
        ))
      )}
    </main>
  );
}
