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
import {
  loadSetup,
  saveSetup,
  completeSetup,
  type SetupDraft,
} from "../client/setup-drafts";
import {
  createGuidedBusiness,
  ApiError,
} from "@/features/transactions/client/api";
import type { Business } from "@/features/transactions/transaction.types";
import { errorMessage, type Messages } from "@/i18n/messages";

export type SetupJourneyHandle = {
  persist: () => Promise<boolean>;
  snapshot: () => SetupDraft | null;
};
type Props = {
  userId: string;
  t: Messages;
  canCancel: boolean;
  onCancel: () => void;
  onComplete: (business: Business, task: "sale" | "expense" | "home") => void;
  recovery?: SetupDraft;
  onRecoveryChange?: (value: SetupDraft | null) => void;
};
export const SetupJourney = forwardRef<SetupJourneyHandle, Props>(
  function SetupJourney(
    { userId, t, canCancel, onCancel, onComplete, recovery, onRecoveryChange },
    ref,
  ) {
    const [state, setState] = useState<SetupDraft | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [saved, setSaved] = useState(false);
    const [reload, setReload] = useState(0);
    const current = useRef<SetupDraft | null>(null),
      persisted = useRef<SetupDraft | null>(null);
    const queue = useRef<Promise<boolean>>(Promise.resolve(true));
    const alive = useRef(true);
    const initialRecovery = useRef(recovery);
    const recoveryCallback = useRef(onRecoveryChange);
    useEffect(() => {
      recoveryCallback.current = onRecoveryChange;
    }, [onRecoveryChange]);
    const heading = useRef<HTMLHeadingElement>(null);
    useEffect(() => {
      alive.current = true;
      loadSetup(userId)
        .then((row) => {
          if (!alive.current) return;
          const next = (initialRecovery.current?.userId === userId
            ? initialRecovery.current
            : null) ??
            row ?? {
              userId,
              id: crypto.randomUUID(),
              name: "",
              activity: null,
              step: "name" as const,
              task: null,
              revision: 0,
            };
          current.current = next;
          persisted.current = row;
          setState(next);
          setSaved(Boolean(row));
          setError(null);
        })
        .catch(() => {
          if (alive.current) {
            if (initialRecovery.current?.userId === userId) {
              current.current = initialRecovery.current;
              setState(initialRecovery.current);
            }
            setError("LOCAL_STORAGE_FAILED");
          }
        });
      return () => {
        alive.current = false;
      };
    }, [userId, reload]);
    function change(next: SetupDraft) {
      current.current = next;
      onRecoveryChange?.(next);
      setState(next);
      setSaved(false);
      setError(null);
    }
    const persist = useCallback((): Promise<boolean> => {
      const work = async () => {
        let next = current.current;
        if (!next) return false;
        try {
          while (
            next &&
            JSON.stringify(next) !== JSON.stringify(persisted.current)
          ) {
            const row = await saveSetup(
              next,
              persisted.current?.revision ?? null,
            );
            persisted.current = row;
            if (current.current === next) {
              current.current = row;
              if (alive.current) setState(row);
            }
            next = current.current;
          }
          if (alive.current) {
            setSaved(true);
            recoveryCallback.current?.(null);
          }
          return true;
        } catch (e) {
          if (alive.current) {
            setSaved(false);
            recoveryCallback.current?.(current.current);
            setError(
              e instanceof Error && e.message === "LOCAL_DRAFT_CONFLICT"
                ? "LOCAL_DRAFT_CONFLICT"
                : "LOCAL_STORAGE_FAILED",
            );
          }
          return false;
        }
      };
      queue.current = queue.current.catch(() => false).then(work);
      return queue.current;
    }, []);
    useEffect(() => {
      if (!state) return;
      const timer = setTimeout(() => {
        void persist();
      }, 250);
      return () => clearTimeout(timer);
      // Persist owns current refs, so queued writes always use the latest answers.
    }, [state, persist]);
    useImperativeHandle(ref, () => ({
      persist,
      snapshot: () => current.current,
    }));
    useEffect(() => {
      const flush = () => {
        if (document.visibilityState === "hidden") void persist();
      };
      const warn = (e: BeforeUnloadEvent) => {
        if (
          current.current &&
          JSON.stringify(current.current) !== JSON.stringify(persisted.current)
        )
          e.preventDefault();
      };
      document.addEventListener("visibilitychange", flush);
      window.addEventListener("beforeunload", warn);
      return () => {
        document.removeEventListener("visibilitychange", flush);
        window.removeEventListener("beforeunload", warn);
        void persist();
      };
    }, [persist]);
    useEffect(() => {
      heading.current?.focus({ preventScroll: true });
    }, [state?.step]);
    async function next(e: FormEvent) {
      e.preventDefault();
      if (!state || state.task) return;
      if (
        (state.step === "name" && !state.name.trim()) ||
        (state.step === "activity" && !state.activity)
      ) {
        setError("VALIDATION_ERROR");
        return;
      }
      change({ ...state, step: state.step === "name" ? "activity" : "task" });
      await persist();
    }
    async function finish(task: "sale" | "expense" | "home") {
      const value = current.current;
      if (!value?.activity || busy) return;
      setBusy(true);
      setError(null);
      const frozen = value.task ? value : { ...value, task };
      if (!value.task) change(frozen);
      try {
        if (!(await persist())) return;
        const business = await createGuidedBusiness(
          frozen.name.trim(),
          frozen.activity!,
          frozen.id,
        );
        await completeSetup(userId, frozen.id);
        if (alive.current) onRecoveryChange?.(null);
        if (alive.current) onComplete(business, frozen.task!);
      } catch (e) {
        if (alive.current)
          setError(e instanceof ApiError ? e.code : "LOCAL_STORAGE_FAILED");
      } finally {
        if (alive.current) setBusy(false);
      }
    }
    useJourneyHistory(
      `setup:${userId}`,
      { step: state?.step ?? "name" },
      (next) => {
        const latest = current.current;
        if (
          latest &&
          !latest.task &&
          (next.step === "name" ||
            next.step === "activity" ||
            next.step === "task")
        )
          change({ ...latest, step: next.step });
      },
      async () => !busy && (await persist()),
      Boolean(state),
    );
    if (!state)
      return (
        <section className="journey-card">
          <p role="status">{error ? errorMessage(error, t) : t.loading}</p>
          {error ? (
            <button
              className="button secondary"
              onClick={() => setReload((x) => x + 1)}
            >
              {t.retry}
            </button>
          ) : null}
        </section>
      );
    const choices = [
      ["products", t.activityProducts, t.activityProductsExample],
      ["services", t.activityServices, t.activityServicesExample],
      ["both", t.activityBoth, t.activityBothExample],
      ["other", t.activityOther, t.activityOtherExample],
    ] as const;
    return (
      <section className="guided-setup">
        <div className="task-navigation">
          {state.step !== "name" ? (
            <button
              type="button"
              className="text-button"
              disabled={busy || Boolean(state.task)}
              onClick={() =>
                change({
                  ...state,
                  step: state.step === "task" ? "activity" : "name",
                })
              }
            >
              {t.cancel === "Cancel" ? "Back" : "Bumalik"}
            </button>
          ) : (
            <span />
          )}
          <span>
            {t.setupProgress} ·{" "}
            {["name", "activity", "task"].indexOf(state.step) + 1} / 3
          </span>
        </div>
        <ol className="journey-progress" aria-label={t.setupProgress}>
          {[t.setupNameStep, t.setupActivityStep, t.setupTaskStep].map(
            (text, i) => (
              <li
                key={text}
                aria-current={
                  ["name", "activity", "task"][i] === state.step
                    ? "step"
                    : undefined
                }
              >
                {text}
              </li>
            ),
          )}
        </ol>
        <div className="journey-card">
          <h1 id="setup-question" tabIndex={-1} ref={heading}>
            {state.step === "name"
              ? t.setupNameQuestion
              : state.step === "activity"
                ? t.setupActivityQuestion
                : t.setupTaskQuestion}
          </h1>
          {error ? (
            <div role="alert" className="alert error">
              {errorMessage(error, t)}
              {error === "LOCAL_DRAFT_CONFLICT" ? (
                <button
                  className="text-button"
                  onClick={() => setReload((x) => x + 1)}
                >
                  {t.useSavedDraft}
                </button>
              ) : null}
            </div>
          ) : null}
          <form onSubmit={next}>
            <fieldset
              className="guided-fields"
              disabled={busy || Boolean(state.task)}
            >
              {state.step === "name" ? (
                <div className="field">
                  <label htmlFor="setup-business-name">{t.businessName}</label>
                  <input
                    id="setup-business-name"
                    value={state.name}
                    maxLength={100}
                    required
                    onChange={(e) => change({ ...state, name: e.target.value })}
                  />
                </div>
              ) : state.step === "activity" ? (
                <fieldset className="activity-choices">
                  <legend className="screen-reader-only">
                    {t.setupActivityQuestion}
                  </legend>
                  {choices.map(([value, label]) => (
                    <label className="choice-card" key={value}>
                      <input
                        type="radio"
                        name="businessActivity"
                        value={value}
                        checked={state.activity === value}
                        onChange={() => change({ ...state, activity: value })}
                      />
                      <span>
                        <strong>{label}</strong>
                      </span>
                    </label>
                  ))}
                </fieldset>
              ) : null}
              {state.step !== "task" ? (
                <button className="button primary full" type="submit">
                  {t.continue}
                </button>
              ) : null}
            </fieldset>
          </form>
          {state.step === "task" ? (
            state.task ? (
              <div className="alert info">
                <p>{t.setupRetryHelp}</p>
                <button
                  className="button primary full"
                  disabled={busy}
                  onClick={() => void finish(state.task!)}
                >
                  {busy ? t.creating : t.setupRetry}
                </button>
              </div>
            ) : (
              <div className="form-stack">
                <button
                  data-testid="record-sale"
                  className="button primary full"
                  disabled={busy}
                  onClick={() => void finish("sale")}
                >
                  {t.recordSale}
                </button>
                <button
                  data-testid="record-expense"
                  className="button secondary full"
                  disabled={busy}
                  onClick={() => void finish("expense")}
                >
                  {t.recordExpense}
                </button>
                <button
                  className="text-button"
                  disabled={busy}
                  onClick={() => void finish("home")}
                >
                  {t.later}
                </button>
              </div>
            )
          ) : null}
          <p className="small-note" role="status">
            {saved ? t.savedOnDevice : t.loading}
          </p>
          <details className="quiet-details">
            <summary>
              {t.cancel === "Cancel" ? "About setup" : "Tungkol sa setup"}
            </summary>
            <p>{t.setupRegistrationNote}</p>
          </details>
          {canCancel && !state.task ? (
            <button
              className="text-button"
              disabled={busy}
              onClick={async () => {
                if (await persist()) onCancel();
              }}
            >
              {t.backHome}
            </button>
          ) : null}
        </div>
      </section>
    );
  },
);
