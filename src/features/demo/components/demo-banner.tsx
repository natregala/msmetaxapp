"use client";

import { useState } from "react";
import type { Language } from "@/i18n/messages";
import styles from "./demo-banner.module.css";

const copy = {
  en: {
    title: "Demo · sample data",
    body: "Changes stay only in this browser. Use sample data, without personal or real business information.",
    limit: "This simulation does not file or pay anything.",
    reset: "Reset demo",
    resetting: "Resetting…",
    confirm:
      "Reset this demo? Your demo changes and unfinished sample work will be replaced with the starting sample data in this browser.",
    failed:
      "The demo could not be reset. Your current work is still here. Try again.",
  },
  tl: {
    title: "Demo · halimbawang datos",
    body: "Sa browser na ito lamang nananatili ang mga pagbabago. Halimbawang datos lang ang gamitin, walang personal o tunay na impormasyon ng negosyo.",
    limit: "Walang isinusumite o binabayaran ang simulation na ito.",
    reset: "I-reset ang demo",
    resetting: "Nire-reset…",
    confirm:
      "I-reset ang demo? Papalitan ng panimulang halimbawang datos ang mga pagbabago at hindi pa tapos na sample sa browser na ito.",
    failed:
      "Hindi na-reset ang demo. Nandito pa ang ginagawa mo. Subukang muli.",
  },
};

export function DemoBanner({ language }: { language: Language }) {
  const t = copy[language];
  const [resetting, setResetting] = useState(false);
  const [failed, setFailed] = useState(false);

  async function reset() {
    if (resetting || !window.confirm(t.confirm)) return;
    setResetting(true);
    setFailed(false);
    try {
      const { resetDemo } = await import("../demo-store");
      await resetDemo();
      window.location.reload();
    } catch {
      setFailed(true);
      setResetting(false);
    }
  }

  return (
    <aside className={styles.banner} aria-label={t.title}>
      <details className={styles.copy}>
        <summary>
          {language === "en"
            ? "Demo · saved only in this browser"
            : "Demo · sa browser lang naka-save"}
        </summary>
        <p>{t.body}</p>
        <p>{t.limit}</p>
        <button
          className={styles.reset}
          type="button"
          disabled={resetting}
          onClick={() => void reset()}
        >
          {resetting ? t.resetting : t.reset}
        </button>
      </details>
      {failed ? <p role="alert">{t.failed}</p> : null}
    </aside>
  );
}
