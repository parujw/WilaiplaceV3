import Link from "next/link";
import { initials } from "@/lib/format";
import { IconChevron } from "./icons";

/* ---------------------------------- รูปคน --------------------------------- */

export function Avatar({
  name, photoUrl, size = 44, className = "",
}: { name: string; photoUrl?: string | null; size?: number; className?: string }) {
  const style = { width: size, height: size, fontSize: Math.max(11, size * 0.34) };
  if (photoUrl) {
    return (
      // รูปผู้เช่ามาจาก Firebase Storage หรือ data URL — ไม่ผ่าน next/image เพื่อไม่ต้องตั้ง remotePatterns ทุกโดเมน
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={photoUrl}
        alt={name}
        style={style}
        className={`shrink-0 rounded-full object-cover ring-2 ring-white ${className}`}
      />
    );
  }
  return (
    <div
      style={style}
      className={`flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-accent to-accent-strong font-semibold text-white ring-2 ring-white ${className}`}
    >
      {initials(name)}
    </div>
  );
}

/* -------------------------------- การ์ดสรุป ------------------------------- */

export function StatCard({
  icon, label, value, sub, tone = "default", href,
}: {
  icon?: React.ReactNode;
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  tone?: "default" | "accent";
  href?: string;
}) {
  const body = (
    <div className={`card flex h-full flex-col gap-2 p-4 ${tone === "accent" ? "bg-accent text-white" : ""}`}>
      {icon ? (
        <span className={tone === "accent" ? "text-white/90" : "text-accent"}>{icon}</span>
      ) : null}
      <span className={`text-[13px] leading-tight ${tone === "accent" ? "text-white/80" : "text-muted"}`}>
        {label}
      </span>
      <span className="text-[22px] font-bold leading-none tracking-tight">{value}</span>
      {sub ? (
        <span className={`text-xs ${tone === "accent" ? "text-white/75" : "text-muted"}`}>{sub}</span>
      ) : null}
    </div>
  );
  return href ? <Link href={href} className="block h-full">{body}</Link> : body;
}

/* ------------------------------- หัวข้อส่วน ------------------------------- */

export function SectionHeader({
  title, action, href,
}: { title: string; action?: string; href?: string }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <h2 className="text-[17px] font-bold tracking-tight">{title}</h2>
      {action && href ? (
        <Link href={href} className="flex items-center gap-0.5 text-[13px] font-medium text-muted">
          {action}
          <IconChevron className="h-4 w-4" />
        </Link>
      ) : action ? (
        <span className="text-[13px] text-muted">{action}</span>
      ) : null}
    </div>
  );
}

/* ----------------------------------- ป้าย ---------------------------------- */

const TONES = {
  neutral: "bg-surface-2 text-ink-2",
  ok: "bg-ok/12 text-ok",
  warn: "bg-warn/15 text-[#96690f]",
  danger: "bg-danger/12 text-danger",
  accent: "bg-accent-soft text-accent-strong",
} as const;

export function Badge({
  children, tone = "neutral",
}: { children: React.ReactNode; tone?: keyof typeof TONES }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold ${TONES[tone]}`}>
      {children}
    </span>
  );
}

/* -------------------------------- ว่างเปล่า -------------------------------- */

export function EmptyState({ title, detail }: { title: string; detail?: string }) {
  return (
    <div className="card flex flex-col items-center gap-1 px-6 py-10 text-center">
      <p className="font-semibold">{title}</p>
      {detail ? <p className="text-sm text-muted">{detail}</p> : null}
    </div>
  );
}

/* ------------------------------ แถวรายการกดได้ ----------------------------- */

export function RowLink({
  href, title, detail, right, leading,
}: {
  href: string;
  title: React.ReactNode;
  detail?: React.ReactNode;
  right?: React.ReactNode;
  leading?: React.ReactNode;
}) {
  return (
    <Link href={href} className="flex items-center gap-3 px-4 py-3 active:bg-surface-2">
      {leading}
      <div className="min-w-0 flex-1">
        <div className="truncate text-[15px] font-semibold leading-tight">{title}</div>
        {detail ? <div className="mt-0.5 truncate text-[13px] text-muted">{detail}</div> : null}
      </div>
      {right}
      <IconChevron className="h-4 w-4 shrink-0 text-muted" />
    </Link>
  );
}

/** ภาพอาคาร — ใช้รูปจริงถ้ามี ไม่มีก็วาดตึกให้ดูไม่โล่ง */
export function PropertyImage({
  photoUrl, name, className = "",
}: { photoUrl?: string | null; name: string; className?: string }) {
  if (photoUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={photoUrl} alt={name} className={`h-full w-full object-cover ${className}`} />;
  }
  return (
    <div className={`relative h-full w-full overflow-hidden bg-gradient-to-b from-[#f4b183] via-[#e8703a] to-[#b34a1f] ${className}`}>
      <svg viewBox="0 0 320 180" preserveAspectRatio="xMidYMax slice" className="absolute inset-0 h-full w-full">
        <circle cx="258" cy="42" r="20" fill="#fff" opacity="0.5" />
        <g fill="#2b2118" opacity="0.88">
          <rect x="18" y="74" width="74" height="106" rx="4" />
          <rect x="104" y="46" width="96" height="134" rx="4" />
          <rect x="212" y="86" width="88" height="94" rx="4" />
        </g>
        <g fill="#ffd9a8">
          {[0, 1, 2, 3].map((row) =>
            [0, 1, 2].map((col) => (
              <rect key={`a${row}${col}`} x={30 + col * 20} y={86 + row * 22} width="11" height="13" rx="1.5"
                opacity={(row + col) % 3 === 0 ? 0.35 : 0.95} />
            )),
          )}
          {[0, 1, 2, 3, 4].map((row) =>
            [0, 1, 2, 3].map((col) => (
              <rect key={`b${row}${col}`} x={117 + col * 21} y={60 + row * 23} width="12" height="14" rx="1.5"
                opacity={(row * 2 + col) % 4 === 0 ? 0.3 : 0.95} />
            )),
          )}
          {[0, 1, 2, 3].map((row) =>
            [0, 1, 2].map((col) => (
              <rect key={`c${row}${col}`} x={226 + col * 24} y={98 + row * 22} width="12" height="14" rx="1.5"
                opacity={(row + col) % 2 === 0 ? 0.9 : 0.35} />
            )),
          )}
        </g>
      </svg>
    </div>
  );
}
