"use client";

import { buildLedgerEntry } from "../guided-ledger";
import { useJourneyHistory } from "@/components/journey-history";
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type FormEvent,
  type ChangeEvent,
} from "react";
import {
  ApiError,
  confirmTransaction,
  confirmLedgerTransaction,
} from "../client/api";
import {
  deleteDraft,
  DraftStorageError,
  loadDraft,
  saveDraft,
  releaseRejectedDraft,
} from "../client/drafts";
import {
  advanceGuidedDraft,
  allowedMovements,
  amountToCentavos,
  buildCommand,
  buildGuidedCommand,
  formatPHP,
  resolveGuidedStep,
  resolvePaymentAnswer,
  selectPaymentAnswer,
  todayInManila,
  validateDraft,
} from "../transaction.rules";
import type {
  Business,
  DraftErrors,
  SavedDraft,
  TransactionDraft,
  ValidationCode,
} from "../transaction.types";
import { errorMessage, type Language, type Messages } from "@/i18n/messages";
import { guidedMessages } from "@/i18n/guided-messages";
import { Icon } from "./icons";

export type TransactionFormHandle = {
  persist: () => Promise<boolean>;
  snapshot: () => SavedDraft | null;
};
type Props = {
  userId: string;
  businessId: string;
  t: Messages;
  language?: Language;
  initialKind?: "sale" | "expense" | "owner_contribution" | "owner_withdrawal";
  draftId?: string;
  businessActivity?: Business["activity"];
  onAccepted: () => void;
  onHome: () => void;
  onViewRecord?: (id: string) => void;
  disabled?: boolean;
  recovery?: SavedDraft;
  onRecoverySaved?: () => void;
};

function emptyDraft(
  kind: "sale" | "expense" | "owner_contribution" | "owner_withdrawal",
  operationId = crypto.randomUUID(),
): SavedDraft {
  return {
    operationId,
    draft: {
      amount: "",
      businessDate: todayInManila(),
      kind,
      description: "",
      moneyMovement: "unknown",
    },
    step: "edit",
    ...(kind === "sale" || kind === "expense"
      ? { guidedStep: "amount" as const }
      : {}),
    pendingCommand: null,
    entryVersion: 2,
  };
}
function codeOf(error: unknown) {
  return error instanceof ApiError || error instanceof DraftStorageError
    ? error.code
    : "SERVER_ERROR";
}
function fieldMessage(code: ValidationCode | undefined, t: Messages) {
  if (!code) return undefined;
  return {
    required: t.required,
    invalid_amount: t.invalidAmount,
    amount_too_large: t.amountTooLarge,
    invalid_date: t.invalidDate,
    invalid_kind: t.invalidChoice,
    invalid_movement: t.invalidChoice,
    description_too_long: t.invalidDescription,
  }[code];
}

export const TransactionForm = forwardRef<TransactionFormHandle, Props>(
  function TransactionForm(
    {
      userId,
      businessId,
      t,
      language = "en",
      initialKind = "sale",
      draftId,
      businessActivity,
      onAccepted,
      onHome,
      onViewRecord,
      disabled = false,
      recovery,
      onRecoverySaved,
    },
    ref,
  ) {
    const g = guidedMessages[language];
    const [state, setState] = useState<SavedDraft | null>(null);
    const [errors, setErrors] = useState<DraftErrors>({});
    const [problem, setProblem] = useState<string | null>(null);
    const [comparison, setComparison] = useState<SavedDraft | null>(null);
    const [unusualConfirmed, setUnusualConfirmed] = useState(false);
    const [errorCode, setErrorCode] = useState<string | null>(null);
    const [localStatus, setLocalStatus] = useState<
      "unsaved" | "saving" | "saved"
    >("unsaved");
    const [busy, setBusy] = useState(false);
    const [accepted, setAccepted] = useState(false);
    const [acceptedId, setAcceptedId] = useState<string | null>(null);
    const [cleaned, setCleaned] = useState(false);
    const [online, setOnline] = useState(true);
    const [detailsOpen, setDetailsOpen] = useState(false);
    const [legacyStage, setLegacyStage] = useState<
      "amount" | "payment" | "review"
    >("amount");
    const alive = useRef(true);
    const stateRef = useRef<SavedDraft | null>(null);
    const persisted = useRef<SavedDraft | null>(null);
    const acceptedRef = useRef(false);
    const writer = useRef<Promise<boolean>>(Promise.resolve(true));
    const request = useRef<AbortController | null>(null);
    const recoveryRef = useRef(recovery);
    const recoverySavedRef = useRef(onRecoverySaved);
    const heading = useRef<HTMLHeadingElement>(null);
    const form = useRef<HTMLFormElement>(null);
    useEffect(() => {
      recoverySavedRef.current = onRecoverySaved;
    }, [onRecoverySaved]);

    function change(next: SavedDraft) {
      stateRef.current = next;
      setState(next);
      setLocalStatus("unsaved");
      setErrorCode(null);
      setProblem(null);
    }

    useEffect(() => {
      alive.current = true;
      loadDraft(userId, businessId, draftId)
        .then((saved) => {
          if (!alive.current) return;
          const next =
            recoveryRef.current ?? saved ?? emptyDraft(initialKind, draftId);
          persisted.current = saved;
          stateRef.current = next;
          setState(next);
          setDetailsOpen(Boolean(next.draft.description));
          setLegacyStage(next.step === "review" ? "review" : "amount");
          setLocalStatus(
            recoveryRef.current ? "unsaved" : saved ? "saved" : "unsaved",
          );
        })
        .catch((error) => {
          if (!alive.current) return;
          setErrorCode(codeOf(error));
          if (recoveryRef.current) {
            stateRef.current = recoveryRef.current;
            setState(recoveryRef.current);
          }
        });
      return () => {
        alive.current = false;
        request.current?.abort();
      };
    }, [userId, businessId, initialKind, draftId]);

    useEffect(() => {
      if (errorCode !== "LOCAL_DRAFT_CONFLICT" || !state?.operationId) return;
      let active = true;
      loadDraft(userId, businessId, state.operationId)
        .then((saved) => {
          if (active) setComparison(saved);
        })
        .catch(() => {});
      return () => {
        active = false;
      };
    }, [errorCode, userId, businessId, state?.operationId]);

    const persist = useCallback((): Promise<boolean> => {
      const write = async () => {
        if (acceptedRef.current) return true;
        let snapshot = stateRef.current;
        if (!snapshot) return false;
        if (
          !persisted.current &&
          snapshot.draft.amount === "" &&
          snapshot.draft.description === "" &&
          snapshot.draft.businessDate === todayInManila() &&
          snapshot.guidedStep === "amount" &&
          !snapshot.paymentAnswer &&
          !snapshot.pendingCommand &&
          !snapshot.pendingLedgerCommand
        )
          return true;
        try {
          while (
            snapshot &&
            snapshot !== persisted.current &&
            !acceptedRef.current
          ) {
            if (alive.current) setLocalStatus("saving");
            await saveDraft(userId, businessId, snapshot, persisted.current);
            persisted.current = snapshot;
            snapshot = stateRef.current;
          }
          if (alive.current && !acceptedRef.current) {
            setLocalStatus("saved");
            setErrorCode(null);
            recoverySavedRef.current?.();
          }
          return true;
        } catch (error) {
          if (alive.current) {
            setErrorCode(codeOf(error));
            setLocalStatus("unsaved");
          }
          return false;
        }
      };
      const result = writer.current.catch(() => false).then(write);
      writer.current = result;
      return result;
    }, [userId, businessId]);

    useImperativeHandle(
      ref,
      () => ({
        persist,
        snapshot: () => (acceptedRef.current ? null : stateRef.current),
      }),
      [persist],
    );

    useEffect(() => {
      if (!state || accepted || state === persisted.current) return;
      const started =
        state.draft.amount !== "" ||
        state.draft.description !== "" ||
        state.draft.businessDate !== todayInManila() ||
        state.guidedStep !== "amount" ||
        Boolean(state.paymentAnswer);
      if (!started) return;
      const timer = window.setTimeout(() => {
        void persist();
      }, 400);
      return () => window.clearTimeout(timer);
    }, [state, accepted, persist]);

    useEffect(() => {
      const updateOnline = () => setOnline(navigator.onLine);
      const flushHidden = () => {
        if (document.visibilityState === "hidden") void persist();
      };
      const warnUnsaved = (event: BeforeUnloadEvent) => {
        if (
          !acceptedRef.current &&
          stateRef.current &&
          stateRef.current !== persisted.current &&
          stateRef.current.draft.amount !== ""
        )
          event.preventDefault();
      };
      updateOnline();
      window.addEventListener("online", updateOnline);
      window.addEventListener("offline", updateOnline);
      document.addEventListener("visibilitychange", flushHidden);
      window.addEventListener("beforeunload", warnUnsaved);
      return () => {
        window.removeEventListener("online", updateOnline);
        window.removeEventListener("offline", updateOnline);
        document.removeEventListener("visibilitychange", flushHidden);
        window.removeEventListener("beforeunload", warnUnsaved);
      };
    }, [persist]);

    const kind = state?.draft.kind ?? initialKind;
    const isGuided = kind === "sale" || kind === "expense";
    const isExpense = kind === "expense";
    const stage = state
      ? isGuided
        ? resolveGuidedStep(state)
        : legacyStage
      : "amount";
    const frozen = Boolean(
      state?.pendingCommand || state?.pendingLedgerCommand,
    );
    const locked = busy || disabled;
    useJourneyHistory(
      `entry:${state?.operationId ?? draftId}`,
      { stage },
      (next) => {
        if (!state || accepted || frozen) return;
        if (
          next.stage === "amount" ||
          next.stage === "payment" ||
          next.stage === "review"
        ) {
          const step = next.stage;
          change({
            ...state,
            step: step === "review" ? "review" : "edit",
            ...(isGuided ? { guidedStep: step } : {}),
          });
          if (!isGuided) setLegacyStage(step);
          setErrors({});
          requestAnimationFrame(() => heading.current?.focus());
        }
      },
      async () => !locked && (await persist()),
      Boolean(state),
    );
    const answer = state ? resolvePaymentAnswer(state) : undefined;
    const title = accepted
      ? isGuided
        ? isExpense
          ? g.savedExpense
          : g.savedSale
        : g.savedRecord
      : stage === "review"
        ? g.reviewQuestion
        : stage === "payment"
          ? isGuided
            ? isExpense
              ? g.paymentExpense
              : g.paymentSale
            : g.legacyQuestion
          : isGuided
            ? isExpense
              ? g.amountExpense
              : g.amountSale
            : t[kind];
    const taskTitle = isGuided
      ? isExpense
        ? g.recordExpense
        : g.recordSale
      : t[kind];
    const noteExample = isExpense
      ? g.exampleExpense
      : businessActivity === "products"
        ? g.exampleProducts
        : businessActivity === "services"
          ? g.exampleServices
          : businessActivity === "both"
            ? g.exampleBoth
            : g.exampleOther;
    const focusHeading = () =>
      requestAnimationFrame(() => heading.current?.focus());

    function update<K extends keyof TransactionDraft>(
      field: K,
      value: TransactionDraft[K],
    ) {
      if (!state || frozen || locked) return;
      setUnusualConfirmed(false);
      change({ ...state, draft: { ...state.draft, [field]: value } });
      if (errors[field])
        setErrors(validateDraft({ ...state.draft, [field]: value }));
    }
    function choosePayment(event: ChangeEvent<HTMLInputElement>) {
      const current = stateRef.current;
      const value = event.target.value;
      if (
        current &&
        !frozen &&
        !locked &&
        (value === "paid" ||
          value === "partial" ||
          value === "unpaid" ||
          value === "unknown")
      )
        change(selectPaymentAnswer(current, value));
    }
    function navigate(next: "amount" | "payment") {
      if (!state || frozen || locked) return;
      if (isGuided) change({ ...state, step: "edit", guidedStep: next });
      else {
        change({ ...state, step: "edit" });
        setLegacyStage(next);
      }
      setErrors({});
      focusHeading();
    }
    function advance(event: FormEvent) {
      event.preventDefault();
      if (!state || frozen || locked) return;
      if (isGuided) {
        const result = advanceGuidedDraft(state);
        if (!result.ok) {
          setErrors(result.errors);
          setProblem(result.problem ?? null);
          requestAnimationFrame(() =>
            form.current
              ?.querySelector<HTMLElement>("[aria-invalid=true]")
              ?.focus(),
          );
          return;
        }
        change(result.state);
      } else {
        const nextErrors = validateDraft(state.draft);
        if (Object.keys(nextErrors).length) {
          setErrors(nextErrors);
          return;
        }
        if (legacyStage === "amount") setLegacyStage("payment");
        else {
          change({ ...state, step: "review" });
          setLegacyStage("review");
        }
      }
      setErrors({});
      focusHeading();
    }
    async function goHome() {
      if (locked) return;
      setBusy(true);
      if (await persist()) onHome();
      if (alive.current) setBusy(false);
    }
    async function confirm() {
      if (!state || locked || (!frozen && unusual && !unusualConfirmed)) return;
      setBusy(true);
      setErrorCode(null);
      try {
        const ledgerCommand =
          state.pendingLedgerCommand ??
          (state.entryVersion === 2
            ? buildLedgerEntry(businessId, state)
            : null);
        const command = ledgerCommand
          ? null
          : (state.pendingCommand ??
            (isGuided
              ? buildGuidedCommand(businessId, state)
              : buildCommand(businessId, state.operationId, state.draft)));
        const pending = {
          ...state,
          step: "review" as const,
          ...(ledgerCommand
            ? { pendingLedgerCommand: ledgerCommand }
            : { pendingCommand: command }),
        };
        change(pending);
        if (!(await persist()) || !alive.current) return;
        request.current = new AbortController();
        const acknowledgement = ledgerCommand
          ? await confirmLedgerTransaction(
              ledgerCommand,
              request.current.signal,
            )
          : command
            ? await confirmTransaction(command, request.current.signal)
            : null;
        if (!alive.current) return;
        setAcceptedId(acknowledgement?.id ?? null);
        acceptedRef.current = true;
        setAccepted(true);
        await writer.current;
        onAccepted();
        await deleteDraft(userId, businessId, pending.operationId);
        persisted.current = null;
        if (alive.current) setCleaned(true);
        focusHeading();
      } catch (error) {
        if (
          alive.current &&
          !(error instanceof Error && error.name === "AbortError")
        ) {
          const code = codeOf(error);
          if (
            !acceptedRef.current &&
            stateRef.current &&
            [
              "VALIDATION_ERROR",
              "INVALID_PAYMENT",
              "PAYMENT_BEFORE_RECORD",
              "UNSUPPORTED_SETTLEMENT",
            ].includes(code)
          ) {
            try {
              const editable = await releaseRejectedDraft(
                userId,
                businessId,
                stateRef.current,
                code,
              );
              persisted.current = editable;
              stateRef.current = editable;
              setState(editable);
              setLocalStatus("saved");
              setLegacyStage("payment");
            } catch {
              /* A conflicting or uncertain stored command remains frozen. */
            }
          }
          setErrorCode(code);
        }
      } finally {
        if (alive.current) setBusy(false);
      }
    }
    async function cleanupAccepted() {
      if (!state || locked) return;
      setBusy(true);
      try {
        await deleteDraft(userId, businessId, state.operationId);
        persisted.current = null;
        setCleaned(true);
        setErrorCode(null);
      } catch (error) {
        setErrorCode(codeOf(error));
      } finally {
        if (alive.current) setBusy(false);
      }
    }
    function another() {
      if (!cleaned) return;
      acceptedRef.current = false;
      setAccepted(false);
      setCleaned(false);
      setErrors({});
      setProblem(null);
      persisted.current = null;
      setDetailsOpen(false);
      setLegacyStage("amount");
      change(emptyDraft(initialKind));
      focusHeading();
    }
    async function restoreExisting() {
      setBusy(true);
      try {
        const saved = await loadDraft(
          userId,
          businessId,
          state?.operationId ?? draftId,
        );
        if (!alive.current) return;
        const next = saved ?? emptyDraft(initialKind);
        persisted.current = saved;
        stateRef.current = next;
        setState(next);
        setLegacyStage(next.step === "review" ? "review" : "amount");
        setDetailsOpen(Boolean(next.draft.description));
        setLocalStatus(saved ? "saved" : "unsaved");
        setErrorCode(null);
        setErrors({});
        recoverySavedRef.current?.();
      } catch (error) {
        if (alive.current) setErrorCode(codeOf(error));
      } finally {
        if (alive.current) setBusy(false);
      }
    }
    async function keepCurrentVersion() {
      if (
        !state ||
        !comparison ||
        comparison.pendingCommand ||
        comparison.pendingLedgerCommand ||
        frozen
      )
        return;
      setBusy(true);
      try {
        await saveDraft(userId, businessId, state, comparison);
        persisted.current = state;
        setLocalStatus("saved");
        setErrorCode(null);
        setComparison(null);
      } catch (error) {
        setErrorCode(codeOf(error));
      } finally {
        if (alive.current) setBusy(false);
      }
    }
    const unusual = Boolean(
      state &&
      (() => {
        try {
          const amount = BigInt(amountToCentavos(state.draft.amount));
          const today = todayInManila();
          const past = new Date(today + "T00:00:00Z");
          past.setUTCFullYear(past.getUTCFullYear() - 1);
          return (
            amount === 0n ||
            amount >= 100000000n ||
            state.draft.businessDate > today ||
            state.draft.businessDate < past.toISOString().slice(0, 10)
          );
        } catch {
          return false;
        }
      })(),
    );
    const retryLatest = useRef<() => void>(() => {});
    useEffect(() => {
      retryLatest.current = () => {
        if (
          stateRef.current?.pendingCommand ||
          stateRef.current?.pendingLedgerCommand
        )
          void confirm();
      };
    });
    useEffect(() => {
      const retry = () => {
        if (navigator.onLine) retryLatest.current();
      };
      const resume = () => {
        if (document.visibilityState === "visible") retry();
      };
      window.addEventListener("online", retry);
      document.addEventListener("visibilitychange", resume);
      return () => {
        window.removeEventListener("online", retry);
        document.removeEventListener("visibilitychange", resume);
      };
    }, []);
    function downloadDraft() {
      if (!state) return;
      const url = URL.createObjectURL(
        new Blob([JSON.stringify({ businessId, ...state }, null, 2)], {
          type: "application/json",
        }),
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = "business-record-draft.json";
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
    const paymentText =
      !isGuided && state
        ? state.draft.moneyMovement === "in"
          ? g.received
          : state.draft.moneyMovement === "out"
            ? g.paidOut
            : t[state.draft.moneyMovement]
        : answer
          ? g[answer]
          : g.unknown;
    const saveLabel = isGuided
      ? isExpense
        ? g.saveExpense
        : g.saveSale
      : g.saveRecord;
    const amountError = fieldMessage(errors.amount, t);
    const dateError = fieldMessage(errors.businessDate, t);

    return (
      <section className="guided-entry" aria-labelledby="entry-title">
        <div className="task-navigation">
          <button
            type="button"
            className="text-button"
            onClick={() => {
              if (accepted || stage === "amount" || frozen) void goHome();
              else navigate(stage === "review" ? "payment" : "amount");
            }}
            disabled={locked}
          >
            {accepted ? g.home : g.back}
          </button>
          <span>
            {taskTitle}
            {!accepted
              ? ` · ${stage === "amount" ? 1 : stage === "payment" ? 2 : 3} / 3`
              : ""}
          </span>
        </div>
        {!accepted ? (
          <ol className="guided-progress" aria-label={taskTitle}>
            {(["amount", "payment", "review"] as const).map((item, index) => (
              <li key={item} aria-current={stage === item ? "step" : undefined}>
                <span aria-hidden="true">{index + 1}</span>
                {index === 0
                  ? g.amountStep.slice(4)
                  : index === 1
                    ? g.paymentStep.slice(4)
                    : g.reviewStep.slice(4)}
              </li>
            ))}
          </ol>
        ) : null}
        <div className="card guided-card">
          <div className="guided-card-body">
            <h1 id="entry-title" ref={heading} tabIndex={-1}>
              {title}
            </h1>
            {errorCode ? (
              <div className="alert error" role="alert">
                {errorMessage(errorCode, t)}
              </div>
            ) : null}
            {errorCode === "LOCAL_DRAFT_CONFLICT" ? (
              <div className="alert info">
                <p>
                  {language === "en"
                    ? "Another tab changed this draft. Compare the versions before choosing."
                    : "Binago ng ibang tab ang draft. Ihambing muna ang mga bersyon."}
                </p>
                {comparison ? (
                  <div className="draft-comparison">
                    {[state, comparison].map((item, index) =>
                      item ? (
                        <dl key={index}>
                          <dt>
                            {language === "en"
                              ? index
                                ? "Saved version"
                                : "Your current version"
                              : index
                                ? "Naka-save na bersyon"
                                : "Kasalukuyang bersyon"}
                          </dt>
                          <dd>{t[item.draft.kind]}</dd>
                          <dd>{item.draft.amount || "—"} PHP</dd>
                          <dd>{item.draft.businessDate}</dd>
                          <dd>{item.draft.description || g.noDetails}</dd>
                          <dd>
                            {item.paymentAnswer
                              ? g[item.paymentAnswer]
                              : item.draft.moneyMovement === "in"
                                ? g.received
                                : item.draft.moneyMovement === "out"
                                  ? g.paidOut
                                  : t[item.draft.moneyMovement]}
                          </dd>
                          <dd>
                            {item.pendingCommand || item.pendingLedgerCommand
                              ? g.waiting
                              : g.deviceSaved}
                          </dd>
                        </dl>
                      ) : null,
                    )}
                  </div>
                ) : null}
                {comparison &&
                !comparison.pendingCommand &&
                !comparison.pendingLedgerCommand &&
                !frozen ? (
                  <button
                    className="button secondary full"
                    type="button"
                    disabled={locked}
                    onClick={() => void keepCurrentVersion()}
                  >
                    {language === "en"
                      ? "Keep my current version"
                      : "Panatilihin ang kasalukuyang bersyon"}
                  </button>
                ) : null}
                <details>
                  <summary>
                    {language === "en"
                      ? "Technical recovery copy"
                      : "Kopya para sa teknikal na pagbawi"}
                  </summary>
                  <button
                    className="button secondary full"
                    type="button"
                    onClick={downloadDraft}
                  >
                    {t.downloadDraft}
                  </button>
                </details>
                <button
                  className="text-button"
                  type="button"
                  disabled={locked}
                  onClick={() => void restoreExisting()}
                >
                  {t.useSavedDraft}
                </button>
              </div>
            ) : null}
            {errorCode === "LOCAL_STORAGE_FAILED" ? (
              <button
                className="text-button"
                type="button"
                disabled={locked}
                onClick={() => void persist()}
              >
                {g.retryLocal}
              </button>
            ) : null}
            {!state ? (
              <p role="status">{errorCode ? g.localFailure : t.loading}</p>
            ) : accepted ? (
              <div className="guided-success" role="status">
                <p className="chip">{g.accepted}</p>
                {!isGuided ? (
                  <p className="review-amount">
                    {formatPHP(amountToCentavos(state.draft.amount))}
                  </p>
                ) : null}
                {isGuided ? (
                  <PaymentBalance state={state} language={language} />
                ) : null}
                <dl className="review-list">
                  <div className="review-row">
                    <dt>{t.date}</dt>
                    <dd>{state.draft.businessDate}</dd>
                  </div>
                  <div className="review-row">
                    <dt>{g.paymentLabel}</dt>
                    <dd>{paymentText}</dd>
                  </div>
                  {state.draft.description ? (
                    <div className="review-row">
                      <dt>{g.detailsLabel}</dt>
                      <dd>{state.draft.description}</dd>
                    </div>
                  ) : null}
                </dl>
                {acceptedId && onViewRecord ? (
                  <button
                    className="button primary full"
                    type="button"
                    disabled={locked || !cleaned}
                    onClick={() => onViewRecord(acceptedId)}
                  >
                    {language === "en"
                      ? "View record & payments"
                      : "Tingnan ang tala at bayad"}
                  </button>
                ) : null}
                <button
                  type="button"
                  className="button secondary full"
                  disabled={locked}
                  onClick={cleaned ? another : () => void cleanupAccepted()}
                >
                  {cleaned ? g.addAgain : g.retryLocal}
                </button>
                <button
                  type="button"
                  className="button secondary full"
                  disabled={locked || !cleaned}
                  onClick={onHome}
                >
                  {g.home}
                </button>
              </div>
            ) : (
              <form ref={form} onSubmit={advance} noValidate>
                <fieldset className="guided-fields" disabled={locked}>
                  {stage === "amount" ? (
                    <>
                      <div className="field">
                        <label htmlFor="amount">{t.amount}</label>
                        <div className="amount-field">
                          <span aria-hidden="true">₱</span>
                          <input
                            id="amount"
                            name="amount"
                            type="text"
                            inputMode="decimal"
                            autoComplete="off"
                            value={state.draft.amount}
                            onChange={(event) =>
                              update("amount", event.target.value)
                            }
                            placeholder="0.00"
                            required
                            aria-invalid={Boolean(amountError)}
                            aria-describedby={
                              amountError
                                ? "amount-hint amount-error"
                                : "amount-hint"
                            }
                          />
                        </div>
                        <p id="amount-hint" className="screen-reader-only">
                          {t.amountHint}
                        </p>
                        {amountError ? (
                          <p id="amount-error" className="field-error">
                            {amountError}
                          </p>
                        ) : null}
                      </div>
                      <div className="field">
                        <label htmlFor="businessDate">{t.date}</label>
                        <input
                          id="businessDate"
                          name="businessDate"
                          type="date"
                          min="1900-01-01"
                          max="2100-12-31"
                          value={state.draft.businessDate}
                          onChange={(event) =>
                            update("businessDate", event.target.value)
                          }
                          required
                          aria-invalid={Boolean(dateError)}
                          aria-describedby={
                            dateError
                              ? "date-hint businessDate-error"
                              : "date-hint"
                          }
                        />
                        <p id="date-hint" className="screen-reader-only">
                          {t.dateHint}
                        </p>
                        {dateError ? (
                          <p id="businessDate-error" className="field-error">
                            {dateError}
                          </p>
                        ) : null}
                      </div>
                      <div className="optional-details">
                        <button
                          type="button"
                          className="text-button"
                          aria-expanded={detailsOpen}
                          aria-controls="extra-details"
                          onClick={() => setDetailsOpen((value) => !value)}
                        >
                          {detailsOpen ? g.hideDetails : g.addDetails}
                        </button>
                        {detailsOpen ? (
                          <div id="extra-details" className="field">
                            <label htmlFor="description">
                              {g.detailsLabel}
                            </label>
                            <textarea
                              id="description"
                              name="description"
                              rows={2}
                              value={state.draft.description}
                              onChange={(event) =>
                                update("description", event.target.value)
                              }
                              placeholder={noteExample}
                              aria-invalid={Boolean(errors.description)}
                              aria-describedby="description-help"
                            />
                            <p
                              id="description-help"
                              className={
                                errors.description
                                  ? "field-error"
                                  : "field-hint"
                              }
                            >
                              {errors.description
                                ? fieldMessage(errors.description, t)
                                : g.detailsHint}
                            </p>
                          </div>
                        ) : null}
                      </div>
                    </>
                  ) : stage === "payment" ? (
                    <>
                      {!isGuided ? (
                        <p className="guided-intro">{g.legacyHelp}</p>
                      ) : null}
                      {problem === "payment_required" ? (
                        <p className="field-error" role="alert">
                          {g.paymentRequired}
                        </p>
                      ) : null}
                      <fieldset className="payment-choices">
                        <legend className="screen-reader-only">{title}</legend>
                        {isGuided
                          ? (
                              ["paid", "partial", "unpaid", "unknown"] as const
                            ).map((value) => (
                              <label
                                className="choice-card"
                                key={value}
                                data-selected={answer === value}
                              >
                                <input
                                  type="radio"
                                  name="payment"
                                  value={value}
                                  checked={answer === value}
                                  onChange={choosePayment}
                                />
                                <span>
                                  <strong>{g[value]}</strong>
                                </span>
                              </label>
                            ))
                          : allowedMovements(kind).map((value) => (
                              <label
                                key={value}
                                className="choice-card"
                                data-selected={
                                  state.draft.moneyMovement === value
                                }
                              >
                                <input
                                  type="radio"
                                  name="legacyMovement"
                                  value={value}
                                  checked={state.draft.moneyMovement === value}
                                  onChange={() =>
                                    change({
                                      ...state,
                                      draft: {
                                        ...state.draft,
                                        moneyMovement: value,
                                      },
                                    })
                                  }
                                />
                                <strong>
                                  {value === "in"
                                    ? g.received
                                    : value === "out"
                                      ? g.paidOut
                                      : t[value]}
                                </strong>
                              </label>
                            ))}
                      </fieldset>
                      {state.entryVersion === 2 &&
                      (answer === "paid" || answer === "partial") ? (
                        <div className="form-stack">
                          {answer === "partial" ? (
                            <div className="field">
                              <label htmlFor="paymentAmount">
                                {g.amountPaid}
                              </label>
                              <input
                                id="paymentAmount"
                                inputMode="decimal"
                                value={state.paymentAmount ?? ""}
                                onChange={(e) =>
                                  change({
                                    ...state,
                                    paymentAmount: e.target.value,
                                  })
                                }
                              />
                            </div>
                          ) : null}
                          <div className="field">
                            <label htmlFor="paymentDate">{g.paymentDate}</label>
                            <input
                              id="paymentDate"
                              type="date"
                              value={
                                state.paymentDate ?? state.draft.businessDate
                              }
                              onChange={(e) =>
                                change({
                                  ...state,
                                  paymentDate: e.target.value,
                                })
                              }
                            />
                          </div>
                          {problem ? (
                            <p role="alert" className="field-error">
                              {problem === "invalid_payment_date"
                                ? g.invalidPaymentDate
                                : g.invalidPaymentAmount}
                            </p>
                          ) : null}
                        </div>
                      ) : answer === "partial" ? (
                        <div className="alert info" role="status">
                          {g.partialUnsupported}
                        </div>
                      ) : answer === "unpaid" ? (
                        <p className="context-help">{g.unpaidNotice}</p>
                      ) : answer === "unknown" ? (
                        <p className="context-help">{g.unknownNotice}</p>
                      ) : null}
                    </>
                  ) : (
                    <>
                      {!isGuided ? (
                        <p className="review-amount">
                          {formatPHP(amountToCentavos(state.draft.amount))}
                        </p>
                      ) : null}
                      {isGuided ? (
                        <PaymentBalance state={state} language={language} />
                      ) : null}
                      <dl className="review-list">
                        <div className="review-row">
                          <dt>{t.date}</dt>
                          <dd>{state.draft.businessDate}</dd>
                        </div>
                        <div className="review-row">
                          <dt>{g.paymentLabel}</dt>
                          <dd>
                            {paymentText}
                            {state.entryVersion === 2 &&
                            (answer === "paid" || answer === "partial")
                              ? ` · ${state.paymentDate ?? state.draft.businessDate}`
                              : ""}
                          </dd>
                        </div>
                        {!isGuided ? (
                          <div className="review-row">
                            <dt>{g.originalType}</dt>
                            <dd>{t[kind]}</dd>
                          </div>
                        ) : null}
                        {state.draft.description ? (
                          <div className="review-row">
                            <dt>{g.detailsLabel}</dt>
                            <dd>{state.draft.description}</dd>
                          </div>
                        ) : null}
                      </dl>
                      {!frozen ? (
                        <div className="review-edit-actions">
                          <button
                            type="button"
                            className="text-button"
                            onClick={() => navigate("amount")}
                          >
                            {g.changeAmount}
                          </button>
                          <button
                            type="button"
                            className="text-button"
                            onClick={() => navigate("payment")}
                          >
                            {g.changePayment}
                          </button>
                        </div>
                      ) : (
                        <div className="alert info">
                          <p>{g.waiting}</p>
                          <p>{t.retryHelp}</p>
                        </div>
                      )}
                      {answer === "unpaid" ? (
                        <p className="context-help">{g.unpaidNotice}</p>
                      ) : answer === "unknown" ? (
                        <p className="context-help">{g.unknownNotice}</p>
                      ) : null}
                    </>
                  )}
                  {stage === "review" && unusual && !frozen ? (
                    <label className="choice-card">
                      <input
                        type="checkbox"
                        checked={unusualConfirmed}
                        onChange={(e) => setUnusualConfirmed(e.target.checked)}
                      />
                      <span>
                        {language === "en"
                          ? "I checked this amount and date. It is zero, unusually large, future-dated, or more than a year old."
                          : "Nasuri ko ang halaga at petsa. Sero, malaki, nasa hinaharap, o higit isang taon na ito."}
                      </span>
                    </label>
                  ) : null}
                  <div className="guided-actions">
                    {stage === "review" ? (
                      <button
                        type="button"
                        className="button primary full"
                        onClick={() => void confirm()}
                        disabled={locked}
                      >
                        {busy ? g.savingAccount : frozen ? g.retry : saveLabel}
                      </button>
                    ) : (
                      <button
                        type="submit"
                        className="button primary full"
                        disabled={
                          locked ||
                          (answer === "partial" &&
                            stage === "payment" &&
                            state.entryVersion !== 2)
                        }
                      >
                        {g.continue}
                        <Icon name="arrow" />
                      </button>
                    )}
                    {!frozen ? (
                      <button
                        type="button"
                        className="text-button"
                        onClick={() => void goHome()}
                      >
                        {g.park}
                      </button>
                    ) : null}
                  </div>
                </fieldset>
              </form>
            )}
            {state && !accepted ? (
              <div className="guided-save-status" aria-live="polite">
                <p>
                  {localStatus === "saving"
                    ? g.saveProgress
                    : localStatus === "saved"
                      ? g.deviceSaved
                      : g.unsaved}
                </p>
                {!online ? (
                  <p>{g.offline}</p>
                ) : frozen ? (
                  <p>{g.waiting}</p>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </section>
    );
  },
);

/** Display only known payment information; all arithmetic stays in centavos. */
function PaymentBalance({
  state,
  language,
}: {
  state: SavedDraft;
  language: Language;
}) {
  const answer = resolvePaymentAnswer(state);
  const total = BigInt(amountToCentavos(state.draft.amount));
  let paid: bigint | null = null;
  if (answer === "paid") paid = total;
  else if (answer === "unpaid") paid = 0n;
  else if (answer === "partial" && state.paymentAmount)
    paid = BigInt(amountToCentavos(state.paymentAmount));
  const expense = state.draft.kind === "expense";
  const labels =
    language === "en"
      ? [expense ? "Expense" : "Sale", expense ? "Paid" : "Received", "Balance"]
      : [
          expense ? "Gastos" : "Benta",
          expense ? "Nabayaran" : "Natanggap",
          "Balanse",
        ];
  return (
    <dl className="balance-strip">
      {[total, paid, paid === null ? null : total - paid].map(
        (value, index) => (
          <div key={labels[index]}>
            <dt>{labels[index]}</dt>
            <dd>
              {value === null
                ? language === "en"
                  ? "Not sure"
                  : "Di pa alam"
                : formatPHP(value.toString())}
            </dd>
          </div>
        ),
      )}
    </dl>
  );
}
