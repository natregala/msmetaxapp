"use client";
import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import type { Language } from "@/i18n/messages";
const copy = {
  en: {
    title: "Recover your account",
    email: "Email address",
    send: "Send recovery link",
    sent: "If this address has an account, check its email for the recovery link. Open it in this browser.",
    password: "New password",
    save: "Save new password",
    done: "Password updated. Return to your records.",
    invalid:
      "This link is invalid, expired, or was opened in a different browser. Request a new recovery link.",
    error:
      "We couldn’t complete that request. Try again, or request a new link.",
    back: "Back to sign in",
    wait: "Please wait…",
  },
  tl: {
    title: "Bawiin ang access sa account",
    email: "Email address",
    send: "Ipadala ang recovery link",
    sent: "Kung may account ang address na ito, tingnan ang email para sa recovery link. Buksan ito sa browser na ito.",
    password: "Bagong password",
    save: "I-save ang bagong password",
    done: "Nabago na ang password. Bumalik sa mga tala.",
    invalid:
      "Hindi wasto, paso na, o binuksan sa ibang browser ang link. Humingi ng bagong recovery link.",
    error:
      "Hindi natapos ang kahilingan. Subukan muli o humingi ng bagong link.",
    back: "Bumalik sa pag-sign in",
    wait: "Sandali…",
  },
};
export function RecoveryForm({
  language = "en",
  updating = false,
  invalid = false,
}: {
  language?: Language;
  updating?: boolean;
  invalid?: boolean;
}) {
  const t = copy[language],
    [value, setValue] = useState(""),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState<
      "sent" | "done" | "invalid" | "error" | null
    >(invalid ? "invalid" : null);
  const [retry, setRetry] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const update = updating && !retry;
      const response = await fetch("/api/auth/recovery", {
        method: update ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(update ? { password: value } : { email: value }),
        credentials: "same-origin",
      });
      const body = await response.json();
      if (!response.ok || !body.ok) {
        if (body.error?.code === "INVALID_RECOVERY") {
          setMessage("invalid");
          setRetry(true);
          setValue("");
        } else setMessage("error");
        return;
      }
      setMessage(update ? "done" : "sent");
      setValue("");
    } catch {
      setMessage("error");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="journey-card">
      <h1>{t.title}</h1>
      {message ? (
        <p role="status" className="alert info">
          {t[message]}
        </p>
      ) : null}
      <form className="form-stack" onSubmit={submit}>
        <div className="field">
          <label htmlFor="recovery-value">
            {updating && !retry ? t.password : t.email}
          </label>
          <input
            id="recovery-value"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            type={updating && !retry ? "password" : "email"}
            autoComplete={updating && !retry ? "new-password" : "email"}
            minLength={updating && !retry ? 8 : undefined}
            maxLength={updating && !retry ? 128 : 254}
            required
            disabled={busy}
          />
        </div>
        <button className="button primary full" disabled={busy}>
          {busy ? t.wait : updating && !retry ? t.save : t.send}
        </button>
      </form>
      <Link className="text-button" href="/">
        {t.back}
      </Link>
    </section>
  );
}

export function RecoveryScreen({
  updating,
  invalid,
}: {
  updating: boolean;
  invalid: boolean;
}) {
  const [language, setLanguage] = useState<Language>("en");
  useEffect(() => {
    Promise.resolve().then(() => {
      try {
        if (localStorage.getItem("msme-language-v1") === "tl")
          setLanguage("tl");
      } catch {}
    });
  }, []);
  useEffect(() => {
    document.documentElement.lang = language === "tl" ? "fil" : "en";
  }, [language]);
  function change(next: Language) {
    setLanguage(next);
    try {
      localStorage.setItem("msme-language-v1", next);
    } catch {}
  }
  return (
    <>
      <div
        className="language-switch"
        role="group"
        aria-label={language === "en" ? "Interface language" : "Wika"}
      >
        <button aria-pressed={language === "en"} onClick={() => change("en")}>
          English
        </button>
        <button aria-pressed={language === "tl"} onClick={() => change("tl")}>
          Tagalog
        </button>
      </div>
      <RecoveryForm language={language} updating={updating} invalid={invalid} />
    </>
  );
}
