export function formatSum(amount: number): string {
  return new Intl.NumberFormat("ru-RU").format(Math.round(amount));
}
