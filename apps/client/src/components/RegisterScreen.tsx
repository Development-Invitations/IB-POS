import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { SUPPORTED_LOCALES, LOCALE_LABELS, type Locale } from "@ib-pos/i18n";
import logo from "../assets/logo-mark.png";
import { ApiError, registerOrganization } from "../lib/api";

interface RegisterScreenProps {
  onDone: (organizationId: string, login: string) => void;
  onBackToLogin: () => void;
}

type Phase = "form" | "done";

export function RegisterScreen({ onDone, onBackToLogin }: RegisterScreenProps) {
  const { t, i18n } = useTranslation();
  const [phase, setPhase] = useState<Phase>("form");
  const [orgName, setOrgName] = useState("");
  const [fullName, setFullName] = useState("");
  const [loginValue, setLoginValue] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdOrgId, setCreatedOrgId] = useState("");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError(t("auth.passwordTooShort"));
      return;
    }
    if (password !== confirmPassword) {
      setError(t("auth.passwordMismatch"));
      return;
    }
    setSubmitting(true);
    try {
      const organization = await registerOrganization({
        name: orgName.trim(),
        admin: { fullName: fullName.trim(), login: loginValue.trim(), password },
      });
      setCreatedOrgId(organization.id);
      setPhase("done");
    } catch (err) {
      if (err instanceof ApiError && err.status === 0) {
        setError(t("auth.networkError"));
      } else if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError(t("auth.registerError"));
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex h-full items-center justify-center bg-slate-100 px-4">
      <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-sm">
        <div className="mb-6 flex flex-col items-center gap-2">
          <img src={logo} alt="IB-POS" className="h-12 w-12" />
          <span className="text-lg font-bold text-slate-900">IB-POS</span>
        </div>

        {phase === "form" && (
          <>
            <form onSubmit={handleSubmit} className="space-y-3">
              <label className="block text-xs font-medium text-slate-500">
                {t("auth.orgName")}
                <input
                  value={orgName}
                  onChange={(e) => setOrgName(e.target.value)}
                  required
                  autoFocus
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-accent"
                />
              </label>

              <label className="block text-xs font-medium text-slate-500">
                {t("auth.fullName")}
                <input
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-accent"
                />
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
                  minLength={8}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-accent"
                />
              </label>

              <label className="block text-xs font-medium text-slate-500">
                {t("auth.confirmPassword")}
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
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
                {submitting ? t("auth.registering") : t("auth.register")}
              </button>
            </form>

            <button
              type="button"
              onClick={onBackToLogin}
              className="mt-4 w-full text-center text-xs font-medium text-accent hover:underline"
            >
              {t("auth.backToLogin")}
            </button>
          </>
        )}

        {phase === "done" && (
          <div className="space-y-3 text-center">
            <h2 className="text-lg font-semibold text-slate-800">{t("auth.orgCreatedTitle")}</h2>
            <p className="text-xs text-slate-500">{t("auth.orgCreatedHint")}</p>
            <div className="select-all rounded-lg border border-accent/30 bg-accent/5 px-3 py-3 text-center font-mono text-sm font-semibold text-slate-800">
              {createdOrgId}
            </div>
            <button
              onClick={() => onDone(createdOrgId, loginValue.trim())}
              className="w-full rounded-lg bg-accent py-2.5 text-sm font-bold text-white hover:bg-accent-hover"
            >
              {t("auth.continueToApp")}
            </button>
          </div>
        )}

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
