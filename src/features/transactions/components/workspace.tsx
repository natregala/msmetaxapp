"use client";

import Image from "next/image";
import { JourneyHistory } from "@/components/journey-history";
import { isDemoMode } from "@/lib/client/app-fetch";
import { DemoBanner } from "@/features/demo/components/demo-banner";
import type { SetupDraft } from "@/features/businesses/client/setup-drafts";
import type { DocumentRecovery } from "@/features/documents/components/document-workspace";
import {
  offlineContext,
  forgetOfflineContext,
} from "../client/offline-context";
import { RecoveryForm } from "@/features/auth/components/recovery-form";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { ApiError, getSession, signIn, signUp } from "../client/api";
import type { SavedDraft, SessionUser } from "../transaction.types";
import {
  messages,
  errorMessage,
  type Language,
  type Messages,
} from "@/i18n/messages";
import { Icon } from "./icons";
import {
  GuidedWorkspace as SignedInWorkspace,
  type GuidedWorkspaceHandle as SignedWorkspaceHandle,
} from "./guided-workspace";

function codeOf(error: unknown) {
  return error instanceof ApiError ? error.code : "SERVER_ERROR";
}

export function Workspace({ configured }: { configured: boolean }) {
  const [language, setLanguage] = useState<Language>("en");
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(configured);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const sessionGeneration = useRef(0);
  const authChannel = useRef<BroadcastChannel | null>(null);
  const signedWorkspace = useRef<SignedWorkspaceHandle>(null);
  const currentUser = useRef(user);
  // Undefined means this page has not verified a session yet. A verified null
  // must never be replaced by a cached identity during a later network failure.
  const verifiedUserId = useRef<string | null | undefined>(undefined);
  const sessionChangePending = useRef(false);
  const rememberVerifiedUser = useCallback((next: SessionUser | null) => {
    verifiedUserId.current = next?.id ?? null;
    const cached = offlineContext();
    if (!next || (cached && cached.userId !== next.id)) forgetOfflineContext();
  }, []);

  const [recoveries] = useState(() => new Map<string, SavedDraft>());
  const [documentRecoveries] = useState(
    () => new Map<string, DocumentRecovery>(),
  );
  const [setupRecoveries] = useState(() => new Map<string, SetupDraft>());
  const [recoveryWarning, setRecoveryWarning] = useState(false);
  const [sessionChanging, setSessionChanging] = useState(false);
  const t = messages[language];

  useEffect(() => {
    let active = true;
    Promise.resolve().then(() => {
      try {
        const stored = localStorage.getItem("msme-language-v1");
        if (active && (stored === "en" || stored === "tl")) setLanguage(stored);
      } catch {
        /* Language preference persistence is optional. */
      }
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    document.documentElement.lang = language === "tl" ? "fil" : "en";
  }, [language]);

  useEffect(() => {
    if (!configured) return;
    const controller = new AbortController();
    async function refreshSession() {
      // A newer refresh or explicit auth action always wins over an older response.
      const generation = ++sessionGeneration.current;
      try {
        const result = await getSession(controller.signal);
        if (
          controller.signal.aborted ||
          generation !== sessionGeneration.current
        )
          return;
        rememberVerifiedUser(result.user);
        sessionChangePending.current = false;
        const previous = currentUser.current;
        if (previous && previous.id !== result.user?.id) {
          // Keep the form mounted long enough to preserve it, but immediately hide private UI.
          setSessionChanging(true);
          const interrupted = await signedWorkspace.current?.preserve();
          if (interrupted && "state" in interrupted) {
            recoveries.set(
              `${previous.id}:${interrupted.businessId}:${interrupted.state.operationId}`,
              interrupted.state,
            );
            setRecoveryWarning(true);
          } else if (interrupted) {
            setRecoveryWarning(true);
          }
          if (
            controller.signal.aborted ||
            generation !== sessionGeneration.current
          )
            return;
        }
        currentUser.current = result.user;
        setUser((current) =>
          current?.id === result.user?.id ? current : result.user,
        );
        setSessionChanging(false);
        setErrorCode(null);
      } catch (error) {
        if (
          !controller.signal.aborted &&
          generation === sessionGeneration.current
        ) {
          const cached = offlineContext();
          if (
            cached &&
            !sessionChangePending.current &&
            verifiedUserId.current !== null &&
            (verifiedUserId.current === undefined ||
              verifiedUserId.current === cached.userId) &&
            (!currentUser.current ||
              currentUser.current.id === cached.userId) &&
            ((error instanceof ApiError && error.code === "NETWORK_ERROR") ||
              !navigator.onLine)
          ) {
            currentUser.current = currentUser.current ?? {
              id: cached.userId,
              email: null,
            };
            setUser(currentUser.current);
            setSessionChanging(false);
            setErrorCode(null);
          } else setErrorCode(codeOf(error));
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void refreshSession();
    const channel =
      typeof BroadcastChannel === "undefined"
        ? null
        : new BroadcastChannel("msme-auth-v1");
    authChannel.current = channel;
    if (channel)
      channel.onmessage = () => {
        // A known auth change hides private UI immediately, even if this tab
        // cannot reach the session endpoint. Keep it mounted for preservation.
        sessionChangePending.current = true;
        setSessionChanging(true);
        void refreshSession();
      };
    window.addEventListener("focus", refreshSession);
    window.addEventListener("online", refreshSession);
    return () => {
      controller.abort();
      channel?.close();
      authChannel.current = null;
      window.removeEventListener("focus", refreshSession);
      window.removeEventListener("online", refreshSession);
    };
  }, [configured, recoveries, rememberVerifiedUser]);

  function changeLanguage(next: Language) {
    setLanguage(next);
    try {
      localStorage.setItem("msme-language-v1", next);
    } catch {
      /* The current task still changes language. */
    }
  }

  function authenticated(next: SessionUser | null) {
    sessionGeneration.current += 1;
    authChannel.current?.postMessage("session-changed");
    rememberVerifiedUser(next);
    sessionChangePending.current = false;
    currentUser.current = next;
    setUser(next);
    setSessionChanging(false);
    setErrorCode(null);
  }

  return (
    <>
      <a className="skip-link" href="#main">
        {t.skip}
      </a>
      <header className="app-header">
        <div className="header-inner">
          <div className="brand-lockup">
            <Image
              className="brand-logo"
              src="/brand/buwis-folder-compact.svg"
              width={60}
              height={60}
              alt=""
              priority
            />
            <div>
              <p className="brand-name">Kitang-Kita</p>
            </div>
          </div>
          <div className="header-actions">
            <div
              className="language-switch"
              role="group"
              aria-label={t.language}
            >
              <button
                type="button"
                lang="en"
                aria-pressed={language === "en"}
                onClick={() => changeLanguage("en")}
              >
                English
              </button>
              <button
                type="button"
                lang="fil"
                aria-pressed={language === "tl"}
                onClick={() => changeLanguage("tl")}
              >
                Tagalog
              </button>
            </div>
          </div>
        </div>
      </header>
      <main id="main" className="workspace" tabIndex={-1}>
        {isDemoMode() ? <DemoBanner language={language} /> : null}
        {!configured ? (
          <section className="card setup-card">
            <Image
              src="/brand/buwis-folder-primary.svg"
              width={192}
              height={192}
              alt=""
              priority
            />
            <div>
              <p className="eyebrow">{t.yourWorkspace}</p>
              <h1>{t.setupTitle}</h1>
              <p>{t.setupBody}</p>
              <p>{t.setupHelp}</p>
            </div>
          </section>
        ) : loading ? (
          <p className="session-loading" role="status">
            {t.loading}
          </p>
        ) : (
          <>
            {errorCode ? (
              <div className="alert error" role="alert">
                {errorMessage(errorCode, t)}
              </div>
            ) : null}
            {recoveryWarning ? (
              <div className="alert info" role="status">
                {t.interruptedDraft}
              </div>
            ) : null}
            {sessionChanging ? (
              <p className="session-loading" role="status">
                {t.loading}
              </p>
            ) : null}
            <div hidden={sessionChanging}>
              {user ? (
                <JourneyHistory key={user.id}>
                  <SignedInWorkspace
                    key={user.id}
                    ref={signedWorkspace}
                    user={user}
                    t={t}
                    language={language}
                    recoveries={recoveries}
                    setupRecoveries={setupRecoveries}
                    onSetupRecovery={(value) => {
                      if (value) setupRecoveries.set(user.id, value);
                      else setupRecoveries.delete(user.id);
                    }}
                    documentRecoveries={documentRecoveries}
                    onDocumentRecovery={(businessId, value) => {
                      const key = user.id + ":" + businessId;
                      if (value) documentRecoveries.set(key, value);
                      else documentRecoveries.delete(key);
                      if (
                        documentRecoveries.size === 0 &&
                        recoveries.size === 0
                      )
                        setRecoveryWarning(false);
                    }}
                    onRecoverySaved={() => {
                      if (
                        recoveries.size === 0 &&
                        documentRecoveries.size === 0
                      )
                        setRecoveryWarning(false);
                    }}
                    onSignedOut={() => authenticated(null)}
                  />
                </JourneyHistory>
              ) : isDemoMode() ? (
                <p role="status">{t.errorGeneric}</p>
              ) : (
                <AuthForm t={t} onAuthenticated={authenticated} />
              )}
            </div>
          </>
        )}
        <footer className="app-footer">
          <details className="quiet-details">
            <summary>
              {language === "en"
                ? "About your records & privacy"
                : "Tungkol sa tala at privacy"}
            </summary>
            <p>{t.footer}</p>
            <p>{t.privacyNote}</p>
          </details>
        </footer>
      </main>
    </>
  );
}

function AuthForm({
  t,
  onAuthenticated,
}: {
  t: Messages;
  onAuthenticated: (user: SessionUser) => void;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState(false);
  const [recovering, setRecovering] = useState(false);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setErrorCode(null);
    setConfirmation(false);
    try {
      const result = creating
        ? await signUp(email.trim(), password)
        : await signIn(email.trim(), password);
      if (!alive.current) return;
      if (result.user) onAuthenticated(result.user);
      else {
        setConfirmation(true);
        setCreating(false);
        setPassword("");
      }
    } catch (error) {
      if (alive.current) setErrorCode(codeOf(error));
    } finally {
      if (alive.current) setBusy(false);
    }
  }

  if (recovering)
    return (
      <>
        <RecoveryForm language={t.cancel === "Cancel" ? "en" : "tl"} />
        <button className="text-button" onClick={() => setRecovering(false)}>
          {t.cancel}
        </button>
      </>
    );
  return (
    <div className="auth-layout">
      <div className="auth-art">
        <Image
          src="/brand/buwis-folder-primary.svg"
          width={260}
          height={260}
          alt=""
          priority
        />
        <h2>{t.heading}</h2>
        <p>{t.intro}</p>
      </div>
      <section className="auth-form" aria-labelledby="auth-heading">
        <p className="eyebrow">{t.yourWorkspace}</p>
        <h1 id="auth-heading">{t.signInHeading}</h1>
        <p>{t.signInIntro}</p>
        {errorCode ? (
          <div className="alert error" role="alert">
            {errorMessage(errorCode, t)}
          </div>
        ) : null}
        {confirmation ? (
          <div className="alert success" role="status">
            {t.checkEmail}
          </div>
        ) : null}
        <form className="form-stack" onSubmit={submit}>
          <div className="field">
            <label htmlFor="email">{t.email}</label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              maxLength={254}
              required
              disabled={busy}
            />
          </div>
          <div className="field">
            <label htmlFor="password">{t.password}</label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete={creating ? "new-password" : "current-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={creating ? 8 : 1}
              maxLength={128}
              required
              disabled={busy}
              aria-describedby={creating ? "password-help" : undefined}
            />
            {creating ? (
              <p id="password-help" className="field-hint">
                {t.signUpHelp}
              </p>
            ) : null}
          </div>
          <button className="button primary full" type="submit" disabled={busy}>
            {busy ? t.loading : creating ? t.signUp : t.signIn}
            <Icon name="arrow" />
          </button>
        </form>
        <button
          className="text-button"
          type="button"
          disabled={busy}
          onClick={() => {
            setCreating(!creating);
            setErrorCode(null);
            setConfirmation(false);
          }}
        >
          {creating ? t.accountExisting : t.accountNew}
        </button>
        <button
          className="text-button"
          type="button"
          disabled={busy}
          onClick={() => setRecovering(true)}
        >
          {t.cancel === "Cancel"
            ? "Forgot password?"
            : "Nakalimutan ang password?"}
        </button>
        <p className="small-note">{t.signInHelp}</p>
      </section>
    </div>
  );
}
