"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { cycleLabel } from "@/lib/format";

interface Issue {
  sheet: string;
  row: number | null;
  message: string;
}

interface Summary {
  propertyId: string;
  propertyName: string;
  firstCycle: string;
  rooms: number;
  occupied: number;
  vacant: number;
  meterReadings: number;
  rates: { elec: number; water: number; ac: number; internet: number; parking: number };
  roomList: Array<{
    roomNo: string;
    floor: number;
    tenant: string | null;
    rent: number;
    elec: number | null;
    water: number | null;
  }>;
}

function where(issue: Issue): string {
  return issue.row ? `${issue.sheet} แถว ${issue.row}` : issue.sheet;
}

export function ImportForm({ firestore }: { firestore: boolean }) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [errors, setErrors] = useState<Issue[]>([]);
  const [warnings, setWarnings] = useState<Issue[]>([]);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(picked: File, dryRun: boolean) {
    const form = new FormData();
    form.set("file", picked);
    form.set("dryRun", String(dryRun));
    const res = await fetch("/api/admin/import", { method: "POST", body: form });

    // เซิร์ฟเวอร์พังหนักๆ อาจตอบเป็นหน้า HTML อ่านเป็นข้อความก่อน จะได้ไม่กลืนสาเหตุจริง
    const text = await res.text();
    let json: { ok?: boolean; error?: string; summary?: Summary; errors?: Issue[]; warnings?: Issue[] };
    try {
      json = JSON.parse(text);
    } catch {
      throw new Error(`เซิร์ฟเวอร์ตอบผิดพลาด (HTTP ${res.status})`);
    }
    if (!res.ok && !json.errors) throw new Error(json.error ?? `ทำรายการไม่สำเร็จ (HTTP ${res.status})`);
    return json;
  }

  async function onPick(event: React.ChangeEvent<HTMLInputElement>) {
    const picked = event.target.files?.[0];
    // ล้างค่า ไม่งั้นแก้ไฟล์แล้วเลือกไฟล์เดิมซ้ำ เบราว์เซอร์จะไม่ยิง onChange
    event.target.value = "";
    if (!picked) return;

    setBusy(true);
    setError(null);
    setSummary(null);
    setErrors([]);
    setWarnings([]);
    setFile(picked);
    try {
      const json = await send(picked, true);
      setErrors(json.errors ?? []);
      setWarnings(json.warnings ?? []);
      setSummary(json.ok ? (json.summary ?? null) : null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "อ่านไฟล์ไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  async function confirm() {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const json = await send(file, false);
      if (!json.ok) {
        // ระหว่างตรวจกับกดยืนยัน มีคนสร้างอาคารรหัสเดียวกันไปแล้ว
        setErrors(json.errors ?? []);
        setSummary(null);
        return;
      }
      setSummary(json.summary ?? null);
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "นำเข้าไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  async function openProperty() {
    if (!summary) return;
    setBusy(true);
    const res = await fetch("/api/property/select", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ propertyId: summary.propertyId }),
    });
    if (res.ok) {
      // โหลดหน้าใหม่ทั้งหน้า ไม่ใช้ router.replace + refresh
      // refresh ที่ตามมาติดๆ ยกเลิกการเปลี่ยนหน้า แล้วค้างอยู่หน้านำเข้า
      window.location.assign("/");
    } else {
      setBusy(false);
      router.push("/select");
    }
  }

  if (done && summary) {
    return (
      <div className="space-y-3">
        <div className="card p-5 text-center">
          <p className="text-[20px] font-bold text-ok">นำเข้า {summary.propertyName} เรียบร้อย</p>
          <p className="mt-1 text-[14px] text-muted">
            {summary.rooms} ห้อง · มีผู้เช่า {summary.occupied} · ว่าง {summary.vacant}
          </p>
          <p className="mt-1 text-[13px] text-muted">ออกบิลแรกได้ที่รอบ {cycleLabel(summary.firstCycle, "full")}</p>
        </div>
        <button
          type="button"
          onClick={openProperty}
          disabled={busy}
          className="w-full rounded-2xl bg-accent py-4 text-[15px] font-bold text-white disabled:opacity-60"
        >
          เปิดอาคาร {summary.propertyName}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {!firestore ? (
        <div className="card p-4">
          <p className="text-[14px] font-bold text-warn">ยังไม่ได้ต่อ Firebase</p>
          <p className="mt-1 text-[13px] leading-relaxed text-muted">
            นำเข้าตอนนี้ข้อมูลจะอยู่แค่ในหน่วยความจำ หายเมื่อเซิร์ฟเวอร์รีสตาร์ต
          </p>
        </div>
      ) : null}

      <div className="card p-5">
        <h2 className="text-[16px] font-bold tracking-tight">1. ดาวน์โหลด template</h2>
        <p className="mt-1.5 text-[13px] leading-relaxed text-muted">
          กรอกชีต &ldquo;อาคาร&rdquo; กับ &ldquo;ห้องและผู้เช่า&rdquo; หนึ่งแถวต่อหนึ่งห้อง ห้องว่างก็ใส่ด้วย
          ดูชีต &ldquo;วิธีกรอก&rdquo; และ &ldquo;ตัวอย่าง&rdquo; ในไฟล์ประกอบ
        </p>
        <a
          href="/api/admin/import/template"
          download
          className="mt-4 block w-full rounded-2xl bg-surface-2 py-3.5 text-center text-[15px] font-bold"
        >
          ดาวน์โหลด template (.xlsx)
        </a>
      </div>

      <div className="card p-5">
        <h2 className="text-[16px] font-bold tracking-tight">2. อัปโหลดไฟล์ที่กรอกแล้ว</h2>
        <p className="mt-1.5 text-[13px] leading-relaxed text-muted">
          เลือกแล้วยังไม่บันทึกอะไร ระบบจะตรวจทุกแถวแล้วสรุปให้ดูก่อน
        </p>
        <button
          type="button"
          onClick={() => fileInput.current?.click()}
          disabled={busy}
          className="mt-4 w-full rounded-2xl bg-accent py-4 text-[15px] font-bold text-white disabled:opacity-60"
        >
          {busy && !summary ? "กำลังตรวจไฟล์…" : file ? "เลือกไฟล์ใหม่" : "เลือกไฟล์ Excel"}
        </button>
        {/* ไม่ใส่ accept — มือถือหลายรุ่นมองไม่เห็นไฟล์ .xlsx เมื่อจำกัดชนิดไฟล์ */}
        <input ref={fileInput} type="file" onChange={onPick} className="hidden" />
        {file ? <p className="mt-2 text-center text-[12px] text-muted">{file.name}</p> : null}
      </div>

      {error ? (
        <p className="whitespace-pre-line rounded-xl bg-danger/10 px-4 py-3 text-[13px] font-semibold leading-relaxed text-danger">
          {error}
        </p>
      ) : null}

      {errors.length > 0 ? (
        <div className="card p-4">
          <p className="text-[14px] font-bold text-danger">ต้องแก้ในไฟล์ก่อน ({errors.length} จุด)</p>
          <p className="mt-1 text-[12px] text-muted">แก้แล้วบันทึกไฟล์ แล้วกดเลือกไฟล์ใหม่อีกครั้ง</p>
          <ul className="mt-2 space-y-1.5">
            {errors.map((issue, i) => (
              <li key={i} className="flex gap-2 text-[13px] leading-relaxed">
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-danger" />
                <span>
                  <span className="font-semibold">{where(issue)}:</span> {issue.message}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {summary ? (
        <>
          <div className="card p-4">
            <p className="text-[17px] font-bold">{summary.propertyName}</p>
            <p className="text-[12px] text-muted">รหัส {summary.propertyId}</p>
            <div className="mt-3 grid grid-cols-3 gap-2 text-center">
              <div className="rounded-xl bg-surface-2 px-2 py-2.5">
                <p className="text-[18px] font-bold">{summary.rooms}</p>
                <p className="text-[11px] text-muted">ห้อง</p>
              </div>
              <div className="rounded-xl bg-surface-2 px-2 py-2.5">
                <p className="text-[18px] font-bold">{summary.occupied}</p>
                <p className="text-[11px] text-muted">มีผู้เช่า</p>
              </div>
              <div className="rounded-xl bg-surface-2 px-2 py-2.5">
                <p className="text-[18px] font-bold">{summary.vacant}</p>
                <p className="text-[11px] text-muted">ห้องว่าง</p>
              </div>
            </div>
            <p className="mt-3 text-[13px] text-muted">
              ค่าไฟ {summary.rates.elec} ฿/หน่วย · ค่าน้ำ {summary.rates.water} ฿/หน่วย ·
              บิลแรกรอบ {cycleLabel(summary.firstCycle, "full")}
            </p>
          </div>

          <div className="card divide-y divide-line overflow-hidden">
            {summary.roomList.map((room) => (
              <div key={room.roomNo} className="flex items-center gap-3 px-4 py-2.5">
                <span className="w-14 shrink-0 text-[14px] font-bold">{room.roomNo}</span>
                <span className="min-w-0 flex-1 truncate text-[13px]">
                  {room.tenant ?? <span className="text-muted">ว่าง</span>}
                </span>
                <span className="shrink-0 text-right text-[12px] text-muted">
                  {room.rent.toLocaleString("th-TH")} ฿
                  <br />
                  {room.elec === null ? "ไม่มีเลขมิเตอร์" : `ไฟ ${room.elec} · น้ำ ${room.water}`}
                </span>
              </div>
            ))}
          </div>

          {warnings.length > 0 ? (
            <div className="card p-4">
              <p className="text-[13px] font-bold">ข้อสังเกต ({warnings.length})</p>
              <p className="mt-1 text-[12px] text-muted">นำเข้าได้ แต่ควรรู้ไว้</p>
              <ul className="mt-2 space-y-1.5">
                {warnings.map((issue, i) => (
                  <li key={i} className="flex gap-2 text-[12px] leading-relaxed">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-warn" />
                    <span>{issue.message}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <button
            type="button"
            onClick={confirm}
            disabled={busy}
            className="w-full rounded-2xl bg-accent py-4 text-[15px] font-bold text-white disabled:opacity-60"
          >
            {busy ? "กำลังนำเข้า…" : `ยืนยัน สร้างอาคาร ${summary.propertyName}`}
          </button>
        </>
      ) : null}
    </div>
  );
}
