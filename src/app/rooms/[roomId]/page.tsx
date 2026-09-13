import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { IconBack, IconGauge, IconReceipt } from "@/components/icons";
import { RoomManager } from "@/components/RoomManager";
import { Avatar, Badge, EmptyState, RowLink, SectionHeader } from "@/components/ui";
import { BILL_STATUS_LABEL, CONDITION_LABEL, baht, cycleLabel, thaiDate } from "@/lib/format";
import { requireContext } from "@/lib/guard";
import { getRoomView, listBills, listLeases, listTenants } from "@/lib/repo";

export const dynamic = "force-dynamic";

const STATUS_TONE = { paid: "ok", partial: "warn", unpaid: "danger", void: "neutral" } as const;

export default async function RoomPage({ params }: { params: Promise<{ roomId: string }> }) {
  const { roomId } = await params;
  const { property } = await requireContext();

  const view = await getRoomView(property.id, roomId);
  if (!view) notFound();

  const { room, lease, tenant, lastReading, outstanding } = view;
  const bills = await listBills(property.id, { roomId: room.id });

  // คนที่เคยอยู่แต่ตอนนี้ไม่มีสัญญาเดินอยู่ — ให้เลือกได้ตอนกลับมาเช่าใหม่ จะได้ไม่มีรหัสซ้ำสองใบ
  const [tenants, leases] = await Promise.all([listTenants(property.id), listLeases(property.id)]);
  const housed = new Set(leases.filter((l) => l.status === "active").map((l) => l.tenantId));
  const pastTenants = tenants
    .filter((t) => !housed.has(t.id))
    .map((t) => ({ id: t.id, name: t.name }))
    .sort((a, b) => a.name.localeCompare(b.name, "th"));

  return (
    <AppShell>
      <header className="flex items-center gap-3 px-4 pb-5 pt-8">
        <Link href="/property" aria-label="กลับ" className="grid h-10 w-10 place-items-center rounded-full bg-surface">
          <IconBack />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="text-[22px] font-bold leading-tight tracking-tight">ห้อง {room.roomNo}</h1>
          <p className="text-[13px] text-muted">
            ชั้น {room.floor} · {room.type} · {CONDITION_LABEL[room.condition]}
          </p>
        </div>
        <Link
          href={`/meter?room=${room.id}`}
          aria-label="จดมิเตอร์ห้องนี้"
          className="grid h-10 w-10 place-items-center rounded-full bg-accent text-white"
        >
          <IconGauge />
        </Link>
      </header>

      <section className="px-4">
        {tenant && lease ? (
          <Link href={`/tenants/${tenant.id}`} className="card flex items-center gap-3.5 p-4 active:bg-surface-2">
            <Avatar name={tenant.name} photoUrl={tenant.photoUrl} size={58} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[17px] font-bold tracking-tight">{tenant.name}</p>
              {tenant.nickname ? <p className="text-[13px] text-muted">({tenant.nickname})</p> : null}
              <p className="mt-1 text-[13px] text-muted">{tenant.phone || "ยังไม่มีเบอร์โทร"}</p>
            </div>
            <Badge tone="ok">อยู่ปัจจุบัน</Badge>
          </Link>
        ) : (
          <div className="card px-4 py-6 text-center">
            <p className="text-[16px] font-bold">ห้องว่าง</p>
            <p className="mt-1 text-[13px] text-muted">ราคาป้าย {baht(room.baseRent)} บาท/เดือน</p>
          </div>
        )}
      </section>

      {lease ? (
        <section className="px-4 pt-6">
          <SectionHeader title="สัญญาเช่า" />
          <dl className="card divide-y divide-line overflow-hidden text-[14px]">
            {(
              [
                ["ค่าเช่า", `${baht(lease.rent)} บาท/เดือน`],
                ["เงินประกัน", `${baht(lease.deposit)} บาท`],
                ["ค่าล่วงหน้า", `${baht(lease.advance)} บาท`],
                ["เริ่มสัญญา", thaiDate(lease.startDate)],
                ["สิ้นสุดสัญญา", thaiDate(lease.endDate)],
                ["ค่าไฟ", `${lease.rates.elec} บาท/หน่วย`],
                ["ค่าน้ำ", `${lease.rates.water} บาท/หน่วย`],
                ["ค่าแอร์", lease.rates.ac > 0 ? `${baht(lease.rates.ac)} บาท/เดือน` : "ไม่มี"],
                ["ครบกำหนดชำระ", `ทุกวันที่ ${lease.dueDay} ของเดือน`],
              ] as const
            ).map(([label, value]) => (
              <div key={label} className="flex items-center justify-between gap-4 px-4 py-3">
                <dt className="text-muted">{label}</dt>
                <dd className="font-semibold">{value}</dd>
              </div>
            ))}
          </dl>
          {lease.note ? <p className="mt-2 px-1 text-[12px] text-muted">หมายเหตุ: {lease.note}</p> : null}
        </section>
      ) : null}

      <section className="px-4 pt-6">
        <SectionHeader title="จัดการห้องนี้" />
        <RoomManager
          room={room}
          lease={lease}
          tenant={tenant}
          pastTenants={pastTenants}
          defaults={{ rates: property.defaultRates, dueDay: property.paymentDueDay }}
        />
      </section>

      <section className="px-4 pt-6">
        <SectionHeader title="มิเตอร์ล่าสุด" action={lastReading ? cycleLabel(lastReading.cycle, "full") : undefined} />
        {lastReading ? (
          <div className="card grid grid-cols-2 divide-x divide-line">
            <div className="px-4 py-4">
              <p className="text-[12px] text-muted">เลขมิเตอร์ไฟ</p>
              <p className="mt-1 text-[22px] font-bold tracking-tight">{lastReading.elecCurrent}</p>
              <p className="text-[12px] text-muted">
                ใช้ {lastReading.elecCurrent - lastReading.elecPrevious} หน่วย
              </p>
            </div>
            <div className="px-4 py-4">
              <p className="text-[12px] text-muted">เลขมิเตอร์น้ำ</p>
              <p className="mt-1 text-[22px] font-bold tracking-tight">{lastReading.waterCurrent}</p>
              <p className="text-[12px] text-muted">
                ใช้ {lastReading.waterCurrent - lastReading.waterPrevious} หน่วย
              </p>
            </div>
          </div>
        ) : (
          <EmptyState title="ยังไม่เคยจดมิเตอร์ห้องนี้" detail="เปิดหน้าจดมิเตอร์เพื่อเริ่มรอบแรก" />
        )}
      </section>

      <section className="px-4 pt-6">
        <SectionHeader title="ประวัติบิล" action={outstanding > 0 ? `ค้าง ${baht(outstanding)} ฿` : "ไม่มีค้าง"} />
        {bills.length === 0 ? (
          <EmptyState title="ยังไม่มีบิลของห้องนี้" />
        ) : (
          <div className="card divide-y divide-line overflow-hidden">
            {bills.map((bill) => (
              <RowLink
                key={bill.id}
                href={`/bills/${bill.id}`}
                leading={
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-accent-soft text-accent-strong">
                    <IconReceipt />
                  </span>
                }
                title={`${cycleLabel(bill.cycle, "full")} · ${baht(bill.total)} ฿`}
                detail={`${bill.billNo} · ออก ${thaiDate(bill.issuedAt)}`}
                right={<Badge tone={STATUS_TONE[bill.status]}>{BILL_STATUS_LABEL[bill.status]}</Badge>}
              />
            ))}
          </div>
        )}
      </section>
    </AppShell>
  );
}
