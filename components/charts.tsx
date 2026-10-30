"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

// Fixed series order (see --color-series-* in globals.css). Colour follows the
// entity: callers pass a stable series index, never a rank.
export const SERIES = ["#1d7a4f", "#3b6fd0", "#c96d12", "#b8457a"];
const INK_MUTED = "#5e5a52";
const GRID = "#ebe8e2";
const axis = { stroke: GRID, tick: { fill: INK_MUTED, fontSize: 12 }, tickLine: false } as const;

const fmtWeek = (w: string) => new Date(`${w}T00:00:00`).toLocaleDateString("en-AU", { day: "numeric", month: "short" });

function TooltipBox({ title, rows }: { title: string; rows: { label: string; value: string; color?: string }[] }) {
  return (
    <div className="flex min-w-40 flex-col gap-1 rounded-lg border border-line bg-surface px-3 py-2 text-xs shadow-sm">
      <span className="font-medium text-ink">{title}</span>
      {rows.map((r) => (
        <span key={r.label} className="flex items-center justify-between gap-4 text-ink-muted">
          <span className="flex items-center gap-1.5">
            {r.color && <span className="size-2 rounded-full" style={{ background: r.color }} />}
            {r.label}
          </span>
          <span className="font-medium tabular-nums text-ink">{r.value}</span>
        </span>
      ))}
    </div>
  );
}

export function Legend({ items }: { items: { label: string; series: number }[] }) {
  return (
    <ul className="flex flex-wrap gap-4 text-xs text-ink-muted">
      {items.map((i) => (
        <li key={i.label} className="flex items-center gap-1.5">
          <span className="h-0.5 w-4 rounded" style={{ background: SERIES[i.series] }} />
          {i.label}
        </li>
      ))}
    </ul>
  );
}

type LinePoint = { x: string } & Record<string, number | null | string>;

/** Weekly line chart. Null values (suppressed cells) leave a gap rather than a fake zero. */
export function WeeklyLines({ data, lines, unit = "", height = 260 }: {
  data: LinePoint[];
  lines: { key: string; label: string; series: number }[];
  unit?: string;
  height?: number;
}) {
  return (
    <div className="flex flex-col gap-3">
      {lines.length > 1 && <Legend items={lines} />}
      <div style={{ height }}>
        <ResponsiveContainer>
          <LineChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: -12 }}>
            <CartesianGrid stroke={GRID} vertical={false} />
            <XAxis dataKey="x" tickFormatter={fmtWeek} {...axis} minTickGap={24} />
            <YAxis {...axis} axisLine={false} tickFormatter={(v) => `${v}${unit}`} width={48} />
            <Tooltip
              cursor={{ stroke: INK_MUTED, strokeDasharray: "3 3" }}
              content={({ active, payload, label }) =>
                active && payload?.length ? (
                  <TooltipBox
                    title={`Week of ${fmtWeek(String(label))}`}
                    rows={lines.map((l) => {
                      const v = payload.find((p) => p.dataKey === l.key)?.value;
                      return { label: l.label, value: v == null ? "<5" : `${v}${unit}`, color: SERIES[l.series] };
                    })}
                  />
                ) : null
              }
            />
            {lines.map((l) => (
              <Line
                key={l.key}
                dataKey={l.key}
                name={l.label}
                stroke={SERIES[l.series]}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, stroke: "#fff", strokeWidth: 2 }}
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/** Horizontal bars for one measure. `value` null renders as "<5" with no bar. */
export function Bars({ data, unit = "", series = 0, height }: {
  data: { label: string; value: number | null; note?: string; highlight?: boolean }[];
  unit?: string;
  series?: number;
  height?: number;
}) {
  const rows = data.map((d) => ({ ...d, shown: d.value ?? 0, text: d.value == null ? "<5" : `${d.value}${unit}${d.note ? ` · ${d.note}` : ""}` }));
  return (
    <div style={{ height: height ?? Math.max(120, rows.length * 44) }}>
      <ResponsiveContainer>
        <BarChart data={rows} layout="vertical" margin={{ top: 0, right: 120, bottom: 0, left: 0 }} barCategoryGap={10}>
          <CartesianGrid stroke={GRID} horizontal={false} />
          <XAxis type="number" hide domain={[0, "dataMax"]} />
          <YAxis type="category" dataKey="label" width={150} {...axis} axisLine={false} />
          <Tooltip
            cursor={{ fill: "#f3f1ec" }}
            content={({ active, payload }) =>
              active && payload?.length ? (
                <TooltipBox title={String(payload[0].payload.label)} rows={[{ label: "Value", value: payload[0].payload.text }]} />
              ) : null
            }
          />
          <Bar dataKey="shown" fill={SERIES[series]} radius={[0, 4, 4, 0]} isAnimationActive={false}>
            <LabelList dataKey="text" position="right" fill={INK_MUTED} fontSize={12} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
