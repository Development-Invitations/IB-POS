export function formatSum(amount: number): string {
  return new Intl.NumberFormat("ru-RU").format(Math.round(amount));
}

// "5 минут назад" и т.п. — для статусов вроде "последний обмен с 1С" (см. IntegrationsScreen.tsx),
// где точная дата менее важна, чем "это было только что или уже давно".
export function formatRelativeTime(iso: string, t: (key: string, opts?: Record<string, unknown>) => string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return t("common.justNow");
  if (minutes < 60) return t("common.minutesAgo", { count: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t("common.hoursAgo", { count: hours });
  const days = Math.floor(hours / 24);
  return t("common.daysAgo", { count: days });
}
