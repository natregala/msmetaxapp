"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type FormEvent,
} from "react";
import {
  amountToCentavos,
  formatPHP,
  isBusinessDate,
  todayInManila,
} from "@/features/transactions/transaction.rules";
import type { Language } from "@/i18n/messages";
import type {
  LedgerCommand,
  LedgerDetail,
  LedgerPayment,
} from "../ledger.types";
import { ledgerMessages } from "./ledger-messages";
import styles from "./records.module.css";
import { pendingLedgerStore } from "../client/pending-command-store";
import type { EditorPersistenceHandle } from "../client/editor-recovery";
import { settleEditorWrites } from "../client/editor-recovery";
import {
  transactionKinds,
  type TransactionKind,
} from "@/features/transactions/transaction.types";

export type RecordChangeAction = Exclude<LedgerCommand["action"], "create">;
type Props = {
  detail: LedgerDetail;
  action: RecordChangeAction;
  payment?: LedgerPayment;
  language: Language;
  userId: string;
  businessId: string;
  onCancel: () => void;
  onReview: (command: LedgerCommand) => void;
};
export const RecordChange = forwardRef<EditorPersistenceHandle, Props>(
  function RecordChange(
    {
      detail,
      action,
      payment,
      language,
      userId,
      businessId,
      onCancel,
      onReview,
    }: Props,
    ref,
  ) {
    const t = ledgerMessages[language];
    const record = detail.record;
    const [amount, setAmount] = useState(
      payment
        ? decimal(payment.amountCentavos)
        : action === "add_payment"
          ? ""
          : decimal(record.amountCentavos),
    );
    const [date, setDate] = useState(
      payment
        ? (payment.paymentDate ?? "")
        : action === "add_payment"
          ? todayInManila()
          : record.businessDate,
    );
    const [description, setDescription] = useState(record.description ?? "");
    const [kind, setKind] = useState<TransactionKind>(record.kind);
    const [reason, setReason] = useState("");
    const [known, setKnown] = useState(record.paymentKnowledge);
    const [error, setError] = useState(false);
    const [validationIssue, setValidationIssue] = useState<string | null>(null);
    const [checked, setChecked] = useState(false);
    const [loaded, setLoaded] = useState(false);
    const [storageError, setStorageError] = useState(false);
    const [loadKey, setLoadKey] = useState(0);
    const [reviewing, setReviewing] = useState(false);
    const alive = useRef(true);
    const writer = useRef<Promise<boolean>>(Promise.resolve(true));
    const savedSnapshot = useRef<string | null>(null);
    useEffect(() => {
      alive.current = true;
      return () => {
        alive.current = false;
      };
    }, []);
    const editorKey = record.id + ":" + action + ":" + (payment?.id ?? "");
    useEffect(() => {
      let alive = true;
      pendingLedgerStore()
        .readEditor(userId, businessId, editorKey)
        .then((saved) => {
          if (!alive) return;
          if (saved) {
            setAmount(saved.amount ?? "");
            setDate(saved.date ?? todayInManila());
            setDescription(saved.description ?? "");
            setReason(saved.reason ?? "");
            if (transactionKinds.includes(saved.kind as TransactionKind))
              setKind(saved.kind as TransactionKind);
            if (saved.known === "known" || saved.known === "unknown")
              setKnown(saved.known);
          }
          setLoaded(true);
        })
        .catch(() => {
          if (alive) {
            setStorageError(true);
          }
        });
      return () => {
        alive = false;
      };
    }, [userId, businessId, editorKey, loadKey]);
    const editorSnapshot = JSON.stringify({
      amount,
      date,
      description,
      reason,
      known,
      kind,
    });
    const persist = useCallback(async () => {
      if (!loaded) return true;
      const snapshot = editorSnapshot;
      const save = writer.current
        .catch(() => false)
        .then(async () => {
          try {
            await pendingLedgerStore().saveEditor(
              userId,
              businessId,
              editorKey,
              JSON.parse(snapshot),
            );
            savedSnapshot.current = snapshot;
            if (alive.current) setStorageError(false);
            return true;
          } catch {
            if (alive.current) setStorageError(true);
            return false;
          }
        });
      writer.current = save;
      return settleEditorWrites(writer, save);
    }, [userId, businessId, editorKey, editorSnapshot, loaded]);
    useImperativeHandle(ref, () => ({ persist }), [persist]);
    useEffect(() => {
      if (loaded) void persist();
    }, [loaded, persist]);
    useEffect(() => {
      const flush = () => {
        if (document.visibilityState === "hidden") void persist();
      };
      const warn = (event: BeforeUnloadEvent) => {
        if (loaded && savedSnapshot.current !== editorSnapshot)
          event.preventDefault();
      };
      document.addEventListener("visibilitychange", flush);
      window.addEventListener("beforeunload", warn);
      return () => {
        document.removeEventListener("visibilitychange", flush);
        window.removeEventListener("beforeunload", warn);
      };
    }, [loaded, editorSnapshot, persist]);
    const needsAmount = ["correct", "add_payment", "correct_payment"].includes(
      action,
    );
    const isPayment =
      action.endsWith("payment") && action !== "resolve_payment";
    let unusual = date > todayInManila();
    try {
      unusual ||=
        needsAmount &&
        (BigInt(amountToCentavos(amount)) === 0n ||
          BigInt(amountToCentavos(amount)) >= 100000000n);
    } catch {
      /* A field error handles unparsed text. */
    }
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
                : t.resolve;
    async function review(event: FormEvent) {
      event.preventDefault();
      if (reviewing) return;
      setReviewing(true);
      try {
        if (
          (needsAmount && !isBusinessDate(date)) ||
          (action !== "add_payment" && !reason.trim()) ||
          (unusual && !checked)
        )
          throw new Error("validation");
        let values: Record<string, unknown>;
        if (isPayment && needsAmount) {
          const paid = BigInt(amountToCentavos(amount));
          const available =
            BigInt(record.amountCentavos) -
            BigInt(record.paidCentavos) +
            (payment && payment.status === "active"
              ? BigInt(payment.amountCentavos)
              : 0n);
          if (paid <= 0n || paid > available)
            throw new Error("INVALID_PAYMENT");
          if (date < record.businessDate)
            throw new Error("PAYMENT_BEFORE_RECORD");
        }
        if (action === "correct")
          values = {
            kind,
            businessDate: date,
            amountCentavos: amountToCentavos(amount),
            description: description.trim() || null,
            reason: reason.trim(),
          };
        else if (action === "add_payment")
          values = {
            amountCentavos: amountToCentavos(amount),
            paymentDate: date,
          };
        else if (action === "correct_payment" && payment)
          values = {
            paymentId: payment.id,
            expectedPaymentRevision: payment.revision,
            amountCentavos: amountToCentavos(amount),
            paymentDate: date,
            reason: reason.trim(),
          };
        else if (action === "void_payment" && payment)
          values = {
            paymentId: payment.id,
            expectedPaymentRevision: payment.revision,
            reason: reason.trim(),
          };
        else if (action === "resolve_payment")
          values = { paymentKnowledge: known, reason: reason.trim() };
        else values = { reason: reason.trim() };
        if (!(await persist()) || !alive.current) return;
        onReview({
          businessId,
          operationId: crypto.randomUUID(),
          action,
          recordId: record.id,
          expectedRevision: record.revision,
          values,
        });
      } catch (cause) {
        setError(true);
        setValidationIssue(
          cause instanceof Error ? cause.message : "validation",
        );
      } finally {
        if (alive.current) setReviewing(false);
      }
    }
    return (
      <section className={styles.card} aria-labelledby="change-heading">
        <h2 id="change-heading">{title}</h2>
        {action === "void" ? <p>{t.voidHelp}</p> : null}
        {action === "resolve_payment" ? <p>{t.resolveHelp}</p> : null}
        <form onSubmit={review} className={styles.card}>
          {!loaded ? <p role="status">{t.loading}</p> : null}
          {storageError ? (
            <div className={styles.notice + " " + styles.error} role="alert">
              <p>{t.storageError}</p>
              <button
                type="button"
                className="text-button"
                onClick={() => {
                  if (loaded) void persist();
                  else setLoadKey((key) => key + 1);
                }}
              >
                {t.retry}
              </button>
            </div>
          ) : null}
          {error ? (
            <p className={styles.notice + " " + styles.error} role="alert">
              {validationIssue === "INVALID_PAYMENT"
                ? t.invalidPayment
                : validationIssue === "PAYMENT_BEFORE_RECORD"
                  ? t.paymentBefore
                  : t.validation}
            </p>
          ) : null}
          {needsAmount ? (
            <>
              {isPayment ? (
                <p className={styles.muted}>
                  {t.balance}:{" "}
                  {record.remainingCentavos === null
                    ? t.unknownBalance
                    : formatPHP(record.remainingCentavos)}
                </p>
              ) : null}
              <label className={styles.field}>
                {isPayment ? t.amountPaid : t.amount}
                <input
                  inputMode="decimal"
                  disabled={!loaded || reviewing}
                  value={amount}
                  onChange={(event) => {
                    setAmount(event.target.value);
                    setChecked(false);
                  }}
                  required
                  aria-invalid={error || undefined}
                />
                {!isPayment ? <small>PHP · {t.zeroHelp}</small> : null}
              </label>
              <label className={styles.field}>
                {isPayment ? t.paymentDate : t.date}
                <input
                  type="date"
                  disabled={!loaded || reviewing}
                  min="1900-01-01"
                  max="2100-12-31"
                  value={date}
                  onChange={(event) => {
                    setDate(event.target.value);
                    setChecked(false);
                  }}
                  required
                />
                {isPayment ? <small>{t.paymentDateHelp}</small> : null}
              </label>
            </>
          ) : null}
          {action === "correct" ? (
            <>
              <label className={styles.field}>
                {t.kind}
                <select
                  value={kind}
                  disabled={!loaded || reviewing}
                  onChange={(event) =>
                    setKind(event.target.value as TransactionKind)
                  }
                >
                  {(
                    [
                      "sale",
                      "expense",
                      "owner_contribution",
                      "owner_withdrawal",
                      ...(![
                        "sale",
                        "expense",
                        "owner_contribution",
                        "owner_withdrawal",
                      ].includes(record.kind)
                        ? [record.kind]
                        : []),
                    ] as TransactionKind[]
                  ).map((value) => (
                    <option key={value} value={value}>
                      {value === "sale"
                        ? t.salesKind
                        : value === "expense"
                          ? t.expenseKind
                          : t[value]}
                    </option>
                  ))}
                </select>
              </label>
              <label className={styles.field}>
                {t.description}
                <textarea
                  maxLength={500}
                  disabled={!loaded || reviewing}
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                />
              </label>
            </>
          ) : null}
          {action === "resolve_payment" ? (
            <label className={styles.field}>
              {t.payment}
              <select
                value={known}
                disabled={!loaded || reviewing}
                onChange={(event) =>
                  setKnown(event.target.value as "known" | "unknown")
                }
              >
                <option value="known">{t.known}</option>
                <option value="unknown">{t.paymentUnknown}</option>
              </select>
            </label>
          ) : null}
          {action !== "add_payment" ? (
            <label className={styles.field}>
              {t.reason}
              <textarea
                value={reason}
                disabled={!loaded || reviewing}
                onChange={(event) => setReason(event.target.value)}
                maxLength={500}
                required
              />
              <small>{t.reasonHint}</small>
            </label>
          ) : null}
          {unusual && needsAmount ? (
            <div className={styles.notice}>
              <p>{t.unusual}</p>
              <label>
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(event) => setChecked(event.target.checked)}
                />{" "}
                {t.checkedUnusual}
              </label>
            </div>
          ) : null}
          <div className={styles.actions}>
            <button
              className="button primary"
              type="submit"
              disabled={!loaded || reviewing}
            >
              {t.review}
            </button>
            <button
              className="text-button"
              type="button"
              disabled={reviewing}
              onClick={async () => {
                if (await persist()) onCancel();
              }}
            >
              {t.cancel}
            </button>
          </div>
        </form>
      </section>
    );
  },
);
export function decimal(centavos: string) {
  return formatPHP(centavos).replace("₱", "").replaceAll(",", "");
}
