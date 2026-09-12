"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { IconBuilding, IconHome, IconUsers, IconWrench } from "./icons";

const ITEMS = [
  { href: "/", label: "หน้าหลัก", Icon: IconHome, match: (p: string) => p === "/" },
  { href: "/property", label: "อาคาร", Icon: IconBuilding, match: (p: string) => p.startsWith("/property") || p.startsWith("/rooms") },
  { href: "/tenants", label: "ผู้เช่า", Icon: IconUsers, match: (p: string) => p.startsWith("/tenants") },
  { href: "/maintenance", label: "แจ้งซ่อม", Icon: IconWrench, match: (p: string) => p.startsWith("/maintenance") },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="no-print pointer-events-none fixed inset-x-0 bottom-0 z-30">
      <div className="mx-auto w-full max-w-[30rem] px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="pointer-events-auto flex items-center justify-between gap-1 rounded-full bg-surface p-1.5 shadow-[0_4px_12px_rgb(23_23_27/0.08),0_16px_40px_-16px_rgb(23_23_27/0.28)]">
          {ITEMS.map(({ href, label, Icon, match }) => {
            const active = match(pathname);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={`flex flex-1 items-center justify-center gap-1.5 rounded-full px-2 py-2.5 text-[13px] font-semibold transition-colors ${
                  active ? "bg-accent-soft text-accent-strong" : "text-ink-2"
                }`}
              >
                <Icon className="h-[22px] w-[22px]" />
                {active ? <span className="truncate">{label}</span> : <span className="sr-only">{label}</span>}
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
