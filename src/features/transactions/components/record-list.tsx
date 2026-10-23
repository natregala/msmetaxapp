"use client";

import { useState } from "react";
import { formatPHP } from "../transaction.rules";
import type { AcceptedTransaction } from "../transaction.types";
import type { Messages, Language } from "@/i18n/messages";
import { Icon } from "./icons";

export function RecordList({
  records,
  loading,
  error,
  onRefresh,
  t,
  language = "en",
}: {
  records: AcceptedTransaction[];
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
  t: Messages;
  language?: Language;
}) {
  const [expanded, setExpanded] = useState(false);
  const visibleRecords = expanded ? records : records.slice(0, 5);
  return (
    <section className="card" aria-labelledby="recent-records-title">
      <div className="records-heading">
        <div>
          <h2 id="recent-records-title">{t.recentRecords}</h2>
          <p>{t.recentShortHelp}</p>
        </div>
        <button
          className="icon-button"
          type="button"
          aria-label={t.reload}
          title={t.reload}
          onClick={onRefresh}
          disabled={loading}
        >
          <Icon name="refresh" />
        </button>
      </div>
      {error ? (
        <div className="card-body">
          <div className="alert error" role="alert">
            {error}
          </div>
        </div>
      ) : loading && records.length === 0 ? (
        <div className="empty-state" role="status">
          <p>{t.loadingRecords}</p>
        </div>
      ) : records.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">
            <Icon name="record" />
          </div>
          <h3>{t.emptyTitle}</h3>
          <p>{t.emptyBody}</p>
        </div>
      ) : (
        <>
          <ul className="record-list" aria-busy={loading}>
            {visibleRecords.map((record) => (
              <li className="record-item" key={record.id}>
                <div>
                  <p className="record-title">
                    {record.description || t[record.kind]}
                  </p>
                  <p className="record-meta">
                    <time dateTime={record.businessDate}>
                      {record.businessDate}
                    </time>
                    <span aria-hidden="true">·</span>
                    <span>{t[record.kind]}</span>
                  </p>
                  <span className="record-status">{t.accepted}</span>
                </div>
                <div>
                  <p className="record-amount">
                    {formatPHP(record.amountCentavos)}
                  </p>
                  <p className="record-meta">
                    {record.paymentStatus
                      ? (language === "en"
                          ? {
                              paid: "Paid in full",
                              unpaid: "Not paid yet",
                              partial: "Partly paid",
                              unknown: "Payment unknown",
                            }
                          : {
                              paid: "Bayad na nang buo",
                              unpaid: "Hindi pa bayad",
                              partial: "Bahagyang bayad",
                              unknown: "Hindi pa alam ang bayad",
                            })[record.paymentStatus]
                      : record.moneyMovement === "in"
                        ? t.received
                        : record.moneyMovement === "out"
                          ? t.paid
                          : t[record.moneyMovement]}
                  </p>
                  {record.paymentStatus === "partial" && record.paidCentavos ? (
                    <p className="record-meta">
                      {language === "en" ? "Paid" : "Nabayaran"}:{" "}
                      {formatPHP(record.paidCentavos)} ·{" "}
                      {language === "en" ? "Remaining" : "Natitira"}:{" "}
                      {record.remainingCentavos === null ||
                      record.remainingCentavos === undefined
                        ? "—"
                        : formatPHP(record.remainingCentavos)}
                    </p>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
          <p className="records-footer">
            {visibleRecords.length}{" "}
            {visibleRecords.length === 1 ? t.recordCountOne : t.recordCount}
            {expanded && records.length === 50 ? ` · ${t.countNote}` : ""}
          </p>
          {records.length > 5 ? (
            <div className="records-more">
              <button
                type="button"
                className="text-button"
                onClick={() => setExpanded((value) => !value)}
              >
                {expanded ? t.showFewerRecords : t.showMoreRecords}
              </button>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}
