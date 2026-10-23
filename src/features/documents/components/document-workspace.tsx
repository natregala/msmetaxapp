"use client";
import { useJourneyHistory } from "@/components/journey-history";
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type ChangeEvent,
} from "react";
import type { Language } from "@/i18n/messages";
import {
  formatPHP,
  todayInManila,
  amountToCentavos,
} from "@/features/transactions/transaction.rules";
import { documentMessages } from "../document-messages";
import { matchingProposalIds } from "../extraction.rules";
import {
  validateProposal,
  MAX_IMAGE_BYTES,
  type DocumentCommand,
  type DocumentDetail,
  type DocumentProposal,
  type SourceDocument,
} from "../document.schema";
import {
  documentDrafts,
  type CaptureDraft,
  type DocumentEdits,
} from "../client/document-drafts";
import {
  DocumentError,
  documentImageUrl,
  listSourceDocuments,
  readSourceDocument,
  submitDocument,
  uploadDocumentImage,
} from "../client/document-api";
import styles from "./documents.module.css";

export type DocumentRecovery = {
  capture: CaptureDraft | null;
  edits: DocumentEdits | null;
};
export type DocumentWorkspaceHandle = { persist: () => Promise<boolean> };
type Props = {
  userId: string;
  businessId: string;
  language: Language;
  onHome: () => void;
  onAccepted?: () => void;
  initialDocumentId?: string;
  recovery?: DocumentRecovery;
  onRecoveryChange?: (value: DocumentRecovery | null) => void;
};
export const DocumentWorkspace = forwardRef<DocumentWorkspaceHandle, Props>(
  function DocumentWorkspace(
    {
      userId,
      businessId,
      language,
      onHome,
      onAccepted,
      initialDocumentId,
      recovery,
      onRecoveryChange,
    },
    ref,
  ) {
    const t = documentMessages[language];
    const [documents, setDocuments] = useState<SourceDocument[]>([]);
    const [detail, setDetail] = useState<DocumentDetail | null>(null);
    const [capture, setCapture] = useState<CaptureDraft | null>(null);
    const [preview, setPreview] = useState<string | null>(null);
    const [sourceType, setSourceType] = useState<
      "sales_notebook" | "expense_notebook"
    >("sales_notebook");
    const [rows, setRows] = useState<DocumentProposal[]>([]);
    const [index, setIndex] = useState(0);
    const [busy, setBusy] = useState(false);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [status, setStatus] = useState<string | null>(null);
    const [ocr, setOcr] = useState(false);
    const [consent, setConsent] = useState(false);
    const [pending, setPending] = useState<DocumentCommand | null>(null);
    const [processing, setProcessing] = useState(false);
    const [reviewing, setReviewing] = useState(false);
    const [compared, setCompared] = useState(false);
    const [duplicatesChecked, setDuplicatesChecked] = useState(false);
    const [conflict, setConflict] = useState<DocumentDetail | null>(null);
    const [localFailure, setLocalFailure] = useState(false);
    const alive = useRef(true);
    const controller = useRef<AbortController | null>(null);
    const writer = useRef<Promise<boolean>>(Promise.resolve(true));
    const writeEpoch = useRef(0);
    const savedEdits = useRef<DocumentEdits | null>(null);
    const conflictEdits = useRef<DocumentEdits | null>(null);
    const latestCapture = useRef<CaptureDraft | null>(null);
    const latestRows = useRef<DocumentProposal[]>([]);
    const latestDetail = useRef<DocumentDetail | null>(null);
    const initialRecovery = useRef(recovery);
    const row = rows[index];
    const acceptedIds = new Set(
      detail?.acceptedRows.map((item) => item.rowId) ?? [],
    );
    const accepted = Boolean(row && acceptedIds.has(row.id));
    const locked = busy || Boolean(pending) || Boolean(conflict);

    useEffect(() => {
      alive.current = true;
      const abort = new AbortController();
      controller.current = abort;
      Promise.allSettled([
        listSourceDocuments(businessId, abort.signal),
        documentDrafts().loadCapture(userId, businessId),
      ])
        .then(async ([result, captureResult]) => {
          if (abort.signal.aborted) return;
          if (result.status === "fulfilled") {
            setDocuments(result.value.documents);
            setOcr(result.value.ocrConfigured);
          } else
            setError(
              result.reason instanceof DocumentError
                ? result.reason.code
                : "SERVER_ERROR",
            );
          const recovered = initialRecovery.current;
          const recoveredCapture =
            recovered?.capture?.userId === userId &&
            recovered.capture.businessId === businessId
              ? recovered.capture
              : null;
          const recoveredEdits =
            recovered?.edits?.userId === userId &&
            recovered.edits.businessId === businessId
              ? recovered.edits
              : null;
          const saved =
            recoveredCapture ??
            (captureResult.status === "fulfilled" ? captureResult.value : null);
          if (captureResult.status === "rejected") {
            setLocalFailure(true);
            setError("LOCAL_STORAGE_FAILED");
          }
          if (saved) {
            latestCapture.current = saved;
            setCapture(saved);
            setSourceType(saved.sourceType);
          }
          const openId = initialDocumentId ?? recoveredEdits?.documentId;
          if (openId) {
            const value = await readSourceDocument(
              businessId,
              openId,
              abort.signal,
            );
            const local = await Promise.allSettled([
              documentDrafts().loadEdits(userId, businessId, openId),
              documentDrafts().loadPending(userId, businessId, openId),
            ]);
            const stored =
              local[0].status === "fulfilled" ? local[0].value : null;
            const edits =
              recoveredEdits?.documentId === openId ? recoveredEdits : stored;
            const operation =
              local[1].status === "fulfilled" ? local[1].value : null;
            if (abort.signal.aborted) return;
            setDetail(value);
            setOcr(value.ocrConfigured);
            setRows(edits?.rows ?? value.document.proposals ?? []);
            latestDetail.current = value;
            latestRows.current = edits?.rows ?? value.document.proposals ?? [];
            savedEdits.current = stored;
            setPending(operation);
            if (local.some((item) => item.status === "rejected")) {
              setLocalFailure(true);
              setError("LOCAL_STORAGE_FAILED");
            }
            if (edits && edits.baseRevision !== value.document.revision) {
              conflictEdits.current = stored;
              setConflict(value);
            }
            latestCapture.current = null;
            setCapture(null);
          }
        })
        .catch((failure) => {
          if (!abort.signal.aborted) {
            setError(
              failure instanceof DocumentError
                ? failure.code
                : "LOCAL_STORAGE_FAILED",
            );
          }
        })
        .finally(() => {
          if (!abort.signal.aborted) setLoading(false);
        });
      return () => {
        alive.current = false;
        abort.abort();
      };
    }, [userId, businessId, initialDocumentId]);
    useEffect(() => {
      if (!capture) {
        return;
      }
      const url = URL.createObjectURL(capture.file);
      Promise.resolve().then(() => {
        if (alive.current) setPreview(url);
      });
      return () => URL.revokeObjectURL(url);
    }, [capture]);

    function adopt(value: DocumentDetail) {
      latestDetail.current = value;
      latestRows.current = value.document.proposals ?? [];
      setDetail(value);
      setRows(value.document.proposals ?? []);
      setIndex((current) =>
        Math.min(
          current,
          Math.max(0, (value.document.proposals?.length ?? 1) - 1),
        ),
      );
      setDocuments((current) => [
        value.document,
        ...current.filter((item) => item.id !== value.document.id),
      ]);
      setReviewing(false);
      setCompared(false);
      setDuplicatesChecked(false);
    }
    function updateRows(next: DocumentProposal[]) {
      if (!detail || locked) return;
      setRows(next);
      setStatus("saving");
      setReviewing(false);
      const epoch = ++writeEpoch.current;
      const edits: DocumentEdits = {
        userId,
        businessId,
        documentId: detail.document.id,
        baseRevision: detail.document.revision,
        rows: next,
      };
      latestRows.current = next;
      onRecoveryChange?.({ capture: null, edits });
      writer.current = writer.current.then(async () => {
        try {
          await documentDrafts().saveEdits(edits, savedEdits.current);
          savedEdits.current = edits;
          if (alive.current && writeEpoch.current === epoch) {
            setLocalFailure(false);
            setStatus("savedLocal");
            onRecoveryChange?.(null);
          }
          return true;
        } catch (failure) {
          if (alive.current) {
            setLocalFailure(true);
            setError("LOCAL_STORAGE_FAILED");
          }
          if (
            failure instanceof Error &&
            failure.message === "DOCUMENT_LOCAL_CONFLICT"
          ) {
            const latest = await documentDrafts().loadEdits(
              userId,
              businessId,
              edits.documentId,
            );
            if (alive.current && latest) {
              conflictEdits.current = latest;
              setConflict({
                ...detail,
                document: { ...detail.document, proposals: latest.rows },
              });
            }
          }
          return false;
        }
      });
    }
    async function openDocument(id: string) {
      if (busy || !(await writer.current)) return;
      setBusy(true);
      setError(null);
      setStatus(null);
      try {
        const value = await readSourceDocument(
          businessId,
          id,
          controller.current?.signal,
        );
        const [edits, operation] = await Promise.all([
          documentDrafts().loadEdits(userId, businessId, id),
          documentDrafts().loadPending(userId, businessId, id),
        ]);
        if (!alive.current) return;
        adopt(value);
        setRows(edits?.rows ?? value.document.proposals ?? []);
        latestRows.current = edits?.rows ?? value.document.proposals ?? [];
        savedEdits.current = edits;
        setOcr(value.ocrConfigured);
        setPending(operation);
        conflictEdits.current = edits;
        setConflict(
          edits && edits.baseRevision !== value.document.revision
            ? value
            : null,
        );
        latestCapture.current = null;
        setCapture(null);
        setProcessing(false);
      } catch (failure) {
        if (alive.current)
          setError(
            failure instanceof DocumentError
              ? failure.code
              : "LOCAL_STORAGE_FAILED",
          );
      } finally {
        if (alive.current) setBusy(false);
      }
    }
    async function chooseFile(event: ChangeEvent<HTMLInputElement>) {
      const file = event.target.files?.[0];
      if (!file) return;
      if (
        !["image/jpeg", "image/png"].includes(file.type) ||
        file.size < 1 ||
        file.size > MAX_IMAGE_BYTES
      ) {
        setError("INVALID_IMAGE");
        return;
      }
      const draft: CaptureDraft = {
        userId,
        businessId,
        documentId: crypto.randomUUID(),
        registerOperationId: crypto.randomUUID(),
        sourceType,
        file,
        name: file.name,
      };
      const epoch = ++writeEpoch.current;
      latestCapture.current = draft;
      latestDetail.current = null;
      latestRows.current = [];
      onRecoveryChange?.({ capture: draft, edits: null });
      setCapture(draft);
      setDetail(null);
      setRows([]);
      setError(null);
      setStatus(null);
      savedEdits.current = null;
      try {
        await documentDrafts().saveCapture(draft);
        if (alive.current && writeEpoch.current === epoch) {
          setLocalFailure(false);
          setStatus("savedLocal");
          onRecoveryChange?.(null);
        }
      } catch {
        if (alive.current) {
          setLocalFailure(true);
          setError("LOCAL_STORAGE_FAILED");
        }
      }
    }
    async function run(command: DocumentCommand) {
      await documentDrafts().freeze(userId, command);
      if (alive.current) setPending(command);
      const result = await submitDocument(command, controller.current?.signal);
      // A processing response acknowledges polling, not financial acceptance.
      await documentDrafts().acknowledge(userId, command);
      if (alive.current) {
        setPending(null);
        setProcessing(result.ocrStatus === "processing");
      }
      return result;
    }
    function command(
      action: DocumentCommand["action"],
      values: Record<string, unknown>,
      value = detail,
    ): DocumentCommand {
      if (!value) throw new Error("No document");
      return {
        businessId,
        documentId: value.document.id,
        operationId: crypto.randomUUID(),
        expectedRevision: value.document.revision,
        action,
        values,
      };
    }
    async function fail(failure: unknown) {
      if (!alive.current) return;
      const code =
        failure instanceof DocumentError
          ? failure.code
          : failure instanceof Error && failure.message === "DOCUMENT_PENDING"
            ? "DOCUMENT_PENDING"
            : "LOCAL_STORAGE_FAILED";
      setError(code);
      // A definite validation/conflict rejection cannot have accepted this command.
      if (
        [
          "VALIDATION_ERROR",
          "CONFLICT",
          "ACCEPTED_ROW_LOCKED",
          "ROW_ALREADY_ACCEPTED",
        ].includes(code)
      ) {
        const frozen = await documentDrafts().loadPending(
          userId,
          businessId,
          detail?.document.id ?? capture?.documentId ?? "",
        );
        if (frozen) await documentDrafts().acknowledge(userId, frozen);
        if (alive.current) setPending(null);
      }
      if (code === "CONFLICT" && detail) {
        const latest = await readSourceDocument(
          businessId,
          detail.document.id,
          controller.current?.signal,
        );
        if (alive.current) {
          conflictEdits.current = savedEdits.current;
          setConflict(latest);
        }
      }
    }
    async function upload() {
      if (!capture || busy) return;
      setBusy(true);
      setError(null);
      setStatus("uploading");
      try {
        // Re-save the original first; a failed device write never claims durable capture.
        await documentDrafts().saveCapture(capture);
        const hash = Array.from(
          new Uint8Array(
            await crypto.subtle.digest(
              "SHA-256",
              await capture.file.arrayBuffer(),
            ),
          ),
          (byte) => byte.toString(16).padStart(2, "0"),
        ).join("");
        const frozen = await documentDrafts().loadPending(
          userId,
          businessId,
          capture.documentId,
        );
        let result;
        if (frozen?.action === "uploaded") result = await run(frozen);
        else {
          const registration: DocumentCommand = frozen ?? {
            businessId,
            documentId: capture.documentId,
            operationId: capture.registerOperationId,
            expectedRevision: 0,
            action: "register",
            values: {
              sourceType: capture.sourceType,
              mimeType: capture.file.type,
              byteSize: capture.file.size,
              sha256: hash,
            },
          };
          result = await run(registration);
          if (result.upload) {
            try {
              await uploadDocumentImage(result.upload, capture.file);
            } catch {
              /* The first upload may have succeeded before its response was lost. Finalization verifies original bytes and hash. */
            }
            result = await run(command("uploaded", {}, result.detail));
          }
        }
        await documentDrafts().removeCapture(userId, businessId);
        if (!alive.current) return;
        latestCapture.current = null;
        setCapture(null);
        adopt(result.detail);
        setLocalFailure(false);
        setStatus("uploaded");
        onRecoveryChange?.(null);
      } catch (failure) {
        await fail(failure);
      } finally {
        if (alive.current) setBusy(false);
      }
    }
    async function saveRows(): Promise<DocumentDetail | null> {
      if (!detail || !(await writer.current)) return null;
      const result = await run(command("review", { rows }));
      await writer.current;
      await documentDrafts().removeEdits(
        userId,
        businessId,
        detail.document.id,
        savedEdits.current,
      );
      savedEdits.current = null;
      if (alive.current) {
        adopt(result.detail);
        setStatus("saved");
      }
      return result.detail;
    }
    async function action(kind: "save" | "extract" | "accept" | "retry") {
      if (busy || !detail) return;
      setBusy(true);
      setError(null);
      setStatus(null);
      try {
        if (kind === "retry" && pending) {
          const result = await run(pending);
          if (!alive.current) return;
          adopt(result.detail);
          if (pending.action === "accept") {
            setStatus("accepted");
            onAccepted?.();
          }
        } else if (kind === "extract") {
          if (!consent) return;
          if (rows.length) {
            setError("CONFLICT");
            return;
          }
          const result = await run(command("extract", { consent: true }));
          if (alive.current) {
            adopt(result.detail);
            setProcessing(result.ocrStatus === "processing");
          }
        } else if (kind === "accept") {
          if (
            !row ||
            !compared ||
            !duplicatesChecked ||
            validateProposal(row).length
          ) {
            setError("VALIDATION_ERROR");
            return;
          }
          const rowId = row.id;
          const saved = await saveRows();
          if (!saved) return;
          const result = await run(
            command(
              "accept",
              { rowId, reviewConfirmed: true, duplicateReviewed: true },
              saved,
            ),
          );
          if (alive.current) {
            adopt(result.detail);
            setStatus("accepted");
            onAccepted?.();
          }
        } else await saveRows();
      } catch (failure) {
        await fail(failure);
      } finally {
        if (alive.current) setBusy(false);
      }
    }
    async function chooseConflict(useMine: boolean) {
      if (!conflict || !detail) return;
      const currentRows = rows;
      try {
        await documentDrafts().removeEdits(
          userId,
          businessId,
          detail.document.id,
          conflictEdits.current,
        );
      } catch {
        setError("CONFLICT");
        return;
      }
      savedEdits.current = null;
      writer.current = Promise.resolve(true);
      const current = conflict;
      setConflict(null);
      adopt(current);
      setError(null);
      setLocalFailure(false);
      if (useMine) {
        // Keep accepted source rows from the server, then retain only unaccepted local edits.
        const acceptedRows = new Set(
          current.acceptedRows.map((item) => item.rowId),
        );
        const merged = [
          ...(current.document.proposals ?? []).filter((item) =>
            acceptedRows.has(item.id),
          ),
          ...currentRows.filter((item) => !acceptedRows.has(item.id)),
        ];
        const edits: DocumentEdits = {
          userId,
          businessId,
          documentId: detail.document.id,
          baseRevision: current.document.revision,
          rows: merged,
        };
        await documentDrafts().saveEdits(edits, null);
        savedEdits.current = edits;
        setRows(merged);
        latestRows.current = merged;
      }
    }
    const errorText =
      error === "OCR_NOT_CONFIGURED"
        ? t.notConfigured
        : error === "OCR_FAILED"
          ? t.ocrFailure
          : error === "INVALID_IMAGE"
            ? t.notImage
            : error === "VALIDATION_ERROR"
              ? t.required
              : error === "LOCAL_STORAGE_FAILED"
                ? t.localFailure
                : error === "UPLOAD_INCOMPLETE"
                  ? t.missingUpload
                  : error === "SOURCE_UNAVAILABLE"
                    ? t.sourceUnavailable
                    : error === "CONFLICT"
                      ? t.conflict
                      : t.failed;
    const duplicate = Boolean(
      row &&
      (matchingProposalIds(rows, row).length ||
        detail?.duplicateRecords.some((item) => item.rowId === row.id)),
    );
    const stateLabel = (state: SourceDocument["state"]) =>
      state === "uploading"
        ? t.uploadingState
        : state === "uploaded"
          ? t.uploadedState
          : state === "review"
            ? t.reviewState
            : t.failedState;
    async function persistWork() {
      await writer.current;
      if (conflict) return false;
      const currentCapture = latestCapture.current,
        currentDetail = latestDetail.current,
        currentRows = latestRows.current;
      const edits =
        currentDetail &&
        JSON.stringify(currentRows) !==
          JSON.stringify(currentDetail.document.proposals ?? [])
          ? {
              userId,
              businessId,
              documentId: currentDetail.document.id,
              baseRevision: currentDetail.document.revision,
              rows: currentRows,
            }
          : null;
      try {
        if (currentCapture) await documentDrafts().saveCapture(currentCapture);
        if (
          edits &&
          JSON.stringify(edits) !== JSON.stringify(savedEdits.current)
        ) {
          await documentDrafts().saveEdits(edits, savedEdits.current);
          savedEdits.current = edits;
        }
        if (alive.current) {
          setLocalFailure(false);
          onRecoveryChange?.(null);
        }
        return true;
      } catch {
        if (alive.current) {
          setLocalFailure(true);
          setError("LOCAL_STORAGE_FAILED");
          onRecoveryChange?.({ capture: currentCapture, edits });
        }
        return false;
      }
    }
    useImperativeHandle(ref, () => ({ persist: persistWork }));
    async function home() {
      if (await persistWork()) onHome();
    }
    async function backToPages() {
      if (busy || !(await persistWork())) return;
      latestDetail.current = null;
      latestRows.current = [];
      setDetail(null);
      setRows([]);
      setPending(null);
      setConflict(null);
      setReviewing(false);
      savedEdits.current = null;
    }
    useJourneyHistory(
      `notebook:${businessId}`,
      {
        documentId: detail?.document.id ?? null,
        index,
        reviewing: reviewing ? 1 : 0,
      },
      (next) => {
        if (
          typeof next.documentId === "string" &&
          next.documentId !== detail?.document.id
        )
          void openDocument(next.documentId);
        else if (!next.documentId && detail) void backToPages();
        setIndex(Number(next.index) || 0);
        setReviewing(Boolean(next.reviewing));
      },
      async () => !busy && (await persistWork()),
      !loading,
    );

    return (
      <section className={styles.workspace} aria-labelledby="notebook-heading">
        <button
          type="button"
          className="text-button"
          onClick={() =>
            void (reviewing
              ? setReviewing(false)
              : detail
                ? backToPages()
                : home())
          }
          disabled={busy}
        >
          ← {language === "en" ? "Back" : "Bumalik"}
        </button>
        <div>
          <h1 id="notebook-heading">
            {detail
              ? language === "en"
                ? "Check against your notebook"
                : "Ihambing sa kuwaderno"
              : t.title}
          </h1>
        </div>
        {error ? (
          <div role="alert" className="alert error">
            {errorText}
          </div>
        ) : null}
        {status ? (
          <p role="status" className={styles.status}>
            {t[status as keyof typeof t] ?? status}
          </p>
        ) : null}
        {pending && detail ? (
          <div role="status" className="alert info">
            <p>{t.pending}</p>
            <button
              className="button primary"
              disabled={busy}
              onClick={() => void action("retry")}
            >
              {t.retry}
            </button>
          </div>
        ) : null}
        {conflict ? (
          <div className={styles.comparison}>
            <p role="alert">{t.conflict}</p>
            <div>
              <strong>{t.yourEdits}</strong>
              {rows.map((item) => (
                <p key={item.id}>
                  {item.businessDate || "—"} · {item.description || "—"} ·{" "}
                  {item.amount || "—"}
                </p>
              ))}
            </div>
            <div>
              <strong>{t.serverEdits}</strong>
              {conflict.document.proposals?.map((item) => (
                <p key={item.id}>
                  {item.businessDate || "—"} · {item.description || "—"} ·{" "}
                  {item.amount || "—"}
                </p>
              ))}
            </div>
            <button
              className="button secondary"
              onClick={() => void chooseConflict(false)}
            >
              {t.useServer}
            </button>
            <button
              className="button secondary"
              onClick={() => void chooseConflict(true)}
            >
              {t.useMine}
            </button>
          </div>
        ) : null}
        {loading ? (
          <p role="status">{t.load}</p>
        ) : detail ? (
          <div className={styles.reviewLayout}>
            <div className={styles.source}>
              <h2>{t.source}</h2>
              {/* A private authenticated image endpoint requires a normal image element. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={documentImageUrl(businessId, detail.document.id)}
                alt={t.source}
                onError={() => setError("SOURCE_UNAVAILABLE")}
              />
              <a
                href={documentImageUrl(businessId, detail.document.id)}
                target="_blank"
                rel="noopener noreferrer"
              >
                {t.source}
              </a>
              <p>
                {t.state}: {stateLabel(detail.document.state)}
              </p>
              {detail.duplicateDocuments.length ? (
                <p className="alert info">{t.duplicatePage}</p>
              ) : null}
              <details>
                <summary>{t.history}</summary>
                <p className={styles.hint}>{t.audit}</p>
                {detail.history.map((item) => (
                  <p key={item.revision}>
                    {item.revision} ·{" "}
                    <time dateTime={item.recordedAt}>
                      {item.recordedAt.slice(0, 10)}
                    </time>{" "}
                    ·{" "}
                    {item.action === "accept"
                      ? t.accepted
                      : item.action === "register"
                        ? t.uploadedDate
                        : t.reviewDraft}
                  </p>
                ))}
              </details>
            </div>
            <div className={styles.editor}>
              <h2>{t.review}</h2>
              {detail.document.state === "uploading" ? (
                <p>{t.missingUpload}</p>
              ) : (
                <>
                  {!ocr ? (
                    <p className="alert info">{t.notConfigured}</p>
                  ) : !rows.length && !detail.document.original_extraction ? (
                    <div className={styles.stack}>
                      <p>{t.disclosure}</p>
                      <label className={styles.check}>
                        <input
                          type="checkbox"
                          checked={consent}
                          onChange={(event) => setConsent(event.target.checked)}
                          disabled={locked}
                        />
                        {t.consent}
                      </label>
                      <button
                        type="button"
                        className="button secondary"
                        disabled={locked || !consent}
                        onClick={() => void action("extract")}
                      >
                        {processing ? t.checkProcessing : t.extract}
                      </button>
                      {processing ? <p role="status">{t.processing}</p> : null}
                    </div>
                  ) : null}
                  {!rows.length ? (
                    <p>{t.empty}</p>
                  ) : row ? (
                    <div className={styles.stack}>
                      <div className={styles.rowNavigation}>
                        <button
                          type="button"
                          aria-label={t.previous}
                          className="button secondary"
                          disabled={index === 0 || busy}
                          onClick={() => {
                            setIndex((value) => value - 1);
                            setReviewing(false);
                          }}
                        >
                          ←
                        </button>
                        <span>
                          {t.row} {index + 1} / {rows.length}
                        </span>
                        <button
                          type="button"
                          aria-label={t.next}
                          className="button secondary"
                          disabled={index >= rows.length - 1 || busy}
                          onClick={() => {
                            setIndex((value) => value + 1);
                            setReviewing(false);
                          }}
                        >
                          →
                        </button>
                      </div>
                      {accepted ? (
                        <p className="alert success">{t.acceptedLocked}</p>
                      ) : null}
                      {row.uncertainties.length ? (
                        <p className={styles.hint}>{t.uncertain}</p>
                      ) : null}
                      {row.sourceText ? (
                        <details>
                          <summary>{t.original}</summary>
                          <p>{row.sourceText}</p>
                        </details>
                      ) : null}
                      {duplicate ? (
                        <p className="alert info">{t.duplicateRow}</p>
                      ) : null}
                      {reviewing ? (
                        <div className={styles.stack}>
                          <h3>{t.confirmTitle}</h3>
                          <dl>
                            <dt>{t.date}</dt>
                            <dd>{row.businessDate}</dd>
                            <dt>{t.amount}</dt>
                            <dd>
                              {validateProposal(row).includes("amount")
                                ? "—"
                                : formatPHP(amountToCentavos(row.amount))}
                            </dd>
                            <dt>{t.description}</dt>
                            <dd>{row.description || "—"}</dd>
                            <dt>{t.kind}</dt>
                            <dd>{row.kind === "sale" ? t.sale : t.expense}</dd>
                            <dt>{t.payment}</dt>
                            <dd>
                              {row.paymentStatus === "paid"
                                ? t.paid
                                : row.paymentStatus === "unpaid"
                                  ? t.unpaid
                                  : row.paymentStatus === "partial"
                                    ? t.partial
                                    : t.unknownPayment}
                            </dd>
                            {row.paymentStatus === "partial" ? (
                              <>
                                <dt>{t.paidAmount}</dt>
                                <dd>{row.paymentAmount}</dd>
                              </>
                            ) : null}
                            {row.paymentStatus === "paid" ||
                            row.paymentStatus === "partial" ? (
                              <>
                                <dt>{t.paidDate}</dt>
                                <dd>{row.paymentDate}</dd>
                              </>
                            ) : null}
                          </dl>
                          {amountToCentavos(row.amount) === "0" ? (
                            <p className="alert info">{t.zero}</p>
                          ) : null}
                          {row.businessDate > todayInManila() ||
                          ((row.paymentStatus === "paid" ||
                            row.paymentStatus === "partial") &&
                            (row.paymentDate ?? "") > todayInManila()) ? (
                            <p className="alert info">{t.future}</p>
                          ) : null}
                          <label className={styles.check}>
                            <input
                              type="checkbox"
                              checked={compared}
                              disabled={locked}
                              onChange={(event) =>
                                setCompared(event.target.checked)
                              }
                            />
                            {t.confirmed}
                          </label>
                          <label className={styles.check}>
                            <input
                              type="checkbox"
                              checked={duplicatesChecked}
                              disabled={locked}
                              onChange={(event) =>
                                setDuplicatesChecked(event.target.checked)
                              }
                            />
                            {t.duplicatesConfirmed}
                          </label>
                          <button
                            type="button"
                            className="button primary"
                            disabled={
                              locked ||
                              !compared ||
                              !duplicatesChecked ||
                              localFailure
                            }
                            onClick={() => void action("accept")}
                          >
                            {t.accept}
                          </button>
                          <button
                            type="button"
                            className="text-button"
                            disabled={busy}
                            onClick={() => setReviewing(false)}
                          >
                            {t.cancel}
                          </button>
                        </div>
                      ) : (
                        <fieldset
                          className={styles.fields}
                          disabled={locked || accepted}
                        >
                          <label>
                            {t.line}
                            <input
                              type="number"
                              min={1}
                              max={9999}
                              value={row.line}
                              onChange={(event) =>
                                updateRows(
                                  rows.map((item) =>
                                    item.id === row.id
                                      ? {
                                          ...item,
                                          line: Number(event.target.value),
                                        }
                                      : item,
                                  ),
                                )
                              }
                            />
                          </label>
                          <label>
                            {t.date}
                            <input
                              type="date"
                              min="1900-01-01"
                              max="2100-12-31"
                              value={row.businessDate}
                              onChange={(event) =>
                                updateRows(
                                  rows.map((item) =>
                                    item.id === row.id
                                      ? {
                                          ...item,
                                          businessDate: event.target.value,
                                        }
                                      : item,
                                  ),
                                )
                              }
                            />
                          </label>
                          <label>
                            {t.description}
                            <input
                              type="text"
                              maxLength={500}
                              value={row.description}
                              onChange={(event) =>
                                updateRows(
                                  rows.map((item) =>
                                    item.id === row.id
                                      ? {
                                          ...item,
                                          description: event.target.value,
                                        }
                                      : item,
                                  ),
                                )
                              }
                            />
                          </label>
                          <label>
                            {t.amount}
                            <input
                              type="text"
                              inputMode="decimal"
                              maxLength={32}
                              value={row.amount}
                              onChange={(event) =>
                                updateRows(
                                  rows.map((item) =>
                                    item.id === row.id
                                      ? { ...item, amount: event.target.value }
                                      : item,
                                  ),
                                )
                              }
                            />
                          </label>
                          <label>
                            {t.kind}
                            <select
                              aria-label={t.kind}
                              value={row.kind}
                              onChange={(event) =>
                                updateRows(
                                  rows.map((item) =>
                                    item.id === row.id
                                      ? {
                                          ...item,
                                          kind: event.target
                                            .value as DocumentProposal["kind"],
                                        }
                                      : item,
                                  ),
                                )
                              }
                            >
                              <option value="sale">{t.sale}</option>
                              <option value="expense">{t.expense}</option>
                              <option value="unknown">{t.unknownKind}</option>
                            </select>
                          </label>
                          <label>
                            {t.payment}
                            <select
                              aria-label={t.payment}
                              value={row.paymentStatus}
                              onChange={(event) =>
                                updateRows(
                                  rows.map((item) =>
                                    item.id === row.id
                                      ? {
                                          ...item,
                                          paymentStatus: event.target
                                            .value as DocumentProposal["paymentStatus"],
                                        }
                                      : item,
                                  ),
                                )
                              }
                            >
                              <option value="unknown">
                                {t.unknownPayment}
                              </option>
                              <option value="paid">{t.paid}</option>
                              <option value="unpaid">{t.unpaid}</option>
                              <option value="partial">{t.partial}</option>
                            </select>
                          </label>
                          {row.paymentStatus === "partial" ? (
                            <label>
                              {t.paidAmount}
                              <input
                                type="text"
                                inputMode="decimal"
                                maxLength={32}
                                value={row.paymentAmount ?? ""}
                                onChange={(event) =>
                                  updateRows(
                                    rows.map((item) =>
                                      item.id === row.id
                                        ? {
                                            ...item,
                                            paymentAmount: event.target.value,
                                          }
                                        : item,
                                    ),
                                  )
                                }
                              />
                            </label>
                          ) : null}
                          {row.paymentStatus === "paid" ||
                          row.paymentStatus === "partial" ? (
                            <label>
                              {t.paidDate}
                              <input
                                type="date"
                                min={row.businessDate || "1900-01-01"}
                                max="2100-12-31"
                                value={row.paymentDate ?? ""}
                                onChange={(event) =>
                                  updateRows(
                                    rows.map((item) =>
                                      item.id === row.id
                                        ? {
                                            ...item,
                                            paymentDate: event.target.value,
                                          }
                                        : item,
                                    ),
                                  )
                                }
                              />
                            </label>
                          ) : null}
                          <p className={styles.hint}>{t.paymentHelp}</p>
                          <button
                            type="button"
                            className="button primary"
                            disabled={localFailure}
                            onClick={() => {
                              if (validateProposal(row).length) {
                                setError("VALIDATION_ERROR");
                                return;
                              }
                              setError(null);
                              setCompared(false);
                              setDuplicatesChecked(false);
                              setReviewing(true);
                            }}
                          >
                            {t.reviewRow}
                          </button>
                          <details>
                            <summary>{t.remove}</summary>
                            <p>{t.removeHelp}</p>
                            <button
                              type="button"
                              className="text-button danger-text"
                              onClick={() => {
                                updateRows(
                                  rows.filter((item) => item.id !== row.id),
                                );
                                setIndex((value) => Math.max(0, value - 1));
                              }}
                            >
                              {t.remove}
                            </button>
                          </details>
                        </fieldset>
                      )}
                    </div>
                  ) : null}
                  <div className={styles.actions}>
                    <button
                      type="button"
                      className="button secondary"
                      disabled={locked || rows.length >= 50}
                      onClick={() => {
                        const next: DocumentProposal = {
                          id: crypto.randomUUID(),
                          page: 1,
                          line: rows.length + 1,
                          sourceText: "",
                          businessDate: "",
                          description: "",
                          amount: "",
                          kind:
                            detail.document.source_type === "sales_notebook"
                              ? "sale"
                              : "expense",
                          paymentStatus: "unknown",
                          uncertainties: [],
                        };
                        updateRows([...rows, next]);
                        setIndex(rows.length);
                      }}
                    >
                      {t.addRow}
                    </button>
                    <button
                      type="button"
                      className="button secondary"
                      disabled={locked || localFailure}
                      onClick={() => void action("save")}
                    >
                      {busy ? t.saving : t.saveRows}
                    </button>
                  </div>
                  {rows.length >= 50 ? <p>{t.atLimit}</p> : null}
                </>
              )}
              <button
                type="button"
                className="text-button"
                disabled={busy}
                onClick={() => void openDocument(detail.document.id)}
              >
                {t.refresh}
              </button>
              <button
                type="button"
                className="text-button"
                disabled={busy}
                onClick={() => void backToPages()}
              >
                {t.changeSource}
              </button>
            </div>
          </div>
        ) : (
          <div className={styles.captureLayout}>
            <div className={styles.capture}>
              <p>{t.guidance}</p>
              <label>
                {t.sourceType}
                <select
                  aria-label={t.sourceType}
                  value={sourceType}
                  disabled={busy || Boolean(capture)}
                  onChange={(event) =>
                    setSourceType(event.target.value as typeof sourceType)
                  }
                >
                  <option value="sales_notebook">{t.sales}</option>
                  <option value="expense_notebook">{t.expenses}</option>
                </select>
              </label>
              <label>
                {capture ? t.retake : t.choose}
                <input
                  type="file"
                  accept="image/jpeg,image/png"
                  capture="environment"
                  onChange={(event) => void chooseFile(event)}
                  disabled={busy}
                />
              </label>
              <details className="quiet-details">
                <summary>
                  {language === "en"
                    ? "Photo tips & supported pages"
                    : "Gabay sa larawan at pahina"}
                </summary>
                <p>{t.supported}</p>
                <p>{t.imageHelp}</p>
                <p>{t.note}</p>
              </details>
              {capture && preview ? (
                <div className={styles.stack}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    className={styles.preview}
                    src={preview}
                    alt={t.preview}
                  />
                  <button
                    type="button"
                    className="button primary"
                    disabled={busy}
                    onClick={() => void upload()}
                  >
                    {busy ? t.uploading : t.upload}
                  </button>
                </div>
              ) : null}
            </div>
            <details className={styles.pages}>
              <summary>
                {t.sources} · {documents.length}
              </summary>
              {!documents.length ? (
                <p>{t.noPages}</p>
              ) : (
                <ul>
                  {documents.map((item) => (
                    <li key={item.id}>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void openDocument(item.id)}
                      >
                        <strong>
                          {item.source_type === "sales_notebook"
                            ? t.sales
                            : t.expenses}
                        </strong>
                        <span>
                          {item.created_at.slice(0, 10)} ·{" "}
                          {stateLabel(item.state)}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </details>
          </div>
        )}
      </section>
    );
  },
);
