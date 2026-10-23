"use client";

import dynamic from "next/dynamic";
import { useJourneyHistory } from "@/components/journey-history";
import { isDemoMode } from "@/lib/client/app-fetch";
import type {
  DocumentRecovery,
  DocumentWorkspaceHandle,
} from "@/features/documents/components/document-workspace";
import { resumeReviewedDrafts } from "../client/resume-submissions";
import { listLedger, LedgerApiError } from "@/features/ledger/client/commands";
import type { RecordsWorkspaceHandle } from "@/features/ledger/components/records-workspace";
const RecordsWorkspace = dynamic(() =>
  import("@/features/ledger/components/records-workspace").then(
    (module) => module.RecordsWorkspace,
  ),
);
const DocumentWorkspace = dynamic(() =>
  import("@/features/documents/components/document-workspace").then(
    (module) => module.DocumentWorkspace,
  ),
);
import {
  offlineContext,
  rememberOfflineContext,
} from "../client/offline-context";
import type { SetupDraft } from "@/features/businesses/client/setup-drafts";
import {
  SetupJourney,
  type SetupJourneyHandle,
} from "@/features/businesses/components/setup-journey";
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type FormEvent,
} from "react";
import {
  ApiError,
  listBusinesses,
  renameBusiness,
  signOut,
} from "../client/api";
import { deleteDraft, DraftStorageError, listDrafts } from "../client/drafts";
import type {
  AcceptedTransaction,
  Business,
  SavedDraft,
  SessionUser,
} from "../transaction.types";
import { errorMessage, type Language, type Messages } from "@/i18n/messages";
import { Icon } from "./icons";
import { RecordList } from "./record-list";
import {
  TransactionForm,
  type TransactionFormHandle,
} from "./transaction-form";

export type GuidedWorkspaceHandle = {
  preserve: () => Promise<
    | { businessId: string; state: SavedDraft }
    | { businessId: string; document: DocumentRecovery }
    | { businessId: string; ledger: true }
    | { setup: SetupDraft }
    | null
  >;
};
type Props = {
  user: SessionUser;
  t: Messages;
  language: Language;
  onSignedOut: () => void;
  recoveries: Map<string, SavedDraft>;
  documentRecoveries: Map<string, DocumentRecovery>;
  setupRecoveries: Map<string, SetupDraft>;
  onSetupRecovery: (value: SetupDraft | null) => void;
  onDocumentRecovery: (
    businessId: string,
    value: DocumentRecovery | null,
  ) => void;
  onRecoverySaved: () => void;
};
type Task = "sale" | "expense" | "owner_contribution" | "owner_withdrawal";
type View =
  | "home"
  | Task
  | "resume"
  | "setup"
  | "rename"
  | "records"
  | "summary"
  | "preparation"
  | "documents";

function codeOf(error: unknown) {
  return error instanceof ApiError ||
    error instanceof DraftStorageError ||
    error instanceof LedgerApiError
    ? error.code
    : "SERVER_ERROR";
}

function preferredBusinessId(userId: string, businesses: Business[]) {
  try {
    const preferred = localStorage.getItem(`msme-business-v1:${userId}`);
    // Restore only an ID returned by the current account's owned-business query.
    if (businesses.some((business) => business.id === preferred))
      return preferred!;
  } catch {
    // An unavailable preference store must not block the workspace.
  }
  return businesses[0]?.id ?? "";
}

function rememberBusiness(userId: string, businessId: string) {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      businessId,
    )
  )
    return;
  try {
    localStorage.setItem(`msme-business-v1:${userId}`, businessId);
  } catch {
    // The current selection still works when preference persistence is unavailable.
  }
}

export const GuidedWorkspace = forwardRef<GuidedWorkspaceHandle, Props>(
  function GuidedWorkspace(
    {
      user,
      t,
      language,
      onSignedOut,
      recoveries,
      onRecoverySaved,
      documentRecoveries,
      onDocumentRecovery,
      setupRecoveries,
      onSetupRecovery,
    },
    ref,
  ) {
    const [businesses, setBusinesses] = useState<Business[]>([]);
    const [businessId, setBusinessId] = useState("");
    const [view, setView] = useState<View>("home");
    const [entryKind, setEntryKind] = useState<Task>("sale");
    const [loading, setLoading] = useState(true);
    const [online, setOnline] = useState(true);
    const [errorCode, setErrorCode] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [records, setRecords] = useState<AcceptedTransaction[]>([]);
    const [recordError, setRecordError] = useState<string | null>(null);
    const [recordLoading, setRecordLoading] = useState(false);
    const [drafts, setDrafts] = useState<SavedDraft[]>([]);
    const [selectedDraftId, setSelectedDraftId] = useState<
      string | undefined
    >();
    const [sourceDocumentId, setSourceDocumentId] = useState<
      string | undefined
    >();
    const [recordId, setRecordId] = useState<string | undefined>();
    const [draftLoading, setDraftLoading] = useState(true);
    const [draftError, setDraftError] = useState<string | null>(null);
    const [refreshKey, setRefreshKey] = useState(0);
    const [businessLoadKey, setBusinessLoadKey] = useState(0);
    const [setupKey, setSetupKey] = useState(0);
    const alive = useRef(true);
    const form = useRef<TransactionFormHandle>(null);
    const documentForm = useRef<DocumentWorkspaceHandle>(null);
    const setupForm = useRef<SetupJourneyHandle>(null);
    const recordsForm = useRef<RecordsWorkspaceHandle>(null);
    const menu = useRef<HTMLDetailsElement>(null);
    const completedDrafts = useRef(new Set<string>());
    const currentBusiness = businesses.find((item) => item.id === businessId);
    const inEntry = view === "sale" || view === "expense" || view === "resume";

    useJourneyHistory(
      "workspace",
      { view, businessId, entryKind, draftId: selectedDraftId ?? null },
      (next) => {
        if (
          next.businessId &&
          !businesses.some((item) => item.id === next.businessId)
        )
          return;
        const finished =
          typeof next.draftId === "string" &&
          completedDrafts.current.has(next.draftId);
        setView(finished ? "home" : (next.view as View));
        setBusinessId(String(next.businessId));
        setEntryKind(next.entryKind as Task);
        setSelectedDraftId(
          finished
            ? undefined
            : typeof next.draftId === "string"
              ? next.draftId
              : undefined,
        );
        setRefreshKey((key) => key + 1);
        closeMenu();
      },
      async () => {
        if (busy) return false;
        if (form.current) return form.current.persist();
        if (documentForm.current) return documentForm.current.persist();
        if (recordsForm.current) return recordsForm.current.persist();
        if (setupForm.current) return setupForm.current.persist();
        return true;
      },
      !loading,
    );

    useEffect(() => {
      if (view === "home")
        document
          .getElementById("home-question")
          ?.focus({ preventScroll: true });
      window.scrollTo({ top: 0, behavior: "instant" });
    }, [view]);

    useEffect(() => {
      const update = () => setOnline(isDemoMode() || navigator.onLine);
      update();
      window.addEventListener("online", update);
      window.addEventListener("offline", update);
      return () => {
        window.removeEventListener("online", update);
        window.removeEventListener("offline", update);
      };
    }, []);

    useImperativeHandle(ref, () => ({
      preserve: async () => {
        if (recordsForm.current && !(await recordsForm.current.persist()))
          return { businessId, ledger: true };
        if (setupForm.current && !(await setupForm.current.persist())) {
          const setup = setupForm.current.snapshot();
          if (setup) return { setup };
        }
        if (documentForm.current && !(await documentForm.current.persist())) {
          const document = documentRecoveries.get(user.id + ":" + businessId);
          if (document) return { businessId, document };
        }
        const state = form.current?.snapshot();
        if (!state || !businessId) return null;
        const saved = await form.current?.persist();
        return saved
          ? null
          : { businessId, state: form.current?.snapshot() ?? state };
      },
    }));

    useEffect(() => {
      alive.current = true;
      const controller = new AbortController();
      listBusinesses(controller.signal)
        .then((result) => {
          if (controller.signal.aborted) return;
          setBusinesses(result);
          rememberOfflineContext(user.id, result);
          setBusinessId(preferredBusinessId(user.id, result));
          setView(result.length ? "home" : "setup");
        })
        .catch((error) => {
          if (!controller.signal.aborted) {
            const cached = offlineContext();
            if (cached?.userId === user.id && !navigator.onLine) {
              setBusinesses(cached.businesses);
              setBusinessId(preferredBusinessId(user.id, cached.businesses));
              setView("home");
            } else setErrorCode(codeOf(error));
          }
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
      return () => {
        alive.current = false;
        controller.abort();
      };
    }, [user.id, businessLoadKey]);

    useEffect(() => {
      if (!businessId) return;
      const controller = new AbortController();
      Promise.resolve().then(() => {
        if (controller.signal.aborted) return;
        setRecordLoading(true);
        setRecordError(null);
        setRecords([]);
        setDraftLoading(true);
        setDraftError(null);
        setDrafts([]);
      });
      listLedger(
        businessId,
        {
          from: "",
          to: "",
          kind: "",
          payment: "",
          status: "active",
          search: "",
        },
        1,
        controller.signal,
      )
        .then((result) => {
          if (!controller.signal.aborted)
            setRecords(
              result.records.map((row) => ({
                ...row,
                currency: "PHP" as const,
                reviewStatus: "confirmed" as const,
              })),
            );
        })
        .catch((error) => {
          if (!controller.signal.aborted) setRecordError(codeOf(error));
        })
        .finally(() => {
          if (!controller.signal.aborted) setRecordLoading(false);
        });
      listDrafts(user.id, businessId)
        .then((saved) => {
          if (!controller.signal.aborted)
            setDrafts(
              [
                ...[...recoveries.entries()]
                  .filter(([key]) =>
                    key.startsWith(`${user.id}:${businessId}:`),
                  )
                  .map(([, value]) => value),
                ...saved,
              ].filter(
                (value, index, all) =>
                  all.findIndex(
                    (item) => item.operationId === value.operationId,
                  ) === index,
              ),
            );
        })
        .catch((error) => {
          if (!controller.signal.aborted) {
            setDrafts(
              [...recoveries.entries()]
                .filter(([key]) => key.startsWith(`${user.id}:${businessId}:`))
                .map(([, value]) => value),
            );
            setDraftError(codeOf(error));
          }
        })
        .finally(() => {
          if (!controller.signal.aborted) setDraftLoading(false);
        });
      return () => controller.abort();
    }, [businessId, refreshKey, user.id, recoveries]);

    useEffect(() => {
      if (businesses.length) rememberOfflineContext(user.id, businesses);
    }, [businesses, user.id]);

    useEffect(() => {
      if (!businessId) return;
      const controller = new AbortController();
      let running = false;
      async function resume() {
        if (running || !navigator.onLine || controller.signal.aborted) return;
        running = true;
        try {
          const count = await resumeReviewedDrafts(
            user.id,
            businessId,
            controller.signal,
          );
          if (count && !controller.signal.aborted)
            setRefreshKey((value) => value + 1);
        } catch {
          /* Original drafts stay untouched. */
        } finally {
          running = false;
        }
      }
      const visible = () => {
        if (document.visibilityState === "visible") void resume();
      };
      void resume();
      window.addEventListener("online", resume);
      document.addEventListener("visibilitychange", visible);
      return () => {
        controller.abort();
        window.removeEventListener("online", resume);
        document.removeEventListener("visibilitychange", visible);
      };
    }, [user.id, businessId]);

    function closeMenu() {
      if (menu.current) menu.current.open = false;
    }

    async function navigate(next: View, nextBusiness = businessId) {
      if (busy) return;
      setBusy(true);
      const saved = form.current
        ? await form.current.persist()
        : documentForm.current
          ? await documentForm.current.persist()
          : recordsForm.current
            ? await recordsForm.current.persist()
            : setupForm.current
              ? await setupForm.current.persist()
              : true;
      if (alive.current) {
        if (saved) {
          if (nextBusiness !== businessId) {
            setRecords([]);
            setRecordError(null);
            setRecordLoading(true);
            setDrafts([]);
            setDraftError(null);
            setDraftLoading(true);
          }
          closeMenu();
          setView(next);
          setBusinessId(nextBusiness);
          rememberBusiness(user.id, nextBusiness);
          setErrorCode(null);
          if (next === "setup") setSetupKey((key) => key + 1);
          if (next === "home") setRefreshKey((key) => key + 1);
        }
        setBusy(false);
      }
    }

    function startTask(task: Task) {
      if (draftLoading || busy) return;
      setEntryKind(task);
      setSelectedDraftId(crypto.randomUUID());
      setView(task === "sale" || task === "expense" ? task : "resume");
    }

    function resumeDraft(draft: SavedDraft) {
      if (busy) return;
      setEntryKind(
        draft.draft.kind === "expense"
          ? "expense"
          : draft.draft.kind === "owner_contribution"
            ? "owner_contribution"
            : draft.draft.kind === "owner_withdrawal"
              ? "owner_withdrawal"
              : "sale",
      );
      setSelectedDraftId(draft.operationId);
      setView("resume");
    }

    async function discardDraft(draft: SavedDraft) {
      if (draft.pendingCommand || draft.pendingLedgerCommand || busy) return;
      setBusy(true);
      setDraftError(null);
      try {
        await deleteDraft(user.id, businessId, draft.operationId, draft);
        if (alive.current) {
          recoveries.delete(`${user.id}:${businessId}:${draft.operationId}`);
          onRecoverySaved();
          setDrafts((items) =>
            items.filter((item) => item.operationId !== draft.operationId),
          );
        }
      } catch (error) {
        if (alive.current) setDraftError(codeOf(error));
      } finally {
        if (alive.current) setBusy(false);
      }
    }

    function retryBusinessLoad() {
      setLoading(true);
      setErrorCode(null);
      setBusinessLoadKey((key) => key + 1);
    }

    async function leave() {
      if (busy) return;
      setBusy(true);
      setErrorCode(null);
      try {
        if (form.current && !(await form.current.persist())) return;
        if (documentForm.current && !(await documentForm.current.persist()))
          return;
        if (setupForm.current && !(await setupForm.current.persist())) return;
        if (recordsForm.current && !(await recordsForm.current.persist()))
          return;
        await signOut();
        if (alive.current) onSignedOut();
      } catch (error) {
        if (alive.current) setErrorCode(codeOf(error));
      } finally {
        if (alive.current) setBusy(false);
      }
    }

    function finishSetup(business: Business, task: Task | "home") {
      rememberBusiness(user.id, business.id);
      setBusinesses((items) =>
        items.some((item) => item.id === business.id)
          ? items.map((item) => (item.id === business.id ? business : item))
          : [...items, business],
      );
      setBusinessId(business.id);
      setView(task);
      setDrafts([]);
      setErrorCode(null);
      if (task !== "home") {
        setEntryKind(task);
        setSelectedDraftId(crypto.randomUUID());
      }
    }

    function updateBusiness(business: Business) {
      setBusinesses((items) =>
        items.map((item) => (item.id === business.id ? business : item)),
      );
    }

    if (loading)
      return (
        <p className="session-loading" role="status">
          {t.loading}
        </p>
      );

    return (
      <div className="guided-workspace">
        <div className="workspace-toolbar">
          {view === "home" && currentBusiness ? (
            <p className="current-business">
              <span>{t.currentBusiness}</span>
              <strong>{currentBusiness.name}</strong>
            </p>
          ) : (
            <div className="toolbar-context">
              {view === "setup" ? t.setupProgress : currentBusiness?.name}
            </div>
          )}
          <details
            ref={menu}
            className="account-menu"
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                closeMenu();
                menu.current?.querySelector("summary")?.focus();
              }
            }}
          >
            <summary data-testid="account-menu">
              <Icon name="shop" />
              <span>{t.accountMenu}</span>
              <span className="menu-chevron" aria-hidden="true">
                ⌄
              </span>
            </summary>
            <div className="account-menu-panel">
              {!isDemoMode() ? (
                <p className="account-email">
                  <span>{t.signedInAs}</span>
                  {user.email}
                </p>
              ) : null}
              {businesses.length ? (
                <>
                  <div className="field">
                    <label htmlFor="account-business">{t.chooseBusiness}</label>
                    <select
                      id="account-business"
                      value={businessId}
                      disabled={busy}
                      onChange={(event) =>
                        void navigate("home", event.target.value)
                      }
                    >
                      {businesses.map((business) => (
                        <option key={business.id} value={business.id}>
                          {business.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <button
                    type="button"
                    className="menu-action"
                    disabled={busy}
                    onClick={() => void navigate("rename")}
                  >
                    {t.renameBusiness}
                  </button>
                  <button
                    type="button"
                    className="menu-action"
                    disabled={busy}
                    onClick={() => void navigate("setup")}
                  >
                    {t.newBusiness}
                  </button>
                </>
              ) : null}
              {!isDemoMode() ? (
                <button
                  type="button"
                  className="menu-action"
                  disabled={busy}
                  onClick={() => void leave()}
                >
                  <Icon name="exit" />
                  {t.signOut}
                </button>
              ) : null}
            </div>
          </details>
        </div>
        {errorCode ? (
          <div className="alert error" role="alert">
            <p>{errorMessage(errorCode, t)}</p>
            {!currentBusiness && view !== "setup" ? (
              <button
                className="text-button"
                type="button"
                onClick={retryBusinessLoad}
              >
                {t.retry}
              </button>
            ) : null}
          </div>
        ) : null}
        {view === "setup" ? (
          <SetupJourney
            ref={setupForm}
            recovery={setupRecoveries.get(user.id)}
            onRecoveryChange={onSetupRecovery}
            key={setupKey}
            userId={user.id}
            t={t}
            canCancel={businesses.length > 0}
            onCancel={() => void navigate("home")}
            onComplete={finishSetup}
          />
        ) : view === "rename" && currentBusiness ? (
          <RenameBusiness
            business={currentBusiness}
            t={t}
            onUpdated={updateBusiness}
            onHome={() => void navigate("home")}
          />
        ) : (view === "records" ||
            view === "summary" ||
            view === "preparation") &&
          currentBusiness ? (
          <RecordsWorkspace
            ref={recordsForm}
            key={`${user.id}:${businessId}`}
            userId={user.id}
            businessId={businessId}
            businessName={currentBusiness.name}
            language={language}
            initialView={view}
            initialRecordId={recordId}
            onDocument={(id) => {
              setSourceDocumentId(id);
              void navigate("documents");
            }}
            onHome={() => void navigate("home")}
          />
        ) : view === "documents" && currentBusiness ? (
          <DocumentWorkspace
            initialDocumentId={
              documentRecoveries.has(user.id + ":" + businessId)
                ? undefined
                : sourceDocumentId
            }
            ref={documentForm}
            recovery={documentRecoveries.get(user.id + ":" + businessId)}
            onRecoveryChange={(value) => onDocumentRecovery(businessId, value)}
            key={`${user.id}:${businessId}`}
            userId={user.id}
            businessId={businessId}
            language={language}
            onHome={() => void navigate("home")}
            onAccepted={() => setRefreshKey((x) => x + 1)}
          />
        ) : inEntry && currentBusiness ? (
          <div className="focused-entry">
            <TransactionForm
              key={`${user.id}:${businessId}:${view}:${selectedDraftId}`}
              draftId={selectedDraftId}
              ref={form}
              userId={user.id}
              businessId={businessId}
              t={t}
              language={language}
              businessActivity={currentBusiness.activity}
              initialKind={entryKind}
              onViewRecord={(id) => {
                setRecordId(id);
                void navigate("records");
              }}
              onHome={() => {
                setView("home");
                setRefreshKey((key) => key + 1);
              }}
              onNewEntry={() => startTask(entryKind)}
              onAccepted={(id) => {
                completedDrafts.current.add(id);
                setRefreshKey((key) => key + 1);
              }}
              disabled={busy}
              recovery={recoveries.get(
                `${user.id}:${businessId}:${selectedDraftId}`,
              )}
              onRecoverySaved={() => {
                recoveries.delete(
                  `${user.id}:${businessId}:${selectedDraftId}`,
                );
                onRecoverySaved();
              }}
            />
          </div>
        ) : currentBusiness ? (
          <section className="task-home" aria-labelledby="home-question">
            <div className="home-intro">
              <h1 id="home-question" tabIndex={-1}>
                {t.homeQuestion}
              </h1>
            </div>
            {drafts.length > 0 ? (
              <details className="drafts-disclosure" open={drafts.length === 1}>
                <summary>
                  {language === "en"
                    ? "Continue unfinished work"
                    : "Ituloy ang hindi pa tapos"}{" "}
                  · {drafts.length}
                </summary>
                {drafts.map((draft) => (
                  <div className="resume-card" key={draft.operationId}>
                    <div className="resume-symbol">
                      <Icon name="record" />
                    </div>
                    <div>
                      <h2>{t.unfinishedHeading}</h2>
                      <p>
                        {t[draft.draft.kind]} · {draft.draft.amount || "—"} PHP
                        · {draft.draft.businessDate}
                      </p>
                      {draft.draft.description ? (
                        <p>{draft.draft.description}</p>
                      ) : null}
                      <p>
                        {draft.pendingCommand || draft.pendingLedgerCommand
                          ? t.retryHelp
                          : t.unfinishedHelp}
                      </p>
                      <button
                        className="text-button"
                        type="button"
                        data-testid="resume-draft"
                        disabled={busy}
                        onClick={() => resumeDraft(draft)}
                      >
                        {t.resumeDraft}
                        <Icon name="arrow" />
                      </button>
                      {!draft.pendingCommand && !draft.pendingLedgerCommand ? (
                        <details className="discard-draft">
                          <summary>{t.discardDraftOption}</summary>
                          <p>{t.discardDraftWarning}</p>
                          <button
                            className="text-button danger-text"
                            type="button"
                            disabled={busy}
                            data-testid="discard-draft"
                            onClick={() => void discardDraft(draft)}
                          >
                            {busy ? t.loading : t.discardDraft}
                          </button>
                        </details>
                      ) : null}
                    </div>
                  </div>
                ))}
              </details>
            ) : null}
            {draftError ? (
              <div className="alert error" role="alert">
                <p>{errorMessage(draftError, t)}</p>
                <button
                  type="button"
                  className="text-button"
                  onClick={() => setRefreshKey((key) => key + 1)}
                >
                  {t.retry}
                </button>
              </div>
            ) : null}
            <TaskChoices
              t={t}
              disabled={busy || draftLoading || Boolean(draftError)}
              onChoose={startTask}
            />
            {draftLoading ? (
              <p className="home-note" role="status">
                {t.draftLoading}
              </p>
            ) : null}
            {!online ? (
              <p className="alert info" role="status">
                {language === "en"
                  ? "You’re offline. You can create device drafts. Reconnect for saved records, photos, and reports."
                  : "Walang koneksyon. Maaari kang gumawa ng draft sa device. Kumonekta para sa naka-save na tala, larawan, at ulat."}
              </p>
            ) : null}
            <div className="home-secondary-actions">
              <button
                className="button secondary full"
                type="button"
                disabled={!online}
                onClick={() => {
                  setSourceDocumentId(undefined);
                  void navigate("documents");
                }}
              >
                {language === "en"
                  ? "Photograph a notebook"
                  : "Kunan ang kuwaderno"}
              </button>
              <nav
                aria-label={
                  language === "en"
                    ? "Business records tools"
                    : "Mga gamit para sa tala"
                }
                className="home-tools"
              >
                <button
                  type="button"
                  className="button secondary"
                  disabled={!online}
                  onClick={() => {
                    setRecordId(undefined);
                    void navigate("records");
                  }}
                >
                  {language === "en" ? "Find records" : "Hanapin ang mga tala"}
                </button>
                <button
                  type="button"
                  className="button secondary"
                  disabled={!online}
                  onClick={() => void navigate("summary")}
                >
                  {language === "en"
                    ? "Understand a period"
                    : "Suriin ang panahon"}
                </button>
                <button
                  type="button"
                  className="button secondary"
                  disabled={!online}
                  onClick={() => void navigate("preparation")}
                >
                  {language === "en"
                    ? "Prepare records"
                    : "Ihanda ang mga tala"}
                </button>
              </nav>
              <details>
                <summary>
                  {language === "en" ? "Owner money" : "Pera ng may-ari"}
                </summary>
                <p className="small-note">
                  {language === "en"
                    ? "Keep your own money separate from sales and business expenses."
                    : "Ihiwalay ang sariling pera sa benta at gastos ng negosyo."}
                </p>
                <div className="home-tools">
                  <button
                    type="button"
                    className="button secondary"
                    onClick={() => startTask("owner_contribution")}
                  >
                    {t.owner_contribution}
                  </button>
                  <button
                    type="button"
                    className="button secondary"
                    onClick={() => startTask("owner_withdrawal")}
                  >
                    {t.owner_withdrawal}
                  </button>
                </div>
              </details>
            </div>
            {recordError && online ? (
              <div className="alert error home-record-error" role="alert">
                <p>{errorMessage(recordError, t)}</p>
                <button
                  className="text-button"
                  type="button"
                  onClick={() => setRefreshKey((key) => key + 1)}
                >
                  {t.reload}
                </button>
              </div>
            ) : records.length ? (
              <details className="home-records quiet-details">
                <summary>{t.recentRecords}</summary>
                <RecordList
                  records={records}
                  loading={recordLoading}
                  error={null}
                  onRefresh={() => setRefreshKey((key) => key + 1)}
                  t={t}
                  language={language}
                />
              </details>
            ) : null}
          </section>
        ) : null}
      </div>
    );
  },
);

function TaskChoices({
  t,
  disabled,
  onChoose,
}: {
  t: Messages;
  disabled?: boolean;
  onChoose: (task: Task) => void;
}) {
  return (
    <div className="task-choices">
      <button
        type="button"
        className="task-choice sale-choice"
        data-testid="record-sale"
        disabled={disabled}
        onClick={() => onChoose("sale")}
      >
        <span>
          <strong>{t.recordSale}</strong>
        </span>
        <Icon name="arrow" />
      </button>
      <button
        type="button"
        className="task-choice expense-choice"
        data-testid="record-expense"
        disabled={disabled}
        onClick={() => onChoose("expense")}
      >
        <span>
          <strong>{t.recordExpense}</strong>
        </span>
        <Icon name="arrow" />
      </button>
    </div>
  );
}

function RenameBusiness({
  business,
  t,
  onUpdated,
  onHome,
}: {
  business: Business;
  t: Messages;
  onUpdated: (business: Business) => void;
  onHome: () => void;
}) {
  const [name, setName] = useState(business.name);
  const [busy, setBusy] = useState(false);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy || !name.trim()) return;
    setBusy(true);
    setErrorCode(null);
    setSaved(false);
    try {
      const changed = await renameBusiness(
        business.id,
        name.trim(),
        business.profileRevision,
      );
      if (alive.current) {
        onUpdated(changed);
        setSaved(true);
      }
    } catch (error) {
      if (alive.current) setErrorCode(codeOf(error));
    } finally {
      if (alive.current) setBusy(false);
    }
  }
  async function refresh() {
    setBusy(true);
    try {
      const result = await listBusinesses();
      const fresh = result.find((item) => item.id === business.id);
      if (alive.current && fresh) {
        onUpdated(fresh);
        setErrorCode(null);
      }
    } catch (error) {
      if (alive.current) setErrorCode(codeOf(error));
    } finally {
      if (alive.current) setBusy(false);
    }
  }
  return (
    <section className="guided-setup journey-card">
      <h1>{t.renameQuestion}</h1>
      <p className="journey-intro">{t.renameHelp}</p>
      {errorCode ? (
        <div className="alert error" role="alert">
          <p>
            {errorCode === "REVISION_CONFLICT" || errorCode === "CONFLICT"
              ? t.renameConflict
              : errorMessage(errorCode, t)}
          </p>
          <button
            type="button"
            className="text-button"
            disabled={busy}
            onClick={() => void refresh()}
          >
            {t.refreshBusiness}
          </button>
        </div>
      ) : null}
      {saved ? (
        <div className="alert success" role="status">
          {t.nameSaved}
        </div>
      ) : null}
      <form className="form-stack" onSubmit={submit}>
        <div className="field">
          <label htmlFor="rename-business">{t.businessName}</label>
          <input
            id="rename-business"
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              setSaved(false);
            }}
            maxLength={100}
            required
            disabled={busy}
          />
        </div>
        <button className="button primary full" type="submit" disabled={busy}>
          {busy ? t.loading : t.saveName}
        </button>
      </form>
      <div className="journey-back">
        <button
          className="text-button"
          type="button"
          disabled={busy}
          onClick={onHome}
        >
          {t.backHome}
        </button>
      </div>
    </section>
  );
}
