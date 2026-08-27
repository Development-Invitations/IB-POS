import type { CartLine } from "../components/ReceiptPanel";

export function computeTotals(lines: CartLine[], discountPercent: number) {
  const subtotal = lines.reduce((sum, line) => sum + line.product.price * line.qty, 0);
  const discountAmount = Math.round((subtotal * discountPercent) / 100);
  const total = subtotal - discountAmount;
  return { subtotal, discountAmount, total };
}
