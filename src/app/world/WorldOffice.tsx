"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { AgentId, AgentStatus, World, WorldAgent } from "@/lib/world";

/* ------------------------------------------------------------------ */
/* พิกเซลอาร์ต — วาดทุกอย่างด้วย <rect> ใน SVG ไม่ใช้รูปหรือฟอนต์ภายนอก      */
/* ------------------------------------------------------------------ */

type Palette = Record<string, string>;

/** รวมพิกเซลติดกันในแถวเป็น rect เดียว ไม่งั้นตัวละครหนึ่งตัวเป็นร้อย rect */
function Pixels({ rows, palette, x = 0, y = 0, scale = 1 }: { rows: string[]; palette: Palette; x?: number; y?: number; scale?: number }) {
  const rects: React.ReactNode[] = [];
  rows.forEach((row, ry) => {
    let start = 0;
    for (let i = 1; i <= row.length; i++) {
      if (i < row.length && row[i] === row[start]) continue;
      const key = row[start];
      const fill = palette[key];
      if (fill) {
        rects.push(
          <rect key={`${ry}-${start}`} x={x + start * scale} y={y + ry * scale} width={(i - start) * scale} height={scale} fill={fill} />,
        );
      }
      start = i;
    }
  });
  return <>{rects}</>;
}

const FONT: Record<string, string[]> = {
  W: ["1...1", "1...1", "1.1.1", "11.11", "1...1"],
  O: [".111.", "1...1", "1...1", "1...1", ".111."],
  R: ["1111.", "1...1", "1111.", "1..1.", "1...1"],
  L: ["1....", "1....", "1....", "1....", "11111"],
  D: ["1111.", "1...1", "1...1", "1...1", "1111."],
};

function Logo() {
  const big = 7;
  const small = 3.2;
  const letters: Array<[string, string]> = [
    ["W", "#5dd39e"],
    ["O", "#ffd166"],
    ["R", "#e8703a"],
    ["L", "#4cc9f0"],
    ["D", "#f472b6"],
  ];
  const wWidth = 5 * big;
  const worldWidth = letters.length * 6 * small - small;
  const total = wWidth + 10 + worldWidth;
  return (
    <svg viewBox={`-4 -4 ${total + 8} ${5 * big + 10}`} className="mx-auto block w-[78%]" shapeRendering="crispEdges" aria-label="W World">
      <Pixels rows={FONT.W} palette={{ "1": "#1b1240" }} x={3} y={3} scale={big} />
      <Pixels rows={FONT.W} palette={{ "1": "#e8703a" }} scale={big} />
      <Pixels rows={FONT.W.slice(0, 2)} palette={{ "1": "#ffb38a" }} scale={big} />
      {letters.map(([ch, color], i) => {
        const x = wWidth + 10 + i * 6 * small;
        const y = 5 * big - 5 * small;
        return (
          <g key={ch}>
            <Pixels rows={FONT[ch]} palette={{ "1": "#1b1240" }} x={x + 1.5} y={y + 1.5} scale={small} />
            <Pixels rows={FONT[ch]} palette={{ "1": color }} x={x} y={y} scale={small} />
          </g>
        );
      })}
    </svg>
  );
}

/* --------------------------- ตัวละคร --------------------------- */

const BODY = [
  "..hhhh..",
  ".hhhhhh.",
  ".hsssshh",
  ".seseseh",
  ".ssssss.",
  "..smms..",
  ".cccccc.",
  "cccaaccc",
  "sccaaccs",
  ".cccccc.",
];

interface Look {
  hair: string;
  shirt: string;
  accent: string;
  /** แถวบนที่วาดทับ เช่น หมวกช่าง หูฟัง */
  top?: string[];
  topColor?: string;
}

const LOOKS: Record<AgentId, Look> = {
  head: { hair: "#2b2b36", shirt: "#3a3f8f", accent: "#e8703a", top: ["..kkkk..", ".k....k."], topColor: "#ffd166" },
  meter: { hair: "#6b3e1f", shirt: "#2f9e6d", accent: "#ffd166" },
  billing: { hair: "#1f1f28", shirt: "#e8703a", accent: "#ffffff" },
  line: { hair: "#3b2a4a", shirt: "#06c755", accent: "#ffffff", top: ["k......k", "k......k"], topColor: "#22222a" },
  collect: { hair: "#8a4b2a", shirt: "#d9503f", accent: "#ffd166" },
  repair: { hair: "#3a2a1a", shirt: "#4cc9f0", accent: "#22222a", top: ["..kkkk..", ".kkkkkk."], topColor: "#f5c518" },
  lease: { hair: "#c9c9d1", shirt: "#7c5cd6", accent: "#ffffff" },
  rooms: { hair: "#d9824b", shirt: "#f472b6", accent: "#ffffff" },
};

function Character({ id, x, y }: { id: AgentId; x: number; y: number }) {
  const look = LOOKS[id];
  const palette: Palette = { h: look.hair, s: "#f6c9a0", e: "#1b1240", m: "#c2410c", c: look.shirt, a: look.accent };
  return (
    <g className="w-bob">
      <Pixels rows={BODY} palette={palette} x={x} y={y} />
      {look.top ? <Pixels rows={look.top} palette={{ k: look.topColor! }} x={x} y={y} /> : null}
    </g>
  );
}

/* ---------------------------- โต๊ะ ---------------------------- */

const SCREEN: Record<AgentStatus, { bg: string; icon: string[]; color: string }> = {
  idle: { bg: "#123d2a", color: "#5dd39e", icon: [".....", "....1", "...1.", "1.1..", ".1..."] },
  waiting: { bg: "#1b2240", color: "#8fa3ff", icon: [".....", "11111", ".....", "11111", "....."] },
  busy: { bg: "#3d2a10", color: "#ffd166", icon: [".....", ".....", "1.1.1", ".....", "....."] },
  alert: { bg: "#40121a", color: "#ff5a5a", icon: ["..1..", "..1..", "..1..", ".....", "..1.."] },
};

function Desk({ x, y, status }: { x: number; y: number; status: AgentStatus }) {
  const screen = SCREEN[status];
  return (
    <g>
      {/* จอ */}
      <rect x={x + 17} y={y - 3} width={11} height={9} fill="#2a2a35" />
      <rect x={x + 18} y={y - 2} width={9} height={7} fill={screen.bg} />
      <g className={status === "alert" ? "w-blink" : undefined}>
        <Pixels rows={screen.icon} palette={{ "1": screen.color }} x={x + 20} y={y - 1} />
      </g>
      <rect x={x + 21} y={y + 6} width={3} height={2} fill="#2a2a35" />
      {/* ตัวโต๊ะ */}
      <rect x={x} y={y + 8} width={28} height={3} fill="#b07a4f" />
      <rect x={x} y={y + 11} width={28} height={6} fill="#8a5a36" />
      <rect x={x + 2} y={y + 12} width={6} height={4} fill="#a06a42" />
      <rect x={x + 3} y={y + 13} width={4} height={1} fill="#d9a066" />
      {/* แก้วกาแฟ */}
      <rect x={x + 3} y={y + 5} width={3} height={3} fill="#ffffff" />
      <rect x={x + 6} y={y + 6} width={1} height={1} fill="#ffffff" />
    </g>
  );
}

const BUBBLE: Record<AgentStatus, string> = {
  idle: "#2f9e6d",
  waiting: "#6b7bd6",
  busy: "#d99e2b",
  alert: "#d9503f",
};

function Bubble({ x, y, agent }: { x: number; y: number; agent: WorldAgent }) {
  if (agent.status === "idle") return null;
  const text = agent.status === "waiting" ? "zz" : agent.status === "alert" ? "!" : String(Math.min(agent.tasks.length, 99));
  const w = Math.max(9, text.length * 5 + 4);
  return (
    <g className={agent.status === "alert" ? "w-blink" : "w-float"}>
      <rect x={x} y={y} width={w} height={8} fill="#ffffff" stroke={BUBBLE[agent.status]} strokeWidth={1} />
      <rect x={x + 2} y={y + 8} width={2} height={2} fill="#ffffff" />
      <text x={x + w / 2} y={y + 6.4} textAnchor="middle" fontSize={6.5} fontWeight={800} fill={BUBBLE[agent.status]} fontFamily="ui-monospace, monospace">
        {text}
      </text>
    </g>
  );
}

/* ---------------------------- ห้องทำงาน ---------------------------- */

interface Cell {
  id: AgentId;
  x: number;
  y: number;
  w: number;
  h: number;
  floor: string;
}

const CELLS: Cell[] = [
  { id: "head", x: 62, y: 22, w: 76, h: 44, floor: "#dcd3ff" },
  { id: "meter", x: 4, y: 22, w: 54, h: 44, floor: "#e3f4ea" },
  { id: "billing", x: 142, y: 22, w: 54, h: 44, floor: "#fde9dc" },
  { id: "line", x: 4, y: 72, w: 60, h: 44, floor: "#ddf6e5" },
  { id: "collect", x: 70, y: 72, w: 60, h: 44, floor: "#fbe0dd" },
  { id: "repair", x: 136, y: 72, w: 60, h: 44, floor: "#dcf1fb" },
  { id: "lease", x: 4, y: 122, w: 60, h: 44, floor: "#ebe4fb" },
  { id: "rooms", x: 70, y: 122, w: 60, h: 44, floor: "#fde4f0" },
];

function Plant({ x, y }: { x: number; y: number }) {
  return (
    <Pixels
      x={x}
      y={y}
      rows={[".g.g.", "ggggg", ".ggg.", "..g..", ".ppp.", ".ppp."]}
      palette={{ g: "#3fa34d", p: "#b5532a" }}
    />
  );
}

function Office({ world, selected, onSelect }: { world: World; selected: AgentId; onSelect: (id: AgentId) => void }) {
  const byId = useMemo(() => new Map(world.agents.map((a) => [a.id, a])), [world.agents]);

  return (
    <svg viewBox="0 0 200 172" className="block w-full" shapeRendering="crispEdges" role="group" aria-label="แผนผังออฟฟิศ">
      {/* พื้นและผนัง */}
      <rect width={200} height={172} fill="#f4efe6" />
      {Array.from({ length: 21 }, (_, i) => (
        <rect key={`t${i}`} x={i * 10} y={0} width={1} height={172} fill="#ebe4d8" />
      ))}
      <rect width={200} height={18} fill="#c9c2e8" />
      <rect y={16} width={200} height={2} fill="#9f96cf" />
      {[14, 40, 150, 176].map((x) => (
        <g key={x}>
          <rect x={x} y={3} width={16} height={10} fill="#ffffff" />
          <rect x={x + 1} y={4} width={14} height={8} fill="#8fd3ff" />
          <rect x={x + 8} y={4} width={1} height={8} fill="#ffffff" />
        </g>
      ))}
      {/* ป้าย HQ */}
      <rect x={68} y={4} width={64} height={10} fill="#ffd166" />
      <rect x={68} y={13} width={64} height={1} fill="#c99a2e" />
      <text x={100} y={11.5} textAnchor="middle" fontSize={6} fontWeight={800} fill="#1b1240" fontFamily="ui-monospace, monospace">
        WILAI HQ
      </text>

      {CELLS.map((cell) => {
        const agent = byId.get(cell.id)!;
        const active = selected === cell.id;
        const cx = cell.x + cell.w / 2 - 14;
        const deskY = cell.y + 22;
        return (
          <g
            key={cell.id}
            role="button"
            tabIndex={0}
            aria-label={`${agent.name} ${agent.role}: ${agent.summary}`}
            aria-pressed={active}
            onClick={() => onSelect(cell.id)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onSelect(cell.id);
              }
            }}
            className="cursor-pointer outline-none"
          >
            <rect x={cell.x} y={cell.y} width={cell.w} height={cell.h} fill={cell.floor} />
            <rect x={cell.x} y={cell.y} width={cell.w} height={2} fill="#ffffff" opacity={0.7} />
            <rect
              x={cell.x + 0.5}
              y={cell.y + 0.5}
              width={cell.w - 1}
              height={cell.h - 1}
              fill="none"
              stroke={active ? "#ffd166" : "#b9b0d8"}
              strokeWidth={active ? 1.5 : 1}
              className={active ? "w-blink-soft" : undefined}
            />
            {/* ป้ายชื่อ */}
            <rect x={cell.x + 3} y={cell.y + 3} width={agent.name.length * 4 + 4} height={7} fill="#1b1240" />
            <text x={cell.x + 5} y={cell.y + 8.5} fontSize={5} fontWeight={800} fill="#ffffff" fontFamily="ui-monospace, monospace">
              {agent.name}
            </text>
            <Character id={cell.id} x={cx + 5} y={deskY - 8} />
            <Desk x={cx} y={deskY} status={agent.status} />
            <Bubble x={cx + 20} y={cell.y + 3} agent={agent} />
            {cell.id === "head" ? (
              <>
                <Plant x={cell.x + 4} y={cell.y + 32} />
                <Plant x={cell.x + cell.w - 9} y={cell.y + 32} />
                {/* กระดานงาน */}
                <rect x={cell.x + cell.w - 22} y={cell.y + 12} width={18} height={12} fill="#ffffff" stroke="#9f96cf" strokeWidth={0.5} />
                {world.agents.slice(1).map((a, i) => (
                  <rect key={a.id} x={cell.x + cell.w - 20 + (i % 4) * 4} y={cell.y + 14 + Math.floor(i / 4) * 5} width={3} height={3} fill={BUBBLE[a.status]} />
                ))}
              </>
            ) : null}
          </g>
        );
      })}

      {/* มุมกาแฟ / ห้องประชุม */}
      <g>
        <rect x={136} y={122} width={60} height={44} fill="#efe9dd" />
        <rect x={136.5} y={122.5} width={59} height={43} fill="none" stroke="#b9b0d8" />
        <rect x={139} y={125} width={34} height={7} fill="#1b1240" />
        <text x={141} y={130.5} fontSize={5} fontWeight={800} fill="#ffffff" fontFamily="ui-monospace, monospace">
          MEETING
        </text>
        <rect x={148} y={140} width={36} height={12} fill="#ffffff" />
        <rect x={148} y={152} width={36} height={2} fill="#c9c2e8" />
        {[150, 162, 174].map((x) => (
          <rect key={x} x={x} y={156} width={6} height={4} fill="#7c5cd6" />
        ))}
        <rect x={160} y={143} width={4} height={5} fill="#e8703a" />
        <rect x={168} y={144} width={6} height={4} fill="#4cc9f0" />
        <Plant x={188} y={156} />
      </g>
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* หน้าจอ                                                              */
/* ------------------------------------------------------------------ */

const STATUS_LABEL: Record<AgentStatus, string> = {
  idle: "ว่าง",
  waiting: "รอคิว",
  busy: "มีงาน",
  alert: "ด่วน",
};

const STATUS_CHIP: Record<AgentStatus, string> = {
  idle: "bg-ok/12 text-ok",
  waiting: "bg-[#6b7bd6]/12 text-[#4d5bb8]",
  busy: "bg-warn/15 text-[#96690f]",
  alert: "bg-danger/12 text-danger",
};

const STARS = [
  [6, 10], [18, 70], [30, 30], [44, 88], [57, 14], [66, 52], [78, 80], [88, 22], [94, 62], [12, 48], [72, 6], [40, 60],
];

export function WorldOffice({ world, propertyName }: { world: World; propertyName: string }) {
  const firstBusy = world.agents.find((a) => a.id !== "head" && a.status === "alert") ?? world.agents[0];
  const [selected, setSelected] = useState<AgentId>(firstBusy.id);
  const agent = world.agents.find((a) => a.id === selected) ?? world.agents[0];

  return (
    <div className="px-4">
      {/* เวที */}
      <section className="relative overflow-hidden rounded-[1.25rem] bg-[#22196b] px-3 pb-3 pt-3 shadow-[var(--shadow-card)]">
        {STARS.map(([left, top], i) => (
          <span
            key={i}
            className="w-twinkle absolute h-[3px] w-[3px] bg-white/80"
            style={{ left: `${left}%`, top: `${top}%`, animationDelay: `${(i % 5) * 0.4}s` }}
          />
        ))}
        <div className="relative flex items-center justify-between font-mono text-[11px] font-bold uppercase tracking-widest text-white/90">
          <span>1P</span>
          <span>
            TASKS <span className="text-[#ffd166]">{world.totalTasks}</span>
          </span>
          <span>
            LV <span className="text-[#5dd39e]">{world.clear}</span>/{world.agents.length - 1}
          </span>
        </div>
        <div className="relative pt-3">
          <Logo />
          <p className="mt-1 text-center font-mono text-[10px] font-bold uppercase tracking-[0.5em] text-white/80">Agent World</p>
          <p className="mt-1 truncate text-center text-[12px] font-semibold text-white">ออฟฟิศทีมอัตโนมัติของ {propertyName}</p>
        </div>
        <div className="relative mt-3 overflow-hidden rounded-lg ring-2 ring-[#9f96cf]">
          <Office world={world} selected={selected} onSelect={setSelected} />
        </div>
        <p className="relative mt-2 text-center text-[11px] text-white/70">แตะที่โต๊ะเพื่อดูคิวงานของแต่ละคน</p>
      </section>

      {/* รายชื่อพนักงาน */}
      <section className="no-scrollbar -mx-4 mt-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {world.agents.map((a) => (
          <button
            key={a.id}
            type="button"
            onClick={() => setSelected(a.id)}
            aria-pressed={a.id === selected}
            className={`flex shrink-0 items-center gap-2 rounded-full px-3 py-2 text-[12px] font-semibold transition-colors ${
              a.id === selected ? "bg-ink text-white" : "bg-surface text-ink-2"
            }`}
          >
            <span className="h-2 w-2 rounded-full" style={{ background: BUBBLE[a.status] }} />
            <span className="font-mono tracking-wide">{a.name}</span>
            {a.tasks.length > 0 ? <span className="opacity-70">{a.tasks.length}</span> : null}
          </button>
        ))}
      </section>

      {/* รายละเอียด */}
      <section className="card mt-3 p-4">
        <div className="flex items-start gap-3">
          <svg viewBox="-1 -1 10 12" className="h-14 w-12 shrink-0 rounded-xl bg-[#22196b] p-1.5" shapeRendering="crispEdges" aria-hidden>
            <Character id={agent.id} x={0} y={0} />
          </svg>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="font-mono text-[16px] font-extrabold tracking-wide">{agent.name}</p>
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${STATUS_CHIP[agent.status]}`}>
                {STATUS_LABEL[agent.status]}
              </span>
            </div>
            <p className="text-[13px] text-muted">{agent.role}</p>
            <p className="mt-1 text-[14px] font-semibold">{agent.summary}</p>
          </div>
        </div>

        <div className="mt-4 rounded-xl bg-surface-2 p-3">
          <div className="flex items-center justify-between">
            <p className="text-[12px] font-bold text-ink-2">Automation</p>
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                agent.automation.mode === "auto" ? "bg-ok/12 text-ok" : "bg-accent-soft text-accent-strong"
              }`}
            >
              {agent.automation.mode === "auto" ? "ทำเองได้" : "รอเจ้าของกดยืนยัน"}
            </span>
          </div>
          <p className="mt-1.5 text-[13px]">
            <span className="text-muted">เมื่อ</span> {agent.automation.trigger}
          </p>
          <p className="text-[13px]">
            <span className="text-muted">ทำ</span> {agent.automation.action}
          </p>
          <code className="mt-1.5 inline-block rounded bg-surface px-1.5 py-0.5 font-mono text-[11px] text-ink-2">
            {agent.automation.cron}
          </code>
        </div>

        {agent.tasks.length > 0 ? (
          <ul className="mt-4 divide-y divide-line">
            {agent.tasks.slice(0, 8).map((t) => (
              <li key={t.id}>
                <Link href={t.href} className="flex items-center gap-3 py-2.5 active:opacity-70">
                  <span className="h-2 w-2 shrink-0" style={{ background: BUBBLE[agent.status] }} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-semibold">{t.label}</span>
                    {t.detail ? <span className="block truncate text-[12px] text-muted">{t.detail}</span> : null}
                  </span>
                  <span className="text-[13px] text-accent">›</span>
                </Link>
              </li>
            ))}
            {agent.tasks.length > 8 ? (
              <li className="py-2.5 text-[12px] text-muted">และอีก {agent.tasks.length - 8} งาน</li>
            ) : null}
          </ul>
        ) : (
          <p className="mt-4 text-center text-[13px] text-muted">ไม่มีงานค้าง ✓</p>
        )}

        <Link
          href={agent.href}
          className="mt-4 block rounded-full bg-accent py-3 text-center text-[14px] font-bold text-white active:bg-accent-strong"
        >
          ไปหน้างานของ {agent.name}
        </Link>
      </section>

      <p className="mt-4 px-2 text-center text-[11px] leading-relaxed text-muted">
        คิวงานชุดนี้อ่านเป็น JSON ได้ที่ <code className="font-mono">/api/world</code> เพื่อต่อกับตัวตั้งเวลา
        งานที่แตะเงินหรือส่งถึงผู้เช่าจะรอเจ้าของกดยืนยันเสมอ
      </p>
    </div>
  );
}
