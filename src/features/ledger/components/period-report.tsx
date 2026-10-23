"use client";
import { useEffect, useRef, useState } from "react";
import type { Language } from "@/i18n/messages";
import { formatPHP } from "@/features/transactions/transaction.rules";
import type { LedgerSummary, LedgerSnapshot } from "../ledger.types";
import { downloadLedgerCsv } from "../client/commands";
import { ledgerMessages } from "./ledger-messages";
import styles from "./records.module.css";
import { formatLedgerPHP } from "../ledger.rules";
import { PreparationEvidence } from "@/features/preparation/components/preparation-evidence";
export function SummaryFigures({
  summary,
  language,
}: {
  summary: LedgerSummary;
  language: Language;
}) {
  const t = ledgerMessages[language];
  const fields = [
    ["salesCentavos", "sales"],
    ["expensesCentavos", "expenses"],
    ["receivedCentavos", "received"],
    ["paidCentavos", "paidOut"],
    ["receivableCentavos", "receivable"],
    ["payableCentavos", "payable"],
  ] as const;
  return (
    <section className={styles.card}>
      <h2>
        {summary.from} — {summary.to}
      </h2>
      <div className={styles.totals}>
        {fields.map(([field, label]) => (
          <div className={styles.total} key={field}>
            <span>{t[label]}</span>
            <strong>{formatLedgerPHP(summary.totals[field])}</strong>
          </div>
        ))}
      </div>
      <p>
        {t.count}: {summary.totals.recordCount} · {t.clarification}:{" "}
        {summary.totals.unknownCount} · {t.voidCount}:{" "}
        {summary.totals.voidCount} · {t.undatedCount}:{" "}
        {summary.totals.undatedPaymentCount}
      </p>
      <details className="quiet-details">
        <summary>{t.coverage}</summary>
        <p className={styles.muted}>{t.coverageHelp}</p>
        <p className={styles.muted}>
          {t.coverage}: {t.coverageDetails}
        </p>
      </details>
    </section>
  );
}
export function SavedReport({
  snapshot,
  businessName,
  language,
  onRefresh,
}: {
  snapshot: LedgerSnapshot;
  businessName: string;
  language: Language;
  onRefresh: () => void;
}) {
  const t = ledgerMessages[language];
  const [error, setError] = useState(false);
  const report = useRef<HTMLElement>(null);
  useEffect(() => {
    let closed: HTMLDetailsElement[] = [];
    const expand = () => {
      closed = Array.from(
        report.current?.querySelectorAll<HTMLDetailsElement>(
          "details:not([open])",
        ) ?? [],
      );
      closed.forEach((item) => {
        item.open = true;
      });
    };
    const restore = () => {
      closed.forEach((item) => {
        item.open = false;
      });
      closed = [];
    };
    window.addEventListener("beforeprint", expand);
    window.addEventListener("afterprint", restore);
    return () => {
      window.removeEventListener("beforeprint", expand);
      window.removeEventListener("afterprint", restore);
    };
  }, []);
  return (
    <section
      ref={report}
      className={styles.card}
      data-testid="saved-period-report"
    >
      <div className={styles.heading}>
        <h2>
          {businessName} · {t.report}
        </h2>
        <p>
          {snapshot.from} — {snapshot.to}
        </p>
        <p className={styles.muted}>
          {t.generated}:{" "}
          {new Date(snapshot.createdAt).toLocaleString(
            language === "tl" ? "fil-PH" : "en-PH",
          )}
        </p>
      </div>
      <p
        role="status"
        className={styles.notice + (snapshot.stale ? "" : " " + styles.success)}
      >
        {snapshot.stale ? t.stale : t.current}
      </p>
      <div className={styles.actions + " " + styles.noPrint}>
        <button
          className="button primary"
          onClick={() =>
            void downloadLedgerCsv(snapshot.businessId, snapshot.id).catch(() =>
              setError(true),
            )
          }
        >
          {t.csv}
        </button>
        <button className="button secondary" onClick={() => window.print()}>
          {t.print}
        </button>
        <button className="text-button" onClick={onRefresh}>
          {t.refresh}
        </button>
      </div>
      {error ? <p role="alert">{t.generic}</p> : null}
      <details className="quiet-details">
        <summary>
          {t.included} · {snapshot.records.length}
        </summary>
        <div className={styles.scroll}>
          <table className={styles.reportTable}>
            <caption>{t.included}</caption>
            <thead>
              <tr>
                <th>{t.date}</th>
                <th>{t.kind}</th>
                <th>{t.description}</th>
                <th>{t.amount}</th>
                <th>{t.payment}</th>
                <th>{t.revision}</th>
              </tr>
            </thead>
            <tbody>
              {snapshot.records.map((record) => (
                <tr key={record.id}>
                  <td>{record.businessDate}</td>
                  <td>
                    {record.kind === "sale"
                      ? t.salesKind
                      : record.kind === "expense"
                        ? t.expenseKind
                        : t[record.kind]}
                  </td>
                  <td>{record.description ?? "—"}</td>
                  <td>{formatPHP(record.amountCentavos)}</td>
                  <td>{t[record.paymentStatus]}</td>
                  <td>{record.revision}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
      <details className="quiet-details">
        <summary>{t.sourceIndex}</summary>
        <PreparationEvidence snapshot={snapshot} language={language} />
        <h3>{t.sourceIndex}</h3>
        <ul className={styles.checklist}>
          {snapshot.records.map((record) => (
            <li key={record.id}>
              {record.businessDate} ·{" "}
              {record.description || formatPHP(record.amountCentavos)} ·{" "}
              {record.sourceReference?.sourceType ?? t.manual}
            </li>
          ))}
        </ul>
      </details>
      <details className="quiet-details">
        <summary>{t.coverage}</summary>
        <p>{t.snapshotHelp}</p>
        <p>{t.coverageHelp}</p>
      </details>
      <p>{t.noTax}</p>
    </section>
  );
}
