interface CheckboxProps {
  checked: boolean;
  onChange: () => void;
  ariaLabel?: string;
  className?: string;
}

// Не из исходного ТЗ — по прямому запросу клиента: голый <input type="checkbox"> рисуется
// системным браузерным чекбоксом (у нас нет @tailwindcss/forms) — не под дизайн остального
// приложения (скруглённые карточки, красный акцент). appearance-none снимает системный вид,
// дальше рисуем сами: рамка slate, при отметке — заливка accent и белая галочка (SVG в фоне).
export function Checkbox({ checked, onChange, ariaLabel, className }: CheckboxProps) {
  return (
    <input
      type="checkbox"
      checked={checked}
      onChange={onChange}
      aria-label={ariaLabel}
      className={`h-4 w-4 shrink-0 cursor-pointer appearance-none rounded border border-slate-300 bg-white bg-center bg-no-repeat transition-colors checked:border-accent checked:bg-accent checked:bg-[url("data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%2016%2016'%20fill='white'%3E%3Cpath%20d='M13.7%204.3a1%201%200%200%201%200%201.4l-6%206a1%201%200%200%201-1.4%200l-3-3a1%201%200%200%201%201.4-1.4L7%209.6l5.3-5.3a1%201%200%200%201%201.4%200z'/%3E%3C/svg%3E")] focus:outline-none focus:ring-2 focus:ring-accent/30 ${className ?? ""}`}
    />
  );
}
