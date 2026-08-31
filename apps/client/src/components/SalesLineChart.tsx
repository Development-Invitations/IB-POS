import { useState } from "react";
import { useTranslation } from "react-i18next";
import { formatSum } from "../lib/format";

// Лёгкий линейный график без внешней библиотеки — 24 почасовые точки, заливка под линией.
// Используется и на "Главной", и в "Отчётах" — вынесен в отдельный файл, чтобы не дублировать.
// Точки увеличены и кликабельны широкой прозрачной областью (проще навести мышью), подсказка —
// свой стилизованный тултип поверх графика, а не нативный браузерный (тот появляется с задержкой
// и выглядит неаккуратно).
export function SalesLineChart({ points }: { points: { hour: number; total: number }[] }) {
  const { t } = useTranslation();
  const width = 600;
  const height = 140;
  const max = Math.max(1, ...points.map((p) => p.total));
  const [hovered, setHovered] = useState<number | null>(null);

  const coords = points.map((p, i) => {
    const x = (i / (points.length - 1)) * width;
    const y = height - (p.total / max) * (height - 8) - 4;
    return { x, y, ...p };
  });

  const linePath = coords.map((c, i) => `${i === 0 ? "M" : "L"}${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(" ");
  const areaPath = `${linePath} L${width},${height} L0,${height} Z`;
  const active = hovered !== null ? coords[hovered] : null;

  return (
    <div className="relative">
      {active && (
        <div
          className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-lg bg-slate-800 px-2.5 py-1.5 text-xs text-white shadow-lg"
          style={{
            left: `${(active.x / width) * 100}%`,
            top: `${(active.y / height) * 100}%`,
            marginTop: "-10px",
          }}
        >
          <div className="font-semibold">
            {formatSum(active.total)} {t("common.currency")}
          </div>
          <div className="text-slate-300">{active.hour}:00</div>
        </div>
      )}
      <svg viewBox={`0 0 ${width} ${height}`} className="h-36 w-full overflow-visible" preserveAspectRatio="none">
        <defs>
          <linearGradient id="salesFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ef4444" stopOpacity="0.25" />
            <stop offset="100%" stopColor="#ef4444" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={areaPath} fill="url(#salesFill)" />
        <path d={linePath} fill="none" stroke="#ef4444" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        {hovered !== null && (
          <line
            x1={coords[hovered].x}
            y1={0}
            x2={coords[hovered].x}
            y2={height}
            stroke="#ef4444"
            strokeOpacity={0.25}
            strokeWidth={1}
            strokeDasharray="3 3"
          />
        )}
        {coords.map((c, i) => (
          <g key={c.hour}>
            <circle
              cx={c.x}
              cy={c.y}
              r={hovered === i ? 5 : c.total > 0 ? 3.5 : 2}
              fill={c.total > 0 ? "#ef4444" : "#f8b4b4"}
              stroke="#fff"
              strokeWidth={hovered === i ? 2 : 0}
              className="transition-[r]"
            />
            <circle
              cx={c.x}
              cy={c.y}
              r={12}
              fill="transparent"
              className="cursor-pointer"
              onMouseEnter={() => setHovered(i)}
              onMouseLeave={() => setHovered((h) => (h === i ? null : h))}
            />
          </g>
        ))}
      </svg>
    </div>
  );
}
