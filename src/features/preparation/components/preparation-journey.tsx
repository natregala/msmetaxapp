"use client";
import { useJourneyHistory } from "@/components/journey-history";
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import type { EditorPersistenceHandle } from "@/features/ledger/client/editor-recovery";
import { settleEditorWrites } from "@/features/ledger/client/editor-recovery";
import type { Language } from "@/i18n/messages";
import {
  amountToCentavos,
  todayInManila,
} from "@/features/transactions/transaction.rules";
import {
  readPreparation,
  readSnapshot,
  sendReviewedOperation,
  LedgerApiError,
} from "@/features/ledger/client/commands";
import { pendingLedgerStore } from "@/features/ledger/client/pending-command-store";
import {
  SummaryFigures,
  SavedReport,
} from "@/features/ledger/components/period-report";
import { ledgerMessages } from "@/features/ledger/components/ledger-messages";
import { code, errorText } from "@/features/ledger/components/feedback";
import {
  preparationMissing,
  preparationValuesSchema,
  type PreparationProfile,
  type PreparationValues,
} from "../preparation.schema";
import type { LedgerSnapshot } from "@/features/ledger/ledger.types";
import { preparationMessages } from "./preparation-messages";
import styles from "@/features/ledger/components/records.module.css";

type Props = {
  userId: string;
  businessId: string;
  businessName: string;
  language: Language;
};
export const PreparationJourney = forwardRef<EditorPersistenceHandle, Props>(
  function PreparationJourney(
    { userId, businessId, businessName, language }: Props,
    ref,
  ) {
    const t = preparationMessages[language],
      l = ledgerMessages[language],
      today = todayInManila();
    const initialYear = Number(today.slice(0, 4));
    const [values, setValues] = useState<PreparationValues>({
      year: initialYear,
      registration: "unknown",
      taxTreatment: "unknown",
      evidence: "",
      priorIncomeCentavos: null,
      priorTaxPaymentsCentavos: null,
      otherCreditsCentavos: null,
      coverage: "unknown",
      notes: "",
    });
    const [raw, setRaw] = useState({
      priorIncome: "",
      priorTax: "",
      credits: "",
    });
    const [profile, setProfile] = useState<PreparationProfile | null>(null);
    const [baseRevision, setBaseRevision] = useState(0);
    const [profileLoaded, setProfileLoaded] = useState(false);
    const [loadKey, setLoadKey] = useState(0);
    const [step, setStep] = useState(0),
      [loaded, setLoaded] = useState(false);
    const [from, setFrom] = useState(today.slice(0, 4) + "-01-01"),
      [to, setTo] = useState(today);
    const [error, setError] = useState<string | null>(null),
      [localError, setLocalError] = useState(false),
      [saved, setSaved] = useState(false),
      [busy, setBusy] = useState(false);
    const [snapshot, setSnapshot] = useState<LedgerSnapshot | null>(null);
    const [pending, setPending] = useState<Record<string, unknown> | null>(
      null,
    );
    const [rejected, setRejected] = useState(false);
    const [savedEditor, setSavedEditor] = useState<string | null>(null);
    const alive = useRef(true),
      heading = useRef<HTMLHeadingElement>(null);
    const writer = useRef<Promise<boolean>>(Promise.resolve(true));
    useEffect(() => {
      alive.current = true;
      const controller = new AbortController();
      Promise.allSettled([
        readPreparation(businessId, controller.signal),
        pendingLedgerStore().readEditor(userId, businessId, "preparation"),
        pendingLedgerStore().list(userId, businessId),
      ])
        .then(([remoteResult, editorResult, operationResult]) => {
          if (controller.signal.aborted) return;
          const result =
            remoteResult.status === "fulfilled" ? remoteResult.value : null;
          const editor =
            editorResult.status === "fulfilled" ? editorResult.value : null;
          const operations =
            operationResult.status === "fulfilled" ? operationResult.value : [];
          setProfileLoaded(Boolean(result));
          if (result) {
            setProfile(result.profile);
            setBaseRevision(result.profile?.revision ?? 0);
          } else if (remoteResult.status === "rejected")
            setError(code(remoteResult.reason));
          const source = result?.profile?.values;
          if (source) {
            setValues(source);
            setRaw({
              priorIncome: asDecimal(source.priorIncomeCentavos),
              priorTax: asDecimal(source.priorTaxPaymentsCentavos),
              credits: asDecimal(source.otherCreditsCentavos),
            });
          }
          if (editor) {
            try {
              const local = JSON.parse(editor.values ?? "null");
              if (local && preparationValuesSchema.safeParse(local).success) {
                setValues(local);
                setRaw(JSON.parse(editor.raw));
                setFrom(editor.from);
                setTo(editor.to);
                setStep(Number(editor.step) || 0);
                setBaseRevision(Number(editor.profileRevision) || 0);
                if (
                  result &&
                  editor.profileRevision !==
                    String(result.profile?.revision ?? 0)
                )
                  setError("CONFLICT");
              }
            } catch {
              setLocalError(true);
            }
          }
          const operation = operations.find(
            (item) =>
              item.command._endpoint === "/api/preparation/profile" ||
              (item.command._endpoint === "/api/ledger/snapshots" &&
                item.command.preparation),
          );
          if (operation) setPending(operation.command);
          if (editorResult.status === "fulfilled") setLoaded(true);
          else {
            setLocalError(true);
            setError("LOCAL_STORAGE_FAILED");
          }
        })
        .catch((cause) => {
          if (!controller.signal.aborted) {
            setError(code(cause));
          }
        });
      return () => {
        alive.current = false;
        controller.abort();
      };
    }, [userId, businessId, loadKey]);
    const editorSnapshot = JSON.stringify({
      values: JSON.stringify(values),
      raw: JSON.stringify(raw),
      from,
      to,
      step: String(step),
      profileRevision: String(baseRevision),
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
              "preparation",
              JSON.parse(snapshot),
            );
            if (alive.current) {
              setLocalError(false);
              setSavedEditor(snapshot);
            }
            return true;
          } catch {
            if (alive.current) setLocalError(true);
            return false;
          }
        });
      writer.current = save;
      return settleEditorWrites(writer, save);
    }, [loaded, userId, businessId, editorSnapshot]);
    useImperativeHandle(ref, () => ({ persist }), [persist]);
    useEffect(() => {
      if (loaded) void persist();
    }, [loaded, persist]);
    useEffect(() => {
      const flush = () => {
        if (document.visibilityState === "hidden") void persist();
      };
      const warn = (event: BeforeUnloadEvent) => {
        if (loaded && savedEditor !== editorSnapshot) event.preventDefault();
      };
      document.addEventListener("visibilitychange", flush);
      window.addEventListener("beforeunload", warn);
      return () => {
        document.removeEventListener("visibilitychange", flush);
        window.removeEventListener("beforeunload", warn);
      };
    }, [loaded, savedEditor, editorSnapshot, persist]);
    useEffect(() => {
      heading.current?.focus({ preventScroll: true });
    }, [step]);
    useEffect(() => {
      const controller = new AbortController();
      pendingLedgerStore()
        .readEditor(userId, businessId, "preparation-report")
        .then(async (saved) => {
          if (!saved?.id || controller.signal.aborted) return;
          const result = await readSnapshot(
            businessId,
            saved.id,
            controller.signal,
          );
          if (!controller.signal.aborted) setSnapshot(result);
        })
        .catch((cause) => {
          if (!controller.signal.aborted) setError(code(cause));
        });
      return () => controller.abort();
    }, [userId, businessId]);
    function validated() {
      const amount = (text: string) =>
        text.trim() ? amountToCentavos(text) : null;
      return preparationValuesSchema.parse({
        ...values,
        priorIncomeCentavos: amount(raw.priorIncome),
        priorTaxPaymentsCentavos: amount(raw.priorTax),
        otherCreditsCentavos: amount(raw.credits),
      });
    }
    async function save(nextStep: number) {
      if (busy) return;
      if (!profileLoaded) {
        setError("NETWORK_ERROR");
        return;
      }
      setBusy(true);
      setError(null);
      setSaved(false);
      setRejected(false);
      try {
        const current = validated();
        const command = pending ?? {
          _endpoint: "/api/preparation/profile",
          businessId,
          operationId: crypto.randomUUID(),
          expectedRevision: baseRevision,
          values: current,
        };
        await pendingLedgerStore().put(
          userId,
          businessId,
          String(command.operationId),
          command,
        );
        if (alive.current) setPending(command);
        const result = await sendReviewedOperation(command);
        const currentProfile = await readPreparation(businessId);
        await pendingLedgerStore().acknowledge(
          userId,
          businessId,
          String(command.operationId),
        );
        // A replay acknowledges its original revision; render the separately refreshed
        // profile so that an old receipt cannot roll back a later evidence edit.
        const savedProfile =
          currentProfile.profile ?? (result.profile as PreparationProfile);
        if (alive.current) {
          setProfile(savedProfile);
          setBaseRevision(savedProfile.revision);
          setValues(savedProfile.values);
          setRaw({
            priorIncome: asDecimal(savedProfile.values.priorIncomeCentavos),
            priorTax: asDecimal(savedProfile.values.priorTaxPaymentsCentavos),
            credits: asDecimal(savedProfile.values.otherCreditsCentavos),
          });
          setPending(null);
          setSaved(true);
          setStep(nextStep);
          if (snapshot) setSnapshot({ ...snapshot, stale: true });
        }
      } catch (cause) {
        if (alive.current) {
          setError(code(cause));
          setRejected(
            cause instanceof LedgerApiError &&
              [409, 422].includes(cause.status),
          );
        }
      } finally {
        if (alive.current) setBusy(false);
      }
    }
    async function generate() {
      if (busy || (pending && pending._endpoint !== "/api/ledger/snapshots"))
        return;
      setBusy(true);
      setError(null);
      setRejected(false);
      try {
        let command = pending;
        if (!command) {
          const current = validated();
          if (
            from > to ||
            !from.startsWith(String(current.year) + "-") ||
            !to.startsWith(String(current.year) + "-")
          )
            throw new Error("PERIOD_YEAR");
          if (
            !profile ||
            JSON.stringify(profile.values) !== JSON.stringify(current)
          )
            throw new Error("PROFILE_UNSAVED");
          command = {
            _endpoint: "/api/ledger/snapshots",
            businessId,
            operationId: crypto.randomUUID(),
            from,
            to,
            preparation: {
              profileRevision: profile.revision,
              profile: profile.values,
            },
          };
        }
        await pendingLedgerStore().put(
          userId,
          businessId,
          String(command.operationId),
          command,
        );
        if (alive.current) setPending(command);
        const result = (await sendReviewedOperation(command)) as LedgerSnapshot;
        await pendingLedgerStore().saveEditor(
          userId,
          businessId,
          "preparation-report",
          { id: result.id },
        );
        await pendingLedgerStore().acknowledge(
          userId,
          businessId,
          String(command.operationId),
        );
        if (alive.current) {
          setSnapshot(result);
          setPending(null);
        }
      } catch (cause) {
        if (alive.current) {
          setError(code(cause));
          setRejected(
            cause instanceof LedgerApiError &&
              [409, 422].includes(cause.status),
          );
        }
      } finally {
        if (alive.current) setBusy(false);
      }
    }
    const missing = preparationMissing(values);
    async function reviseRejected() {
      if (!pending || !rejected) return;
      setBusy(true);
      try {
        const result = await readPreparation(businessId);
        await pendingLedgerStore().acknowledge(
          userId,
          businessId,
          String(pending.operationId),
        );
        if (alive.current) {
          setProfile(result.profile);
          setBaseRevision(result.profile?.revision ?? 0);
          setPending(null);
          setRejected(false);
          setError(null);
          setSaved(false);
          setStep(0);
        }
      } catch (cause) {
        if (alive.current) setError(code(cause));
      } finally {
        if (alive.current) setBusy(false);
      }
    }
    useJourneyHistory(
      `preparation:${businessId}`,
      { step },
      (next) => {
        if (typeof next.step === "number" && next.step >= 0 && next.step <= 2)
          setStep(next.step);
      },
      async () => !busy && (await persist()),
      loaded,
    );
    const missingText: Record<string, string> = {
      registration: t.registrationMissing,
      taxTreatment: t.treatmentMissing,
      evidence: t.evidenceMissing,
      priorIncomeCentavos: t.priorIncomeMissing,
      priorTaxPaymentsCentavos: t.priorTaxMissing,
      otherCreditsCentavos: t.creditsMissing,
      coverage: t.coverageMissing,
      verifiedRules: t.verifiedRules,
      practitionerReview: t.practitionerReview,
    };
    return (
      <>
        {step > 0 ? (
          <button
            className="text-button journey-back-link"
            disabled={busy || Boolean(pending)}
            onClick={() => setStep(step - 1)}
          >
            ← {t.back}
          </button>
        ) : null}
        <ol className={styles.step + " " + styles.noPrint}>
          <li aria-current={step === 0 ? "step" : undefined}>
            {t.profileStep}
          </li>
          <li aria-current={step === 1 ? "step" : undefined}>
            {t.figuresStep}
          </li>
          <li aria-current={step === 2 ? "step" : undefined}>{t.reviewStep}</li>
        </ol>
        <section className={styles.card + " " + styles.noPrint}>
          {(!loaded || !profileLoaded) && error ? (
            <button
              type="button"
              className="text-button"
              onClick={() => setLoadKey((key) => key + 1)}
            >
              {l.retry}
            </button>
          ) : null}
          {loaded && localError ? (
            <button
              type="button"
              className="text-button"
              onClick={() => void persist()}
            >
              {l.retry}
            </button>
          ) : null}
          <h2 ref={heading} tabIndex={-1}>
            {step === 0
              ? t.profileStep
              : step === 1
                ? t.figuresStep
                : t.reviewStep}
          </h2>
          {!loaded ? <p role="status">{l.loading}</p> : null}
          {error ? (
            <div className={styles.notice + " " + styles.error} role="alert">
              {error === "PERIOD_YEAR"
                ? t.periodYear
                : error === "PROFILE_UNSAVED"
                  ? t.saveProfile
                  : error === "invalid_amount" || error.startsWith("[")
                    ? t.fieldError
                    : errorText(error, l)}
            </div>
          ) : null}
          {saved ? (
            <p role="status" className={styles.notice + " " + styles.success}>
              {t.saved}
            </p>
          ) : null}
          {loaded ? (
            <p className={styles.muted} role="status">
              {localError
                ? t.localFailure
                : savedEditor === editorSnapshot
                  ? t.locallySaved
                  : t.localUnsaved}
            </p>
          ) : null}
          {pending ? (
            <div className={styles.notice}>
              <p>{t.pending}</p>
              <button
                className="button primary"
                disabled={busy}
                onClick={() =>
                  void (pending._endpoint === "/api/ledger/snapshots"
                    ? generate()
                    : save(step))
                }
              >
                {busy ? t.saving : l.retrySave}
              </button>
            </div>
          ) : null}
          {pending && rejected ? (
            <div className={styles.notice}>
              <p>{t.rejected}</p>
              <button
                className="button secondary"
                disabled={busy}
                onClick={() => void reviseRejected()}
              >
                {t.revise}
              </button>
            </div>
          ) : null}
          <fieldset
            disabled={!loaded || busy || Boolean(pending)}
            style={{
              border: 0,
              padding: 0,
              margin: 0,
              display: "grid",
              gap: 18,
            }}
          >
            {step === 0 ? (
              <>
                <label className={styles.field}>
                  {t.year}
                  <input
                    type="number"
                    min={1900}
                    max={2100}
                    value={values.year}
                    onChange={(event) =>
                      setValues({ ...values, year: Number(event.target.value) })
                    }
                  />
                </label>
                <div className={styles.filters}>
                  <label className={styles.field}>
                    {l.from}
                    <input
                      type="date"
                      value={from}
                      onChange={(event) => setFrom(event.target.value)}
                    />
                  </label>
                  <label className={styles.field}>
                    {l.to}
                    <input
                      type="date"
                      value={to}
                      onChange={(event) => setTo(event.target.value)}
                    />
                  </label>
                </div>
                <details className="quiet-details">
                  <summary>
                    {language === "en"
                      ? "Registration & tax details (if known)"
                      : "Detalye ng rehistrasyon at buwis (kung alam)"}
                  </summary>
                  <div className="form-stack">
                    <label className={styles.field}>
                      {t.registration}
                      <select
                        value={values.registration}
                        onChange={(event) =>
                          setValues({
                            ...values,
                            registration: event.target
                              .value as PreparationValues["registration"],
                          })
                        }
                      >
                        <option value="unknown">{t.unknown}</option>
                        <option value="registered">{t.registered}</option>
                        <option value="not_registered">
                          {t.notRegistered}
                        </option>
                      </select>
                    </label>
                    <label className={styles.field}>
                      {t.treatment}
                      <select
                        value={values.taxTreatment}
                        onChange={(event) =>
                          setValues({
                            ...values,
                            taxTreatment: event.target
                              .value as PreparationValues["taxTreatment"],
                          })
                        }
                      >
                        <option value="unknown">{t.unknown}</option>
                        <option value="eight_percent">{t.eightPercent}</option>
                        <option value="graduated">{t.graduated}</option>
                        <option value="other">{t.other}</option>
                      </select>
                      <small>{t.treatmentHelp}</small>
                    </label>
                    <label className={styles.field}>
                      {t.evidence}
                      <textarea
                        value={values.evidence}
                        onChange={(event) =>
                          setValues({ ...values, evidence: event.target.value })
                        }
                        maxLength={1000}
                      />
                      <small>{t.evidenceHelp}</small>
                    </label>
                  </div>
                </details>
                <button
                  type="button"
                  className="button primary"
                  onClick={() => void save(1)}
                >
                  {t.next}
                </button>
              </>
            ) : step === 1 ? (
              <>
                <label className={styles.field}>
                  {t.coverage}
                  <select
                    value={values.coverage}
                    onChange={(event) =>
                      setValues({
                        ...values,
                        coverage: event.target
                          .value as PreparationValues["coverage"],
                      })
                    }
                  >
                    <option value="unknown">{t.unknown}</option>
                    <option value="complete">{t.complete}</option>
                    <option value="partial">{t.partial}</option>
                  </select>
                </label>
                <details className="quiet-details">
                  <summary>
                    {language === "en"
                      ? "Earlier figures & notes (if known)"
                      : "Naunang halaga at mga tala (kung alam)"}
                  </summary>
                  <div className="form-stack">
                    <p className={styles.muted}>{t.amountsHelp}</p>
                    <label className={styles.field}>
                      {t.priorIncome}
                      <input
                        inputMode="decimal"
                        value={raw.priorIncome}
                        onChange={(event) =>
                          setRaw({ ...raw, priorIncome: event.target.value })
                        }
                        placeholder={t.unknown}
                      />
                    </label>
                    <label className={styles.field}>
                      {t.priorTax}
                      <input
                        inputMode="decimal"
                        value={raw.priorTax}
                        onChange={(event) =>
                          setRaw({ ...raw, priorTax: event.target.value })
                        }
                        placeholder={t.unknown}
                      />
                    </label>
                    <label className={styles.field}>
                      {t.credits}
                      <input
                        inputMode="decimal"
                        value={raw.credits}
                        onChange={(event) =>
                          setRaw({ ...raw, credits: event.target.value })
                        }
                        placeholder={t.unknown}
                      />
                    </label>
                    <label className={styles.field}>
                      {t.notes}
                      <textarea
                        value={values.notes}
                        onChange={(event) =>
                          setValues({ ...values, notes: event.target.value })
                        }
                        maxLength={1000}
                      />
                    </label>
                  </div>
                </details>
                <div className={styles.actions}>
                  <button
                    type="button"
                    className="button primary"
                    onClick={() => void save(2)}
                  >
                    {t.next}
                  </button>
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => setStep(0)}
                  >
                    {t.back}
                  </button>
                </div>
              </>
            ) : (
              <>
                <p>{t.unchanged}</p>
                <p>
                  {values.year} · {from} — {to}
                </p>
                <div className={styles.notice}>
                  <p>{t.blocked}</p>
                </div>
                <details className="quiet-details">
                  <summary>
                    {t.unknownItems} · {missing.length}
                  </summary>
                  <ul className={styles.checklist}>
                    {missing.map((item) => (
                      <li key={item}>{missingText[item]}</li>
                    ))}
                  </ul>
                  <h3>{t.nextSteps}</h3>
                  <ol className={styles.checklist}>
                    <li>{t.stepRecords}</li>
                    <li>{t.stepEvidence}</li>
                    <li>{t.stepReview}</li>
                  </ol>
                </details>
                <div className={styles.actions}>
                  <button
                    type="button"
                    className="button primary"
                    onClick={() => void generate()}
                  >
                    {t.generate}
                  </button>
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => setStep(1)}
                  >
                    {t.back}
                  </button>
                </div>
              </>
            )}
          </fieldset>
        </section>
        {snapshot ? (
          <>
            <SummaryFigures summary={snapshot} language={language} />
            <SavedReport
              snapshot={snapshot}
              businessName={businessName}
              language={language}
              onRefresh={async () => {
                try {
                  const result = await readSnapshot(businessId, snapshot.id);
                  if (alive.current) setSnapshot(result);
                } catch (cause) {
                  if (alive.current) setError(code(cause));
                }
              }}
            />
          </>
        ) : null}
      </>
    );
  },
);
function asDecimal(centavos: string | null) {
  if (centavos === null) return "";
  const padded = centavos.padStart(3, "0");
  return padded.slice(0, -2) + "." + padded.slice(-2);
}
