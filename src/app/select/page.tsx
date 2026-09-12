import Link from "next/link";
import { redirect } from "next/navigation";
import { Avatar, Badge, PropertyImage } from "@/components/ui";
import { IconChevron, IconDoor, IconPin } from "@/components/icons";
import { getSummary, listProperties } from "@/lib/repo";
import { getSessionUser } from "@/lib/session";
import { AddPropertyForm } from "@/components/AddPropertyForm";
import { PropertyPicker, SignOutButton } from "./PropertyPicker";

export const dynamic = "force-dynamic";

export default async function SelectPropertyPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const properties = await listProperties(user);
  const summaries = await Promise.all(properties.map((p) => getSummary(p.id)));

  return (
    <div className="app-frame px-4 pb-10 pt-10">
      <header className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[13px] font-semibold uppercase tracking-[0.16em] text-accent">Wilai Communities</p>
          <h1 className="mt-1.5 text-[26px] font-bold leading-tight tracking-tight">เลือกอาคาร</h1>
          <p className="mt-1 text-[14px] text-muted">สวัสดี {user.name}</p>
        </div>
        <Avatar name={user.name} photoUrl={user.photoUrl} size={44} />
      </header>

      <div className="mt-7 space-y-3">
        {properties.length === 0 ? (
          <div className="card px-6 py-8 text-center">
            <p className="text-[17px] font-bold">ยังไม่มีอาคารในระบบ</p>
            <p className="mt-1.5 text-[13px] leading-relaxed text-muted">
              นำข้อมูลเดิมจากวิไลเพลส V2 เข้ามาก่อน แล้วห้อง ผู้เช่า สัญญา และบิลจะขึ้นครบทันที
            </p>
            {user.role === "owner" ? (
              <Link
                href="/settings/migrate"
                className="mt-5 block rounded-2xl bg-accent px-5 py-3.5 text-[15px] font-bold text-white"
              >
                ย้ายข้อมูลจาก V2
              </Link>
            ) : null}
          </div>
        ) : null}

        {properties.map((property, i) => {
          const s = summaries[i];
          const occupancy = s.rooms === 0 ? 0 : Math.round((s.occupied / s.rooms) * 100);
          return (
            <PropertyPicker key={property.id} propertyId={property.id}>
              <article className="card overflow-hidden">
                <div className="relative h-40">
                  <PropertyImage photoUrl={property.photoUrl} name={property.name} />
                  <div className="absolute left-3 top-3">
                    <span className="rounded-full bg-black/45 px-2.5 py-1 text-[11px] font-semibold text-white backdrop-blur-sm">
                      {property.shortName}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-3 px-4 py-3.5">
                  <div className="min-w-0 flex-1">
                    <h2 className="truncate text-[17px] font-bold tracking-tight">{property.name}</h2>
                    <p className="mt-0.5 flex items-center gap-1 truncate text-[13px] text-muted">
                      <IconPin className="h-3.5 w-3.5 shrink-0" />
                      {property.address || "ยังไม่ได้ระบุที่อยู่"}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <Badge tone="accent">
                        <IconDoor className="mr-1 h-3.5 w-3.5" />
                        {s.occupied}/{s.rooms} ห้อง
                      </Badge>
                      <Badge tone={occupancy >= 80 ? "ok" : "warn"}>เข้าอยู่ {occupancy}%</Badge>
                      {s.outstanding > 0 ? <Badge tone="danger">ค้าง {s.outstanding.toLocaleString("th-TH")} ฿</Badge> : null}
                    </div>
                  </div>
                  <IconChevron className="h-5 w-5 shrink-0 text-muted" />
                </div>
              </article>
            </PropertyPicker>
          );
        })}
      </div>

      {user.role === "owner" ? (
        <div className="mt-4">
          <AddPropertyForm />
        </div>
      ) : null}

      <div className="mt-8 text-center">
        <SignOutButton />
      </div>
    </div>
  );
}
