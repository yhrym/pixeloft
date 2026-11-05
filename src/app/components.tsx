import Link from "next/link";
import { t, type Locale } from "@/i18n";

export const button = "pg-btn pg-btn-primary";

export function Wordmark() {
  // eslint-disable-next-line @next/next/no-img-element
  return <span className="pg-wordmark"><img src="/icon.svg" alt="" />{"Pixeloft"}</span>;
}

/** ログイン・初期設定・招待・再設定の共通の枠(中央のカード) */
export function AuthCard({ locale, title, children }: { locale: Locale; title: string; children?: React.ReactNode }) {
  return (
    <main className="pg pg-auth">
      <Wordmark />
      <div className="pg-card">
        <h1 className="pg-title" style={{ marginBottom: children ? 16 : 0, fontSize: 18 }}>{t(locale, title)}</h1>
        {children}
      </div>
    </main>
  );
}

/** 管理ページの共通の枠(ワードマーク+戻るリンク+見出し) */
export function AdminShell({ title, back, backHref = "/", sub, wide, children }: { title: string; back: string; backHref?: string; sub?: string; wide?: boolean; children: React.ReactNode }) {
  return (
    <main className={`pg pg-admin${wide ? " pg-wide" : ""}`}>
      <div className="pg-bar"><Wordmark /><Link className="pg-back" href={backHref}>{"← "}{back}</Link></div>
      <h1 className="pg-title">{title}</h1>
      {sub && <p className="pg-sub">{sub}</p>}
      {children}
    </main>
  );
}

export function Field({ locale, label, name, type = "text", hint }: { locale: Locale; label: string; name: string; type?: string; hint?: string }) {
  return (
    <label className="pg-field">
      <span className="pg-label">{t(locale, label)}</span>
      <input className="pg-input" name={name} type={type} required autoComplete={type === "password" ? "new-password" : "off"} />
      {hint && <span className="pg-hint">{t(locale, hint)}</span>}
    </label>
  );
}

export function ErrorLine({ locale, code }: { locale: Locale; code?: string }) {
  return code ? <p className="pg-error" role="alert">{t(locale, `error.${code}`)}</p> : null;
}
