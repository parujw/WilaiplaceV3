import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { IconBack } from "@/components/icons";
import { cycleLabel } from "@/lib/format";
import { requireContext } from "@/lib/guard";
import { getWorld } from "@/lib/repo";
import { WorldOffice } from "./WorldOffice";

export const dynamic = "force-dynamic";

/** W World — ออฟฟิศพิกเซลของพนักงานอัตโนมัติ แต่ละคนถือคิวงานจากข้อมูลจริงของอาคาร */
export default async function WorldPage() {
  const { property } = await requireContext();
  const world = await getWorld(property.id);

  return (
    <AppShell>
      <header className="flex items-center gap-3 px-4 pb-4 pt-8">
        <Link href="/" aria-label="กลับ" className="grid h-10 w-10 place-items-center rounded-full bg-surface">
          <IconBack />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="text-[22px] font-bold leading-tight tracking-tight">W World</h1>
          <p className="truncate text-[13px] text-muted">
            ทีมอัตโนมัติ · {property.name} · {cycleLabel(world.cycle, "full")}
          </p>
        </div>
      </header>
      <WorldOffice world={world} propertyName={property.name} />
    </AppShell>
  );
}
