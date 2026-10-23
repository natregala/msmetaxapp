"use client";
import { useJourneyHistory } from "@/components/journey-history";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type FormEvent,
} from "react";
import type { EditorPersistenceHandle } from "../client/editor-recovery";
import type { Language } from "@/i18n/messages";
import { isDemoMode } from "@/lib/client/app-fetch";
import {
  formatPHP,
  todayInManila,
} from "@/features/transactions/transaction.rules";
import { transactionKinds } from "@/features/transactions/transaction.types";
import type {
  LedgerCommand,
  LedgerDetail,
  LedgerList,
  LedgerPayment,
  LedgerRecord,
  LedgerSnapshot,
  LedgerSummary,
} from "../ledger.types";
import {
  ledgerDetail,
  ledgerSummary,
  LedgerApiError,
  listLedger,
  readSnapshot,
  sendReviewedOperation,
  type LedgerFilters,
} from "../client/commands";
import {
  pendingLedgerStore,
  type PendingLedgerOperation,
} from "../client/pending-command-store";
import { RecordChange, type RecordChangeAction } from "./record-change";
import { ledgerMessages } from "./ledger-messages";
import { PreparationJourney } from "@/features/preparation/components/preparation-journey";
import styles from "./records.module.css";
import { SummaryFigures, SavedReport } from "./period-report";
import { errorText, code } from "./feedback";

export type RecordsView = "records" | "summary" | "preparation";
type Props = {
  userId: string;
  businessId: string;
  businessName: string;
  language: Language;
  initialView?: RecordsView;
  initialRecordId?: string;
  onHome: () => void;
  onDocument?: (id: string) => void;
};
const emptyFilters: LedgerFilters = {
  from: "",
  to: "",
  kind: "",
  payment: "",
  status: "",
  search: "",
};
export type RecordsWorkspaceHandle = EditorPersistenceHandle;
export const RecordsWorkspace = forwardRef<RecordsWorkspaceHandle, Props>(
  function RecordsWorkspace(
    {
      userId,
      businessId,
      businessName,
      language,
      initialView = "records",
      initialRecordId,
      onHome,
      onDocument,
    }: Props,
    ref,
  ) {
    const t = ledgerMessages[language];
    const [view, setView] = useState<RecordsView>(initialView);
    const [filters, setFilters] = useState(emptyFilters);
    const [applied, setApplied] = useState(emptyFilters);
    const [page, setPage] = useState(1);
    const [list, setList] = useState<LedgerList | null>(null);
    const [detail, setDetail] = useState<LedgerDetail | null>(null);
    const [selected, setSelected] = useState<string | null>(
      initialRecordId ?? null,
    );
    const [change, setChange] = useState<{
      action: RecordChangeAction;
      payment?: LedgerPayment;
    } | null>(null);
    const [review, setReview] = useState<LedgerCommand | null>(null);
    const [pending, setPending] = useState<PendingLedgerOperation[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [, setErrorCode] = useState<string | null>(null);
    const [rejectedId, setRejectedId] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [loading, setLoading] = useState(true);
    const [refresh, setRefresh] = useState(0);
    const [accepted, setAccepted] = useState(false);
    const alive = useRef(true);
    const heading = useRef<HTMLHeadingElement>(null);
    const recordEditor = useRef<EditorPersistenceHandle>(null);
    const preparationEditor = useRef<EditorPersistenceHandle>(null);
    const persist = useCallback(async () => {
      if (recordEditor.current && !(await recordEditor.current.persist()))
        return false;
      if (
        preparationEditor.current &&
        !(await preparationEditor.current.persist())
      )
        return false;
      return true;
    }, []);
    useImperativeHandle(ref, () => ({ persist }), [persist]);
    useJourneyHistory(
      `records:${businessId}`,
      {
        view,
        selected,
        action: change?.action ?? null,
        paymentId: change?.payment?.id ?? null,
        reviewing: review ? 1 : 0,
      },
      (next) => {
        setView(next.view as RecordsView);
        setSelected(typeof next.selected === "string" ? next.selected : null);
        if (!next.reviewing) setReview(null);
        const payment = detail?.payments.find(
          (item) => item.id === next.paymentId,
        );
        setChange(
          next.action
            ? { action: next.action as RecordChangeAction, payment }
            : null,
        );
      },
      async () => !busy && (await persist()),
    );
    useEffect(() => {
      alive.current = true;
      return () => {
        alive.current = false;
      };
    }, []);
    useEffect(() => {
      let mounted = true;
      pendingLedgerStore()
        .list(userId, businessId)
        .then((items) => {
          if (mounted) setPending(items);
        })
        .catch(() => {
          if (mounted) setError("LOCAL_STORAGE_FAILED");
        });
      return () => {
        mounted = false;
      };
    }, [userId, businessId, refresh]);
    useEffect(() => {
      if (view !== "records") return;
      const controller = new AbortController();
      const run = selected
        ? ledgerDetail(businessId, selected, controller.signal)
        : listLedger(businessId, applied, page, controller.signal);
      Promise.resolve().then(() => {
        if (!controller.signal.aborted) {
          setLoading(true);
          setError(null);
        }
      });
      run
        .then((result) => {
          if (controller.signal.aborted) return;
          if ("record" in result) setDetail(result);
          else setList(result);
        })
        .catch((cause) => {
          if (!controller.signal.aborted) setError(code(cause));
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
      return () => controller.abort();
    }, [businessId, view, applied, page, selected, refresh]);
    useEffect(() => {
      heading.current?.focus({ preventScroll: true });
    }, [view, selected, change, review]);

    async function reloadPending() {
      const items = await pendingLedgerStore().list(userId, businessId);
      if (alive.current) setPending(items);
    }
    async function submit(command: Record<string, unknown>) {
      if (busy) return;
      if (!(await persist())) return;
      setBusy(true);
      setError(null);
      setErrorCode(null);
      setRejectedId(null);
      setAccepted(false);
      try {
        await pendingLedgerStore().put(
          userId,
          businessId,
          String(command.operationId),
          command,
        );
        await reloadPending();
        const result = await sendReviewedOperation(command);
        if (
          command._endpoint === "/api/ledger/snapshots" &&
          typeof result.id === "string"
        ) {
          await pendingLedgerStore().saveEditor(
            userId,
            businessId,
            "last-report",
            { id: result.id },
          );
        }
        await pendingLedgerStore().acknowledge(
          userId,
          businessId,
          String(command.operationId),
        );
        if (command.action && command.recordId) {
          const values = command.values as Record<string, unknown>;
          const editorKey =
            command.recordId +
            ":" +
            command.action +
            ":" +
            (values?.paymentId ?? "");
          await pendingLedgerStore().clearEditor(userId, businessId, editorKey);
        }
        if (!alive.current) return;
        setReview(null);
        setChange(null);
        setAccepted(true);
        setRefresh((value) => value + 1);
        if (command._endpoint === "/api/ledger/snapshots") setView("summary");
      } catch (cause) {
        if (!alive.current) return;
        const failureCode = code(cause);
        setErrorCode(failureCode);
        setError(failureCode);
        if (
          cause instanceof LedgerApiError &&
          [409, 422].includes(cause.status)
        )
          setRejectedId(String(command.operationId));
      } finally {
        if (alive.current) setBusy(false);
      }
    }
    async function reviseRejected(
      candidate: Record<string, unknown> | null = review,
    ) {
      if (
        !candidate ||
        rejectedId !== candidate.operationId ||
        typeof candidate.recordId !== "string"
      )
        return;
      try {
        await pendingLedgerStore().acknowledge(
          userId,
          businessId,
          String(candidate.operationId),
        );
        const current = await ledgerDetail(businessId, candidate.recordId);
        if (!alive.current) return;
        const values = candidate.values as Record<string, unknown>;
        setView("records");
        setSelected(candidate.recordId);
        setDetail(current);
        setChange({
          action: candidate.action as RecordChangeAction,
          payment: current.payments.find(
            (item) => item.id === values.paymentId,
          ),
        });
        setReview(null);
        setError(null);
        setErrorCode(null);
        setRejectedId(null);
        setRefresh((value) => value + 1);
      } catch (cause) {
        if (alive.current) setError(code(cause));
      }
    }
    function selectRecord(id: string) {
      setSelected(id);
      setDetail(null);
      setChange(null);
      setReview(null);
      setAccepted(false);
      setError(null);
    }
    async function navigate(next: RecordsView) {
      if (!(await persist())) return;
      setView(next);
      setSelected(null);
      setChange(null);
      setReview(null);
      setError(null);
      setAccepted(false);
    }
    function kindLabel(record: LedgerRecord) {
      return record.kind === "sale"
        ? t.salesKind
        : record.kind === "expense"
          ? t.expenseKind
          : t[record.kind];
    }
    return (
      <div className={styles.workspace} data-testid="records-workspace">
        <div className={styles.top}>
          <button
            className="text-button"
            type="button"
            onClick={async () => {
              if (!(await persist())) return;
              if (
                review &&
                !pending.some((item) => item.operationId === review.operationId)
              )
                setReview(null);
              else if (change && !review) setChange(null);
              else if (selected && !review) setSelected(null);
              else onHome();
            }}
          >
            ← {selected ? t.back : t.home}
          </button>
        </div>
        <nav className={styles.tabs} aria-label={t.records}>
          {(["records", "summary", "preparation"] as const).map((tab) => (
            <button
              type="button"
              key={tab}
              aria-pressed={view === tab}
              onClick={() => navigate(tab)}
            >
              {t[tab]}
            </button>
          ))}
        </nav>
        <div className={styles.heading}>
          <h1 ref={heading} tabIndex={-1}>
            {view === "records" ? (selected ? t.view : t.records) : t[view]}
          </h1>
        </div>
        {accepted ? (
          <p role="status" className={styles.notice + " " + styles.success}>
            {t.saved}
          </p>
        ) : null}
        {error ? (
          <div className={styles.notice + " " + styles.error} role="alert">
            <p>{errorText(error, t)}</p>
            {!review ? (
              <button
                className="text-button"
                onClick={() => setRefresh((value) => value + 1)}
              >
                {t.retry}
              </button>
            ) : null}
          </div>
        ) : null}
        {pending.length ? (
          <section
            className={styles.card + " " + styles.noPrint}
            aria-label={t.pendingTitle}
          >
            <h2>{t.pendingTitle}</h2>
            <p>{t.pendingHelp}</p>
            {pending.map((item) => (
              <article
                className={styles.card + " " + styles.pending}
                key={item.operationId}
              >
                <CommandSummary command={item.command} language={language} />
                <p className={styles.muted}>
                  {t.pendingDate}:{" "}
                  {new Date(item.createdAt).toLocaleString(
                    language === "tl" ? "fil-PH" : "en-PH",
                  )}
                </p>
                <div className={styles.actions}>
                  <button
                    className="button secondary"
                    disabled={busy}
                    onClick={() => void submit(item.command)}
                  >
                    {t.retrySave}
                  </button>
                  <button
                    className="text-button"
                    onClick={() => downloadRecovery(item.command)}
                  >
                    {t.showTechnical}
                  </button>
                  {rejectedId === item.operationId && item.command.recordId ? (
                    <button
                      className="text-button"
                      onClick={() => void reviseRejected(item.command)}
                    >
                      {t.editRejected}
                    </button>
                  ) : null}
                </div>
              </article>
            ))}
          </section>
        ) : null}
        {view === "preparation" ? (
          <PreparationJourney
            ref={preparationEditor}
            key={refresh}
            userId={userId}
            businessId={businessId}
            businessName={businessName}
            language={language}
          />
        ) : view === "summary" ? (
          <PeriodWorkspace
            key={refresh}
            userId={userId}
            businessId={businessId}
            businessName={businessName}
            language={language}
            onInspect={(from, to) => {
              setFilters({ ...emptyFilters, from, to });
              setApplied({ ...emptyFilters, from, to });
              setPage(1);
              navigate("records");
            }}
          />
        ) : selected && loading ? (
          <p role="status">{t.loading}</p>
        ) : selected && detail ? (
          <>
            <button
              className={"text-button " + styles.noPrint}
              type="button"
              onClick={async () => {
                if (!(await persist())) return;
                setSelected(null);
                setChange(null);
                setReview(null);
              }}
            >
              {t.records}
            </button>
            {review ? (
              <section className={styles.card}>
                <h2>{t.reviewTitle}</h2>
                <div className={styles.compare}>
                  <div>
                    <h3>{t.unchanged}</h3>
                    <RecordFacts record={detail.record} language={language} />
                  </div>
                  <div>
                    <h3>{t.proposed}</h3>
                    <CommandSummary command={review} language={language} />
                  </div>
                </div>
                <p>{t.saveHelp}</p>
                <div className={styles.actions}>
                  <button
                    className="button primary"
                    disabled={busy}
                    onClick={() => void submit(review)}
                  >
                    {busy
                      ? t.waiting
                      : pending.some(
                            (item) => item.operationId === review.operationId,
                          )
                        ? t.retrySave
                        : t.save}
                  </button>
                  {!pending.some(
                    (item) => item.operationId === review.operationId,
                  ) ? (
                    <button
                      className="text-button"
                      disabled={busy}
                      onClick={() => setReview(null)}
                    >
                      {t.back}
                    </button>
                  ) : null}
                  {rejectedId === review.operationId ? (
                    <button
                      className="text-button"
                      onClick={() => void reviseRejected()}
                    >
                      {t.editRejected}
                    </button>
                  ) : null}
                </div>
              </section>
            ) : change ? (
              <RecordChange
                ref={recordEditor}
                key={
                  detail.record.id + change.action + (change.payment?.id ?? "")
                }
                detail={detail}
                userId={userId}
                action={change.action}
                payment={change.payment}
                businessId={businessId}
                language={language}
                onCancel={() => setChange(null)}
                onReview={setReview}
              />
            ) : (
              <>
                <section className={styles.card}>
                  <h2>
                    {detail.record.description || kindLabel(detail.record)}
                  </h2>
                  <RecordFacts record={detail.record} language={language} />
                  {detail.record.status === "active" ? (
                    <>
                      {[
                        "sale",
                        "expense",
                        "owner_contribution",
                        "owner_withdrawal",
                      ].includes(detail.record.kind) &&
                      detail.record.remainingCentavos !== "0" ? (
                        <button
                          className="button primary"
                          onClick={() => setChange({ action: "add_payment" })}
                        >
                          {t.addPayment}
                        </button>
                      ) : null}
                      <details className="quiet-details">
                        <summary>
                          {language === "en"
                            ? "Correct or void a record"
                            : "Itama o pawalang-bisa ang tala"}
                        </summary>
                        <div className={styles.actions}>
                          <button
                            className="button secondary"
                            onClick={() => setChange({ action: "correct" })}
                          >
                            {t.correction}
                          </button>
                          <button
                            className="text-button"
                            onClick={() => setChange({ action: "void" })}
                          >
                            {t.voidRecord}
                          </button>
                          {["sale", "expense"].includes(detail.record.kind) ? (
                            <button
                              className="text-button"
                              onClick={() =>
                                setChange({ action: "resolve_payment" })
                              }
                            >
                              {t.resolve}
                            </button>
                          ) : null}
                        </div>
                      </details>
                    </>
                  ) : null}
                  {detail.record.sourceReference ? (
                    <div>
                      <p>
                        {t.source}: {detail.record.sourceReference.sourceType}
                      </p>
                      {onDocument ? (
                        <button
                          type="button"
                          className="text-button"
                          onClick={() =>
                            onDocument(
                              detail.record.sourceReference!.documentId,
                            )
                          }
                        >
                          {t.source}
                        </button>
                      ) : null}
                      {!isDemoMode() ? (
                        <a
                          className="text-button"
                          href={`/api/documents?${new URLSearchParams({ businessId, documentId: detail.record.sourceReference.documentId, image: "1" })}`}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {t.viewSource}
                        </a>
                      ) : null}
                    </div>
                  ) : (
                    <p className={styles.muted}>{t.manual}</p>
                  )}
                </section>
                <section className={styles.card}>
                  <h2>{t.payments}</h2>
                  {detail.payments.length ? (
                    <ul className={styles.list}>
                      {detail.payments.map((payment) => (
                        <li key={payment.id} className={styles.record}>
                          <div>
                            <strong>{formatPHP(payment.amountCentavos)}</strong>
                            <p>
                              {payment.paymentDate ?? t.undatedPayment} ·{" "}
                              {payment.status === "void" ? t.void : t.active} ·{" "}
                              {t.revision} {payment.revision}
                            </p>
                          </div>
                          {payment.status === "active" &&
                          detail.record.status === "active" ? (
                            <div className={styles.actions}>
                              <button
                                className="text-button"
                                onClick={() =>
                                  setChange({
                                    action: "correct_payment",
                                    payment,
                                  })
                                }
                              >
                                {t.correctPayment}
                              </button>
                              <button
                                className="text-button"
                                onClick={() =>
                                  setChange({ action: "void_payment", payment })
                                }
                              >
                                {t.voidPayment}
                              </button>
                            </div>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p>{t.noPayments}</p>
                  )}
                </section>
                <details className="quiet-details">
                  <summary>{t.history}</summary>
                  <History detail={detail} language={language} />
                </details>
              </>
            )}
          </>
        ) : view === "records" ? (
          <>
            <form
              className={styles.card + " " + styles.noPrint}
              onSubmit={(event: FormEvent) => {
                event.preventDefault();
                setApplied({ ...filters });
                setPage(1);
              }}
            >
              <label className={styles.field}>
                {t.search}
                <input
                  maxLength={100}
                  placeholder={t.searchHint}
                  value={filters.search}
                  onChange={(event) =>
                    setFilters({ ...filters, search: event.target.value })
                  }
                />
              </label>
              <details className="quiet-details">
                <summary>
                  {language === "en"
                    ? "Filter by date, type or payment"
                    : "Piliin ang petsa, uri o bayad"}
                  {Object.entries(filters).filter(
                    ([key, value]) => key !== "search" && value,
                  ).length
                    ? " •"
                    : ""}
                </summary>
                <p className={styles.muted}>{t.businessDateHelp}</p>
                <div className={styles.filters}>
                  <label className={styles.field}>
                    {t.from}
                    <input
                      type="date"
                      min="1900-01-01"
                      max="2100-12-31"
                      value={filters.from}
                      onChange={(event) =>
                        setFilters({ ...filters, from: event.target.value })
                      }
                    />
                  </label>
                  <label className={styles.field}>
                    {t.to}
                    <input
                      type="date"
                      min="1900-01-01"
                      max="2100-12-31"
                      value={filters.to}
                      onChange={(event) =>
                        setFilters({ ...filters, to: event.target.value })
                      }
                    />
                  </label>
                  <label className={styles.field}>
                    {t.kind}
                    <select
                      value={filters.kind}
                      onChange={(event) =>
                        setFilters({ ...filters, kind: event.target.value })
                      }
                    >
                      <option value="">{t.all}</option>
                      {transactionKinds.map((kind) => (
                        <option key={kind} value={kind}>
                          {kind === "sale"
                            ? t.salesKind
                            : kind === "expense"
                              ? t.expenseKind
                              : t[kind]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className={styles.field}>
                    {t.payment}
                    <select
                      value={filters.payment}
                      onChange={(event) =>
                        setFilters({ ...filters, payment: event.target.value })
                      }
                    >
                      <option value="">{t.all}</option>
                      <option value="needs_attention">{t.clarification}</option>
                      {(["paid", "unpaid", "partial", "unknown"] as const).map(
                        (value) => (
                          <option key={value} value={value}>
                            {t[value]}
                          </option>
                        ),
                      )}
                    </select>
                  </label>
                  <label className={styles.field}>
                    {t.status}
                    <select
                      value={filters.status}
                      onChange={(event) =>
                        setFilters({ ...filters, status: event.target.value })
                      }
                    >
                      <option value="">{t.all}</option>
                      <option value="active">{t.active}</option>
                      <option value="void">{t.void}</option>
                    </select>
                  </label>
                </div>
              </details>
              <button className="button primary" type="submit">
                {t.apply}
              </button>
            </form>
            {loading ? (
              <p role="status">{t.loading}</p>
            ) : list ? (
              <section className={styles.card}>
                {list.records.length ? (
                  <ul className={styles.list}>
                    {list.records.map((record) => (
                      <li key={record.id} className={styles.record}>
                        <div>
                          <button
                            type="button"
                            onClick={() => selectRecord(record.id)}
                          >
                            {record.description || kindLabel(record)}
                          </button>
                          <p className={styles.muted}>
                            {record.businessDate} · {kindLabel(record)} ·{" "}
                            {record.status === "void"
                              ? t.void
                              : t[record.paymentStatus]}
                          </p>
                        </div>
                        <strong className={styles.amount}>
                          {formatPHP(record.amountCentavos)}
                        </strong>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p>{t.empty}</p>
                )}
                <div className={styles.pagination}>
                  <button
                    className="button secondary"
                    disabled={page <= 1}
                    onClick={() => setPage((value) => value - 1)}
                  >
                    {t.previous}
                  </button>
                  <span>
                    {t.page} {list.page} {t.of}{" "}
                    {Math.max(1, Math.ceil(list.total / list.pageSize))}
                  </span>
                  <button
                    className="button secondary"
                    disabled={page * list.pageSize >= list.total}
                    onClick={() => setPage((value) => value + 1)}
                  >
                    {t.next}
                  </button>
                </div>
              </section>
            ) : null}
          </>
        ) : null}
      </div>
    );
  },
);

export function RecordFacts({
  record,
  language,
}: {
  record: LedgerRecord;
  language: Language;
}) {
  const t = ledgerMessages[language];
  return (
    <dl className={styles.details}>
      <div>
        <dt>{t.amount}</dt>
        <dd>{formatPHP(record.amountCentavos)}</dd>
      </div>
      <div>
        <dt>{t.date}</dt>
        <dd>{record.businessDate}</dd>
      </div>
      <div>
        <dt>{t.payment}</dt>
        <dd>{t[record.paymentStatus]}</dd>
      </div>
      <div>
        <dt>{t.balance}</dt>
        <dd>
          {record.remainingCentavos === null
            ? t.unknownBalance
            : formatPHP(record.remainingCentavos)}
        </dd>
      </div>
      <div>
        <dt>{t.status}</dt>
        <dd>{record.status === "void" ? t.void : t.active}</dd>
      </div>
      <div>
        <dt>{t.revision}</dt>
        <dd>{record.revision}</dd>
      </div>
      <div>
        <dt>{t.recorded}</dt>
        <dd>
          {new Date(record.recordedAt).toLocaleString(
            language === "tl" ? "fil-PH" : "en-PH",
          )}
        </dd>
      </div>
    </dl>
  );
}
function History({
  detail,
  language,
}: {
  detail: LedgerDetail;
  language: Language;
}) {
  const t = ledgerMessages[language];
  return (
    <section className={styles.card}>
      <h2>{t.history}</h2>
      <ol className={styles.history}>
        {detail.history.map((entry) => (
          <li key={entry.revision}>
            <strong>
              {t.revision} {entry.revision}
            </strong>{" "}
            ·{" "}
            {new Date(entry.recordedAt).toLocaleString(
              language === "tl" ? "fil-PH" : "en-PH",
            )}
            <HistoryValues values={entry.interpretation} language={language} />
          </li>
        ))}
      </ol>
      {detail.paymentHistory.length ? (
        <>
          <h3>{t.paymentHistory}</h3>
          <ol className={styles.history}>
            {detail.paymentHistory.map((entry, index) => (
              <li key={entry.paymentId + ":" + entry.revision + ":" + index}>
                <strong>
                  {t.revision} {entry.revision}
                </strong>{" "}
                ·{" "}
                {new Date(entry.recordedAt).toLocaleString(
                  language === "tl" ? "fil-PH" : "en-PH",
                )}
                <HistoryValues
                  values={entry.interpretation}
                  language={language}
                />
              </li>
            ))}
          </ol>
        </>
      ) : null}
    </section>
  );
}
function HistoryValues({
  values,
  language,
}: {
  values: Record<string, unknown>;
  language: Language;
}) {
  const t = ledgerMessages[language];
  const nested = values.values ?? values.record;
  if (nested && typeof nested === "object" && !Array.isArray(nested))
    values = { ...values, ...nested };
  const amount = values.amountCentavos ?? values.amount_centavos;
  const businessDate = values.businessDate ?? values.business_date;
  const paymentDate = values.paymentDate ?? values.payment_date;
  return (
    <div>
      {typeof values.kind === "string" &&
      transactionKinds.includes(
        values.kind as (typeof transactionKinds)[number],
      ) ? (
        <p>
          {t.kind}:{" "}
          {values.kind === "sale"
            ? t.salesKind
            : values.kind === "expense"
              ? t.expenseKind
              : t[
                  values.kind as Exclude<
                    (typeof transactionKinds)[number],
                    "sale" | "expense"
                  >
                ]}
        </p>
      ) : null}
      {typeof amount === "string" && /^\d+$/.test(amount) ? (
        <p>
          {t.amount}: {formatPHP(amount)}
        </p>
      ) : null}
      {typeof businessDate === "string" ? (
        <p>
          {t.date}: {businessDate}
        </p>
      ) : null}
      {typeof paymentDate === "string" ? (
        <p>
          {t.paymentDate}: {paymentDate}
        </p>
      ) : null}
      {typeof values.description === "string" ? (
        <p>{values.description}</p>
      ) : null}
      {typeof values.reason === "string" ? (
        <p>
          {t.explanation}: {values.reason}
        </p>
      ) : null}
    </div>
  );
}
export function CommandSummary({
  command,
  language,
}: {
  command: Record<string, unknown>;
  language: Language;
}) {
  const t = ledgerMessages[language];
  const values = command.values as Record<string, unknown> | undefined;
  const action = command.action;
  const title =
    action === "correct"
      ? t.correction
      : action === "void"
        ? t.voidRecord
        : action === "add_payment"
          ? t.addPayment
          : action === "correct_payment"
            ? t.correctPayment
            : action === "void_payment"
              ? t.voidPayment
              : action === "resolve_payment"
                ? t.resolve
                : command._endpoint === "/api/preparation/profile"
                  ? t.preparation
                  : t.report;
  return (
    <div className={styles.pendingSummary}>
      <strong>{title}</strong>
      {values ? (
        <HistoryValues values={values} language={language} />
      ) : (
        <p>
          {String(command.from ?? "")} — {String(command.to ?? "")}
        </p>
      )}
      {typeof command.expectedRevision === "number" ? (
        <p className={styles.muted}>
          {t.expectedVersion}: {command.expectedRevision}
        </p>
      ) : null}
    </div>
  );
}
function downloadRecovery(command: Record<string, unknown>) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(command, null, 2)], { type: "application/json" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = "reviewed-change-recovery.json";
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function PeriodWorkspace({
  userId,
  businessId,
  businessName,
  language,
  onInspect,
}: Omit<Props, "initialView" | "onHome" | "onDocument"> & {
  onInspect: (from: string, to: string) => void;
}) {
  const t = ledgerMessages[language],
    today = todayInManila();
  const [from, setFrom] = useState(today.slice(0, 7) + "-01"),
    [to, setTo] = useState(today);
  const [summary, setSummary] = useState<LedgerSummary | null>(null),
    [snapshot, setSnapshot] = useState<LedgerSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null),
    [busy, setBusy] = useState(false);
  const alive = useRef(true);
  const [frozen, setFrozen] = useState<Record<string, unknown> | null>(null);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    pendingLedgerStore()
      .readEditor(userId, businessId, "last-report")
      .then(async (saved) => {
        if (!saved?.id || controller.signal.aborted) return;
        const result = await readSnapshot(
          businessId,
          saved.id,
          controller.signal,
        );
        if (!controller.signal.aborted) {
          setSnapshot(result);
          setSummary(result);
          setFrom(result.from);
          setTo(result.to);
        }
      })
      .catch((cause) => {
        if (!controller.signal.aborted) setError(code(cause));
      });
    return () => controller.abort();
  }, [userId, businessId]);
  async function load(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await ledgerSummary(businessId, from, to);
      if (alive.current) {
        setSummary(result);
        setSnapshot(null);
        setFrozen(null);
      }
    } catch (cause) {
      if (alive.current) setError(code(cause));
    } finally {
      if (alive.current) setBusy(false);
    }
  }
  async function generate() {
    if (!summary || busy) return;
    setBusy(true);
    setError(null);
    const command = frozen ?? {
      _endpoint: "/api/ledger/snapshots",
      businessId,
      operationId: crypto.randomUUID(),
      from: summary.from,
      to: summary.to,
    };
    setFrozen(command);
    try {
      await pendingLedgerStore().put(
        userId,
        businessId,
        String(command.operationId),
        command,
      );
      const result = (await sendReviewedOperation(command)) as LedgerSnapshot;
      await pendingLedgerStore().saveEditor(userId, businessId, "last-report", {
        id: result.id,
      });
      await pendingLedgerStore().acknowledge(
        userId,
        businessId,
        String(command.operationId),
      );
      if (alive.current) {
        setSnapshot(result);
        setFrozen(null);
      }
    } catch (cause) {
      if (alive.current) setError(code(cause));
    } finally {
      if (alive.current) setBusy(false);
    }
  }
  return (
    <>
      <form className={styles.card + " " + styles.noPrint} onSubmit={load}>
        <div className={styles.filters}>
          <label className={styles.field}>
            {t.from}
            <input
              type="date"
              value={from}
              onChange={(event) => setFrom(event.target.value)}
              required
              min="1900-01-01"
              max="2100-12-31"
            />
          </label>
          <label className={styles.field}>
            {t.to}
            <input
              type="date"
              value={to}
              onChange={(event) => setTo(event.target.value)}
              required
              min="1900-01-01"
              max="2100-12-31"
            />
          </label>
          <button className="button primary" disabled={busy}>
            {busy ? t.loading : t.summary}
          </button>
        </div>
      </form>
      {error ? (
        <p className={styles.notice + " " + styles.error} role="alert">
          {errorText(error, t)}
        </p>
      ) : null}
      {summary ? (
        <>
          <SummaryFigures summary={summary} language={language} />
          <div className={styles.actions + " " + styles.noPrint}>
            <button
              className="button secondary"
              onClick={() => onInspect(summary.from, summary.to)}
            >
              {t.inspect}
            </button>
            <button
              className="button primary"
              disabled={busy}
              onClick={() => void generate()}
            >
              {frozen ? t.retrySave : t.createReport}
            </button>
          </div>
        </>
      ) : null}
      {snapshot ? (
        <SavedReport
          snapshot={snapshot}
          businessName={businessName}
          language={language}
          onRefresh={async () => {
            try {
              const fresh = await readSnapshot(businessId, snapshot.id);
              if (alive.current) setSnapshot(fresh);
            } catch (cause) {
              if (alive.current) setError(code(cause));
            }
          }}
        />
      ) : null}
    </>
  );
}
