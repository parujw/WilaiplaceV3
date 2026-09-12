import { cycleLabel } from "@/lib/format";

export interface ChartPoint {
  cycle: string;
  billed: number;
  collected: number;
  rate: number;
}

/**
 * อัตราเก็บเงินได้รายรอบบิล
 * แท่งจางคือยอดที่ออกบิล แท่งทึบคือยอดที่เก็บได้จริง — เทียบกันได้ในภาพเดียว
 */
export function CollectionChart({ data }: { data: ChartPoint[] }) {
  const hasData = data.some((d) => d.billed > 0);

  return (
    <div>
      <div className="flex items-stretch gap-3">
        <div className="flex w-9 shrink-0 flex-col justify-between py-0.5 text-right text-[11px] text-muted">
          {["100%", "75%", "50%", "25%", "0%"].map((t) => <span key={t}>{t}</span>)}
        </div>

        <div className="relative flex-1">
          <div className="absolute inset-0 flex flex-col justify-between">
            {[0, 1, 2, 3, 4].map((i) => <div key={i} className="border-t border-dashed border-line" />)}
          </div>

          <div className="relative flex h-40 items-end gap-2">
            {data.map((d) => {
              const pct = Math.min(100, Math.round(d.rate * 100));
              return (
                <div key={d.cycle} className="flex h-full flex-1 flex-col justify-end">
                  <div className="relative h-full w-full overflow-hidden rounded-t-lg bg-accent-soft">
                    <div
                      className="absolute inset-x-0 bottom-0 rounded-t-lg bg-gradient-to-t from-accent-strong to-accent"
                      style={{ height: `${d.billed === 0 ? 0 : Math.max(pct, 3)}%` }}
                      title={`${cycleLabel(d.cycle, "full")} — เก็บได้ ${pct}%`}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="mt-2 flex gap-2 pl-12">
        {data.map((d) => (
          <span key={d.cycle} className="flex-1 text-center text-[11px] font-medium text-muted">
            {cycleLabel(d.cycle).split(" ")[0]}
          </span>
        ))}
      </div>

      {!hasData ? (
        <p className="mt-3 text-center text-[13px] text-muted">ยังไม่มีบิลในช่วงนี้</p>
      ) : null}
    </div>
  );
}
