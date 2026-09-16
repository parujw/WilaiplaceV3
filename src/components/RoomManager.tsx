"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert, Expander, Field, Ghost, Input, Select, Submit, send } from "./form";
import { baht } from "@/lib/format";
import type { Lease, Rates, Room, Tenant } from "@/lib/types";

/**
 * แก้ข้อมูลห้องและจัดการผู้เช่าของห้องนั้น
 *
 * แบ่งตามที่โครงข้อมูลแยกไว้ (ดูหัวไฟล์ lib/lease-ops.ts)
 *   รายละเอียดห้อง  แก้ได้ตรงๆ
 *   เงื่อนไขสัญญา   แก้ได้ตรงๆ มีผลรอบบิลถัดไป
 *   ใครอยู่ห้องไหน  แก้ตรงๆ ไม่ได้ ต้อง "รับเข้า" หรือ "ย้ายออก" เท่านั้น
 *
 * เหตุที่ไม่เปิดช่องให้เลือกห้องในฟอร์มสัญญา: บิลที่ออกไปแล้วชี้มาที่ leaseId
 * ย้ายปลายทางของสัญญาเมื่อไหร่ บิลเดือนก่อนของห้อง 102 จะกลายเป็นของห้อง 205 ทันที
 */

function useAction() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(fn: () => Promise<unknown>, after?: () => void) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      after?.();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "ทำรายการไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  return { busy, error, setError, run };
}

/* ------------------------------ รายละเอียดห้อง ----------------------------- */

function RoomForm({ room, close }: { room: Room; close: () => void }) {
  const { busy, error, run } = useAction();
  const [form, setForm] = useState({
    roomNo: room.roomNo,
    floor: String(room.floor),
    type: room.type,
    baseRent: String(room.baseRent),
    condition: room.condition,
    note: room.note ?? "",
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void run(() => send(`/api/rooms/${encodeURIComponent(room.id)}`, "PATCH", form), close);
      }}
      className="card space-y-3 p-4"
    >
      <h3 className="text-[16px] font-bold tracking-tight">แก้รายละเอียดห้อง</h3>
      <div className="grid grid-cols-2 gap-3">
        <Field label="เลขห้อง">
          <Input value={form.roomNo} onChange={(e) => setForm({ ...form, roomNo: e.target.value })} required />
        </Field>
        <Field label="ชั้น">
          <Input
            type="number" inputMode="numeric" min="0"
            value={form.floor} onChange={(e) => setForm({ ...form, floor: e.target.value })}
          />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="ประเภทห้อง">
          <Select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as Room["type"] })}>
            <option value="รายเดือน">รายเดือน</option>
            <option value="พาณิชย์">พาณิชย์</option>
          </Select>
        </Field>
        <Field label="สภาพห้อง">
          <Select
            value={form.condition}
            onChange={(e) => setForm({ ...form, condition: e.target.value as Room["condition"] })}
          >
            <option value="ready">พร้อมใช้</option>
            <option value="cleaning">กำลังทำความสะอาด</option>
            <option value="repair">กำลังซ่อม</option>
          </Select>
        </Field>
      </div>
      <Field label="ราคาป้าย (บาท/เดือน)" hint="ใช้เป็นค่าตั้งต้นตอนทำสัญญาใหม่ ไม่กระทบสัญญาที่เดินอยู่">
        <Input
          type="number" inputMode="numeric" min="0"
          value={form.baseRent} onChange={(e) => setForm({ ...form, baseRent: e.target.value })}
        />
      </Field>
      <Field label="หมายเหตุ">
        <Input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
      </Field>

      {error ? <Alert tone="danger">{error}</Alert> : null}
      <div className="grid grid-cols-2 gap-3">
        <Ghost onClick={close} disabled={busy}>ยกเลิก</Ghost>
        <Submit busy={busy}>บันทึก</Submit>
      </div>
    </form>
  );
}

/* -------------------------------- รับเข้าอยู่ ------------------------------- */

function RatesFields({
  rates, onChange,
}: { rates: Record<string, string>; onChange: (next: Record<string, string>) => void }) {
  const set = (key: string) => (e: React.ChangeEvent<HTMLInputElement>) => onChange({ ...rates, [key]: e.target.value });
  const cell = (key: string, label: string) => (
    <Field label={label} key={key}>
      <Input type="number" inputMode="decimal" min="0" value={rates[key]} onChange={set(key)} />
    </Field>
  );
  return (
    <div className="grid grid-cols-2 gap-3">
      {cell("elec", "ค่าไฟ (บาท/หน่วย)")}
      {cell("water", "ค่าน้ำ (บาท/หน่วย)")}
      {cell("ac", "ค่าแอร์ (บาท/เดือน)")}
      {cell("internet", "เน็ต (บาท/เดือน)")}
    </div>
  );
}

function MoveInForm({
  room, pastTenants, defaults, close,
}: {
  room: Room;
  pastTenants: Array<{ id: string; name: string }>;
  defaults: { rates: Rates; dueDay: number };
  close: () => void;
}) {
  const { busy, error, run } = useAction();
  const [existingId, setExistingId] = useState("");
  const [person, setPerson] = useState({ name: "", nickname: "", phone: "" });
  const [terms, setTerms] = useState({
    startDate: new Date().toISOString().slice(0, 10),
    rent: String(room.baseRent),
    deposit: String(room.baseRent * 2),
    advance: "0",
    dueDay: String(defaults.dueDay),
  });
  const [rates, setRates] = useState<Record<string, string>>({
    elec: String(defaults.rates.elec),
    water: String(defaults.rates.water),
    ac: String(defaults.rates.ac),
    internet: String(defaults.rates.internet),
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void run(
          () =>
            send("/api/leases", "POST", {
              roomId: room.id,
              ...(existingId ? { tenantId: existingId } : { tenant: person }),
              ...terms,
              rates,
            }),
          close,
        );
      }}
      className="card space-y-3 p-4"
    >
      <h3 className="text-[16px] font-bold tracking-tight">รับผู้เช่าเข้าห้อง {room.roomNo}</h3>

      {pastTenants.length > 0 ? (
        <Field label="ผู้เช่า" hint="เลือกจากคนที่เคยอยู่ หรือปล่อยว่างแล้วกรอกชื่อคนใหม่ด้านล่าง">
          <Select value={existingId} onChange={(e) => setExistingId(e.target.value)}>
            <option value="">— ผู้เช่ารายใหม่ —</option>
            {pastTenants.map((t) => (
              <option key={t.id} value={t.id}>{t.name} ({t.id})</option>
            ))}
          </Select>
        </Field>
      ) : null}

      {existingId ? null : (
        <>
          <Field label="ชื่อ-นามสกุล">
            <Input
              value={person.name} onChange={(e) => setPerson({ ...person, name: e.target.value })}
              placeholder="คุณสมชาย ใจดี" required
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="ชื่อเล่น">
              <Input value={person.nickname} onChange={(e) => setPerson({ ...person, nickname: e.target.value })} />
            </Field>
            <Field label="เบอร์โทร">
              <Input
                type="tel" inputMode="tel"
                value={person.phone} onChange={(e) => setPerson({ ...person, phone: e.target.value })}
              />
            </Field>
          </div>
        </>
      )}

      <div className="h-px bg-line" />

      <div className="grid grid-cols-2 gap-3">
        <Field label="วันเริ่มสัญญา">
          <Input type="date" value={terms.startDate} onChange={(e) => setTerms({ ...terms, startDate: e.target.value })} />
        </Field>
        <Field label="ค่าเช่า (บาท/เดือน)">
          <Input
            type="number" inputMode="numeric" min="0"
            value={terms.rent} onChange={(e) => setTerms({ ...terms, rent: e.target.value })}
          />
        </Field>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Field label="เงินประกัน">
          <Input type="number" inputMode="numeric" min="0" value={terms.deposit} onChange={(e) => setTerms({ ...terms, deposit: e.target.value })} />
        </Field>
        <Field label="ล่วงหน้า">
          <Input type="number" inputMode="numeric" min="0" value={terms.advance} onChange={(e) => setTerms({ ...terms, advance: e.target.value })} />
        </Field>
        <Field label="ครบกำหนด">
          <Input type="number" inputMode="numeric" min="1" max="28" value={terms.dueDay} onChange={(e) => setTerms({ ...terms, dueDay: e.target.value })} />
        </Field>
      </div>
      <RatesFields rates={rates} onChange={setRates} />

      {error ? <Alert tone="danger">{error}</Alert> : null}
      <div className="grid grid-cols-2 gap-3">
        <Ghost onClick={close} disabled={busy}>ยกเลิก</Ghost>
        <Submit busy={busy}>บันทึกสัญญา</Submit>
      </div>
    </form>
  );
}

/* ------------------------------- แก้ไขสัญญา ------------------------------- */

function LeaseForm({ lease, close }: { lease: Lease; close: () => void }) {
  const { busy, error, run } = useAction();
  const [terms, setTerms] = useState({
    rent: String(lease.rent),
    deposit: String(lease.deposit),
    advance: String(lease.advance),
    dueDay: String(lease.dueDay),
    startDate: lease.startDate ?? "",
    endDate: lease.endDate ?? "",
    note: lease.note ?? "",
  });
  const [rates, setRates] = useState<Record<string, string>>({
    elec: String(lease.rates.elec),
    water: String(lease.rates.water),
    ac: String(lease.rates.ac),
    internet: String(lease.rates.internet),
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void run(() => send(`/api/leases/${encodeURIComponent(lease.id)}`, "PATCH", { ...terms, rates }), close);
      }}
      className="card space-y-3 p-4"
    >
      <h3 className="text-[16px] font-bold tracking-tight">แก้ไขสัญญา</h3>
      <p className="text-[12px] leading-relaxed text-muted">
        มีผลกับบิลรอบถัดไป บิลที่ออกไปแล้วเก็บตัวเลข ณ วันออกไว้ในตัวมันเอง
        ถ้าบิลที่ออกไปแล้วผิดด้วย ต้องไปแก้ที่บิลใบนั้นอีกที
      </p>

      <div className="grid grid-cols-2 gap-3">
        <Field label="ค่าเช่า (บาท/เดือน)">
          <Input type="number" inputMode="numeric" min="0" value={terms.rent} onChange={(e) => setTerms({ ...terms, rent: e.target.value })} />
        </Field>
        <Field label="ครบกำหนดทุกวันที่">
          <Input type="number" inputMode="numeric" min="1" max="28" value={terms.dueDay} onChange={(e) => setTerms({ ...terms, dueDay: e.target.value })} />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="เงินประกัน">
          <Input type="number" inputMode="numeric" min="0" value={terms.deposit} onChange={(e) => setTerms({ ...terms, deposit: e.target.value })} />
        </Field>
        <Field label="ค่าล่วงหน้า">
          <Input type="number" inputMode="numeric" min="0" value={terms.advance} onChange={(e) => setTerms({ ...terms, advance: e.target.value })} />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="วันเริ่มสัญญา">
          <Input type="date" value={terms.startDate} onChange={(e) => setTerms({ ...terms, startDate: e.target.value })} />
        </Field>
        <Field label="วันสิ้นสุดสัญญา">
          <Input type="date" value={terms.endDate} onChange={(e) => setTerms({ ...terms, endDate: e.target.value })} />
        </Field>
      </div>
      <RatesFields rates={rates} onChange={setRates} />
      <Field label="หมายเหตุ">
        <Input value={terms.note} onChange={(e) => setTerms({ ...terms, note: e.target.value })} />
      </Field>

      {error ? <Alert tone="danger">{error}</Alert> : null}
      <div className="grid grid-cols-2 gap-3">
        <Ghost onClick={close} disabled={busy}>ยกเลิก</Ghost>
        <Submit busy={busy}>บันทึก</Submit>
      </div>
    </form>
  );
}

/* -------------------------------- ย้ายห้อง -------------------------------- */

function TransferForm({
  lease, tenantName, roomNo, vacantRooms, close,
}: {
  lease: Lease;
  tenantName: string;
  roomNo: string;
  vacantRooms: Array<{ id: string; roomNo: string; baseRent: number }>;
  close: () => void;
}) {
  const { busy, error, run } = useAction();
  const [toRoomId, setToRoomId] = useState(vacantRooms[0]?.id ?? "");
  const [form, setForm] = useState({
    moveDate: new Date().toISOString().slice(0, 10),
    rent: "",
    deposit: "",
    note: "",
  });
  const [result, setResult] = useState<{ shortfall: number; roomNo: string } | null>(null);

  const target = vacantRooms.find((r) => r.id === toRoomId);

  if (vacantRooms.length === 0) {
    return (
      <div className="card space-y-3 p-4">
        <h3 className="text-[16px] font-bold tracking-tight">ย้ายห้อง</h3>
        <p className="text-[13px] leading-relaxed text-muted">
          ตอนนี้ไม่มีห้องว่างให้ย้ายไป ถ้าจะสลับห้องกับผู้เช่าอีกคน
          ต้องให้อีกฝ่ายย้ายออกก่อนหนึ่งคน แล้วค่อยย้ายเข้าทีละคน
        </p>
        <Ghost onClick={close}>ปิด</Ghost>
      </div>
    );
  }

  if (result) {
    return (
      <div className="card space-y-3 p-4">
        <h3 className="text-[16px] font-bold tracking-tight">ย้ายไปห้อง {result.roomNo} แล้ว</h3>
        <p className="text-[13px] leading-relaxed text-muted">
          เงินประกันยกไปสัญญาใหม่เรียบร้อย ประวัติบิลของห้องเดิมยังอยู่ครบ
          และยอดค้างเดิม (ถ้ามี) จะยกไปเข้าบิลของห้องใหม่ให้เอง
        </p>
        {result.shortfall > 0 ? (
          <div className="rounded-xl bg-warn/12 px-4 py-3">
            <p className="text-[13px] font-bold text-[#96690f]">
              ต้องเก็บเงินประกันเพิ่ม {baht(result.shortfall)} บาท
            </p>
            <p className="mt-1 text-[12px] leading-relaxed text-[#96690f]">
              ห้องใหม่กำหนดเงินประกันสูงกว่าที่ยกมา ระบบไม่ได้ออกบิลให้อัตโนมัติ
              ถ้าจะเก็บ ให้ไปกดออกบิลแล้วเลือกค่ามัดจำ
            </p>
          </div>
        ) : null}
        <Ghost onClick={close}>เสร็จแล้ว</Ghost>
      </div>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void run(async () => {
          const res = await send(`/api/leases/${encodeURIComponent(lease.id)}/transfer`, "POST", {
            toRoomId,
            ...form,
          });
          setResult({ shortfall: Number(res.depositShortfall ?? 0), roomNo: String(res.roomNo ?? "") });
        });
      }}
      className="card space-y-3 p-4"
    >
      <h3 className="text-[16px] font-bold tracking-tight">ย้าย{tenantName}ไปห้องอื่น</h3>
      <p className="text-[12px] leading-relaxed text-muted">
        ระบบจะปิดสัญญาห้อง {roomNo} แล้วเปิดสัญญาใหม่ให้ที่ห้องปลายทาง
        ไม่ใช่ย้ายสัญญาเดิมข้ามห้อง เพราะบิลที่ออกไปแล้วต้องยังเป็นของห้องเดิม
        <br />
        เงินประกัน {baht(lease.deposit)} บาท ยกไปสัญญาใหม่ ไม่ต้องคืนแล้วเก็บใหม่
      </p>

      <Field label="ย้ายไปห้อง">
        <Select value={toRoomId} onChange={(e) => setToRoomId(e.target.value)} required>
          {vacantRooms.map((r) => (
            <option key={r.id} value={r.id}>ห้อง {r.roomNo} · ราคาป้าย {baht(r.baseRent)}</option>
          ))}
        </Select>
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="วันที่ย้าย">
          <Input type="date" value={form.moveDate} onChange={(e) => setForm({ ...form, moveDate: e.target.value })} />
        </Field>
        <Field label="ค่าเช่าใหม่" hint={target ? `เว้นว่าง = ${baht(target.baseRent)}` : undefined}>
          <Input
            type="number" inputMode="numeric" min="0" placeholder={target ? String(target.baseRent) : ""}
            value={form.rent} onChange={(e) => setForm({ ...form, rent: e.target.value })}
          />
        </Field>
      </div>

      <Field label="เงินประกันห้องใหม่" hint={`เว้นว่าง = ยกก้อนเดิม ${baht(lease.deposit)} บาทมาทั้งหมด`}>
        <Input
          type="number" inputMode="numeric" min="0" placeholder={String(lease.deposit)}
          value={form.deposit} onChange={(e) => setForm({ ...form, deposit: e.target.value })}
        />
      </Field>

      <Field label="หมายเหตุ">
        <Input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="เช่น ขอย้ายไปห้องมุม" />
      </Field>

      {error ? <Alert tone="danger">{error}</Alert> : null}
      <div className="grid grid-cols-2 gap-3">
        <Ghost onClick={close} disabled={busy}>ยกเลิก</Ghost>
        <Submit busy={busy}>ยืนยันย้ายห้อง</Submit>
      </div>
    </form>
  );
}

/* -------------------------------- ย้ายออก -------------------------------- */

function MoveOutForm({ lease, tenantName, close }: { lease: Lease; tenantName: string; close: () => void }) {
  const { busy, error, setError, run } = useAction();
  const [form, setForm] = useState({
    endDate: new Date().toISOString().slice(0, 10),
    reason: "",
    refundAmount: String(lease.deposit),
    refundNote: "",
  });
  // ค้างอยู่เท่าไหร่รู้จากเซิร์ฟเวอร์ตอนกดครั้งแรก กดซ้ำคือยืนยันว่าปิดทั้งที่ยังค้าง
  const [confirmOutstanding, setConfirmOutstanding] = useState(false);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void run(async () => {
          try {
            await send(`/api/leases/${encodeURIComponent(lease.id)}/end`, "POST", {
              ...form,
              ignoreOutstanding: confirmOutstanding,
            });
            close();
          } catch (err) {
            if (err instanceof Error && err.message.includes("ยังค้างชำระ")) setConfirmOutstanding(true);
            throw err;
          }
        });
      }}
      className="card space-y-3 p-4"
    >
      <h3 className="text-[16px] font-bold tracking-tight">บันทึกย้ายออก</h3>
      <p className="text-[12px] leading-relaxed text-muted">
        ปิดสัญญาของ {tenantName} แล้วปล่อยห้องให้ว่าง ประวัติบิลทั้งหมดยังอยู่ครบ
      </p>

      <div className="grid grid-cols-2 gap-3">
        <Field label="วันย้ายออก">
          <Input type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
        </Field>
        <Field label={`คืนเงินประกัน (รับไว้ ${baht(lease.deposit)})`}>
          <Input
            type="number" inputMode="numeric" min="0" max={lease.deposit}
            value={form.refundAmount} onChange={(e) => setForm({ ...form, refundAmount: e.target.value })}
          />
        </Field>
      </div>
      <Field label="เหตุผล">
        <Input value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder="ครบสัญญา / ย้ายกลับต่างจังหวัด" />
      </Field>
      <Field label="หมายเหตุการคืนเงินประกัน" hint="เช่น หักค่าซ่อมผนัง 500 บาท">
        <Input value={form.refundNote} onChange={(e) => setForm({ ...form, refundNote: e.target.value })} />
      </Field>

      {error ? <Alert tone="danger">{error}</Alert> : null}
      <div className="grid grid-cols-2 gap-3">
        <Ghost
          onClick={() => { setConfirmOutstanding(false); setError(null); close(); }}
          disabled={busy}
        >
          ไม่ย้ายออก
        </Ghost>
        <Submit busy={busy} tone="danger">
          {confirmOutstanding ? "ยืนยันปิดทั้งที่ยังค้าง" : "ยืนยันย้ายออก"}
        </Submit>
      </div>
    </form>
  );
}

/* --------------------------------- ตัวหลัก -------------------------------- */

export function RoomManager({
  room, lease, tenant, pastTenants, defaults, vacantRooms,
}: {
  room: Room;
  lease: Lease | null;
  tenant: Tenant | null;
  pastTenants: Array<{ id: string; name: string }>;
  defaults: { rates: Rates; dueDay: number };
  /** ห้องว่างอื่นๆ ในอาคาร ใช้เป็นปลายทางตอนย้ายห้อง */
  vacantRooms: Array<{ id: string; roomNo: string; baseRent: number }>;
}) {
  return (
    <div className="space-y-3">
      <Expander label="แก้รายละเอียดห้อง">
        {(close) => <RoomForm room={room} close={close} />}
      </Expander>

      {lease ? (
        <>
          <Expander label="แก้ไขสัญญาเช่า">
            {(close) => <LeaseForm lease={lease} close={close} />}
          </Expander>
          <Expander label="ย้ายไปห้องอื่น">
            {(close) => (
              <TransferForm
                lease={lease}
                tenantName={tenant?.nickname || tenant?.name || "ผู้เช่า"}
                roomNo={room.roomNo}
                vacantRooms={vacantRooms}
                close={close}
              />
            )}
          </Expander>
          <Expander label="บันทึกย้ายออก" tone="danger">
            {(close) => <MoveOutForm lease={lease} tenantName={tenant?.name ?? "ผู้เช่า"} close={close} />}
          </Expander>
        </>
      ) : (
        <Expander label="รับผู้เช่าเข้าห้องนี้">
          {(close) => <MoveInForm room={room} pastTenants={pastTenants} defaults={defaults} close={close} />}
        </Expander>
      )}
    </div>
  );
}
