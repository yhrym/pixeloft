import { t, type Locale } from "@/i18n";

const input = "mt-1 w-full rounded border border-neutral-400 p-2";
export const button = "rounded bg-neutral-800 px-3 py-2 text-white";

export function Field({ locale, label, name, type = "text", hint }: { locale: Locale; label: string; name: string; type?: string; hint?: string }) {
  return (
    <label className="mt-3 block">
      {t(locale, label)}
      <input className={input} name={name} type={type} required autoComplete={type === "password" ? "new-password" : "off"} />
      {hint && <span className="text-sm text-neutral-500">{t(locale, hint)}</span>}
    </label>
  );
}

export function ErrorLine({ locale, code }: { locale: Locale; code?: string }) {
  return code ? <p className="mt-3 text-red-700">{t(locale, `error.${code}`)}</p> : null;
}
