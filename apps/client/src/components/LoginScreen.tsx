import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { SUPPORTED_LOCALES, LOCALE_LABELS, type Locale } from "@ib-pos/i18n";
import logo from "../assets/logo-mark.png";
import { ApiError, login } from "../lib/api";
import { sessionFromToken, saveSession } from "../lib/session";
import type { AuthSession } from "../types/auth";

interface LoginScreenProps {
  onSuccess: (session: AuthSession) => void;
}

export function LoginScreen({ onSuccess }: LoginScreenProps) {
  const { t, i18n } = useTranslation();
  const [organizationId, setOrganizationId] = useState("");
  const [loginValue, setLoginValue] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const { accessToken } = await login(organizationId.trim(), loginValue.trim(), password);
      const session = sessionFromToken(accessToken);
      if (!session) {
        setError(t("auth.invalidCredentials"));
        return;
      }
      saveSession(session);
      onSuccess(session);
    } catch (err) {
      if (err instanceof ApiError && err.status === 0) {
        setError(t("auth.networkError"));
      } else {
        setError(t("auth.invalidCredentials"));
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex h-screen items-center justify-center bg-slate-100 px-4">
      <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-sm">
        <div className="mb-6 flex flex-col items-center gap-2">
          <img src={logo} alt="IB-POS" className="h-12 w-12" />
          <span className="text-lg font-bold text-slate-900">IB-POS</span>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <label className="block text-xs font-medium text-slate-500">
            {t("auth.orgId")}
            <input
              value={organizationId}
              onChange={(e) => setOrganizationId(e.target.value)}
              required
              autoFocus
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-accent"
            />
            <span className="mt-1 block text-[11px] font-normal text-slate-400">{t("auth.orgIdHint")}</span>
          </label>

          <label className="block text-xs font-medium text-slate-500">
            {t("auth.login")}
            <input
              value={loginValue}
              onChange={(e) => setLoginValue(e.target.value)}
              required
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-accent"
            />
          </label>

          <label className="block text-xs font-medium text-slate-500">
            {t("auth.password")}
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-accent"
            />
          </label>

          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-lg bg-accent py-2.5 text-sm font-bold text-white hover:bg-accent-hover disabled:opacity-40"
          >
            {submitting ? t("auth.signingIn") : t("auth.signIn")}
          </button>
        </form>

        <div className="mt-5 flex justify-center gap-1 rounded-lg bg-slate-100 p-1">
          {SUPPORTED_LOCALES.map((locale: Locale) => (
            <button
              key={locale}
              type="button"
              onClick={() => i18n.changeLanguage(locale)}
              className={`rounded-md px-2 py-1 text-xs font-medium transition ${
                i18n.language === locale ? "bg-accent text-white" : "text-slate-500 hover:text-slate-800"
              }`}
            >
              {LOCALE_LABELS[locale]}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
