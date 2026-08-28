// Цветные "иллюстративные" значки оборудования — не сторонние логотипы/фото (см. обсуждение
// с пользователем: массовая закачка чужих изображений из интернета — риск по лицензиям).
// Собственная плоская отрисовка, крупнее и контрастнее обычных line-icons из icons.tsx.
import type { SVGProps } from "react";

export const BarcodeScannerArt = (p: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" {...p}>
    <rect x="6" y="6" width="20" height="14" rx="3" fill="#334155" />
    <path d="M18 20c0 4-3 7-3 11h5c2-4 4-7 4-11" fill="#334155" />
    <rect x="10" y="10" width="12" height="6" rx="1" fill="#f8fafc" />
    <rect x="11.5" y="11.2" width="1.2" height="3.6" fill="#ef4444" />
    <rect x="14" y="11.2" width="0.8" height="3.6" fill="#ef4444" />
    <rect x="16" y="11.2" width="1.6" height="3.6" fill="#ef4444" />
    <rect x="19" y="11.2" width="0.8" height="3.6" fill="#ef4444" />
    <path d="M27 13c3 0 5 2 5 2s-2 2-5 2" stroke="#ef4444" strokeWidth="1.4" strokeLinecap="round" />
  </svg>
);

export const FiscalPrinterArt = (p: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" {...p}>
    <rect x="7" y="9" width="26" height="15" rx="2.5" fill="#334155" />
    <rect x="12" y="13" width="16" height="4" rx="1" fill="#38bdf8" />
    <path
      d="M11 24h18v6c0 1-.8 1.8-1.8 1.4L25 30l-2 1.5-2-1.5-2 1.5-2-1.5-2 1.5-2-1.5-1.2.4C11.8 31.8 11 31 11 30v-6Z"
      fill="#f8fafc"
      stroke="#cbd5e1"
      strokeWidth="0.6"
    />
    <path d="M14 26.5h10M14 28.5h7" stroke="#94a3b8" strokeWidth="0.9" strokeLinecap="round" />
  </svg>
);

export const CashDrawerArt = (p: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" {...p}>
    <rect x="6" y="12" width="28" height="18" rx="2.5" fill="#475569" />
    <rect x="6" y="12" width="28" height="5" rx="2" fill="#334155" />
    <rect x="10" y="20" width="15" height="8.5" rx="1.2" fill="#22c55e" />
    <path d="M12.5 24.3h10" stroke="#16a34a" strokeWidth="1" strokeLinecap="round" />
    <circle cx="28" cy="24.3" r="3" fill="#facc15" />
    <circle cx="28" cy="24.3" r="1.1" fill="#eab308" />
  </svg>
);

export const CustomerDisplayArt = (p: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" {...p}>
    <rect x="6" y="10" width="28" height="14" rx="2.5" fill="#1e293b" />
    <rect x="9" y="13" width="22" height="8" rx="1" fill="#0f172a" />
    <path d="M12 17h3M17 17h3M22 17h3M27 17h1.5" stroke="#f59e0b" strokeWidth="1.6" strokeLinecap="round" />
    <path d="M17 24v4M23 24v4" stroke="#475569" strokeWidth="2" strokeLinecap="round" />
    <rect x="13" y="28" width="14" height="2.6" rx="1.3" fill="#475569" />
  </svg>
);

export const PaymentTerminalArt = (p: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" {...p}>
    <rect x="10" y="5" width="18" height="30" rx="3.5" fill="#334155" />
    <rect x="12.5" y="8" width="13" height="9" rx="1.2" fill="#38bdf8" />
    <rect x="13" y="19" width="3" height="3" rx="0.6" fill="#94a3b8" />
    <rect x="17" y="19" width="3" height="3" rx="0.6" fill="#94a3b8" />
    <rect x="21" y="19" width="3" height="3" rx="0.6" fill="#94a3b8" />
    <rect x="13" y="23" width="3" height="3" rx="0.6" fill="#94a3b8" />
    <rect x="17" y="23" width="3" height="3" rx="0.6" fill="#94a3b8" />
    <rect x="21" y="23" width="3" height="3" rx="0.6" fill="#94a3b8" />
    <rect x="14" y="27.5" width="10" height="6" rx="1" fill="#f8fafc" />
    <rect x="9" y="29" width="4" height="3.4" rx="0.8" fill="#f97316" transform="rotate(-8 9 29)" />
  </svg>
);
