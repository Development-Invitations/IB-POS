import type { ChangeEvent } from "react";
import { formatSum } from "../lib/format";

interface AmountInputProps {
  value: number;
  onChange: (value: number) => void;
  className?: string;
  autoFocus?: boolean;
}

// Маска суммы: пока вводишь цифры, они сразу форматируются с разделителем разрядов
// ("25000" -> "25 000"), как итог/цены везде в приложении (см. lib/format.ts).
export function AmountInput({ value, onChange, className, autoFocus }: AmountInputProps) {
  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    const digits = e.target.value.replace(/\D/g, "");
    onChange(digits ? Number(digits) : 0);
  }

  return (
    <input
      type="text"
      inputMode="numeric"
      autoFocus={autoFocus}
      value={value ? formatSum(value) : ""}
      onChange={handleChange}
      className={className}
    />
  );
}
