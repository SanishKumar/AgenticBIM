"use client";
import { useMemo, useRef, useState } from "react";
import {
  ArrowDownToLine,
  ArrowRight,
  FolderOpen,
  LoaderCircle,
  Upload,
} from "lucide-react";
import { evaluateModel } from "@/lib/model";
import {
  MAX_BACKUP_BYTES,
  parseWorkspaceBackup,
  serializeWorkspace,
  workspaceContext,
  type Workspace,
  type WorkspaceBackup,
} from "@/lib/workspace-backup";
import Dialog from "./dialog";

export default function BackupDialog({
  workspace,
  onDownload,
  onRestore,
  onClose,
}: {
  workspace: Workspace;
  onDownload: (content: string) => void;
  onRestore: (workspace: Workspace) => Promise<void>;
  onClose: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [candidate, setCandidate] = useState<WorkspaceBackup | null>(null);
  const [filename, setFilename] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const noteCounts = useMemo(() => {
    if (!candidate) return { total: 0, active: 0 };
    const { model, policy, decisions, decisionContext } = candidate.workspace;
    const findings = new Set(
      evaluateModel(model, policy).findings.map((finding) => finding.id),
    );
    return {
      total: Object.keys(decisions).length,
      active:
        decisionContext === workspaceContext(model, policy)
          ? Object.entries(decisions).filter(
              ([id, decision]) =>
                findings.has(id) && decision.status === "acknowledged",
            ).length
          : 0,
    };
  }, [candidate]);

  async function chooseFile(file?: File) {
    if (!file) return;
    setCandidate(null);
    setError("");
    setBusy(true);
    try {
      if (file.size > MAX_BACKUP_BYTES)
        throw new Error("Choose a workspace backup smaller than 128 MB.");
      const backup = parseWorkspaceBackup(await file.text());
      setFilename(file.name);
      setCandidate(backup);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "The backup could not be read.",
      );
    } finally {
      setBusy(false);
    }
  }
  function download() {
    setError("");
    try {
      onDownload(serializeWorkspace(workspace));
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "The backup could not be created.",
      );
    }
  }
  async function restore() {
    if (!candidate) return;
    setBusy(true);
    setError("");
    try {
      await onRestore(candidate.workspace);
    } catch {
      setError(
        "Browser storage could not save this backup. Your current review is unchanged. Free browser storage or try another browser, then restore again.",
      );
      setBusy(false);
    }
  }
  return (
    <Dialog
      title={candidate ? "Restore this review?" : "Keep your review."}
      wide={!!candidate}
      onClose={onClose}
      busy={busy}
    >
      <p className="dialog-intro">
        {candidate
          ? "Check the saved models, assumptions and notes before replacing your workspace."
          : "Move a review to another browser or keep a copy before changing projects. A backup includes both models, 3D geometry, assumptions and review notes."}
      </p>
      {!candidate && (
        <button className="export-option" onClick={download} disabled={busy}>
          <span className="export-icon">
            <ArrowDownToLine size={23} />
          </span>
          <span>
            <strong>Download workspace backup</strong>
            <small>
              {workspace.model.project_name} · {workspace.model.elements.length}{" "}
              elements
            </small>
            <em>TRACE.JSON · reopen in Trace</em>
          </span>
          <ArrowDownToLine size={18} />
        </button>
      )}
      <input
        ref={input}
        hidden
        type="file"
        accept=".json"
        aria-label="Choose workspace backup"
        disabled={busy}
        onChange={(event) => {
          void chooseFile(event.target.files?.[0]);
          event.target.value = "";
        }}
      />
      {!candidate && (
        <div className="backup-restore">
          <div className="backup-heading">
            <FolderOpen size={18} />
            <h3>Restore a saved review</h3>
          </div>
          <p>
            Choose a .trace.json backup. You can inspect it before replacing
            this workspace.
          </p>
          <button
            className="secondary-button"
            onClick={() => input.current?.click()}
            disabled={busy}
          >
            <Upload size={14} />
            Choose backup
          </button>
        </div>
      )}
      {candidate && (
        <section className="backup-preview" aria-label="Backup preview">
          <span className="eyebrow">READY TO RESTORE</span>
          <h3>{candidate.workspace.model.project_name}</h3>
          <p>
            {filename} · {new Date(candidate.exported_at).toLocaleString()}
          </p>
          <dl>
            <div>
              <dt>Current model</dt>
              <dd>
                {candidate.workspace.model.elements.length} elements ·{" "}
                {candidate.workspace.model.filename}
              </dd>
            </div>
            <div>
              <dt>Baseline</dt>
              <dd>
                {candidate.workspace.baseline
                  ? `${candidate.workspace.baseline.elements.length} elements · ${candidate.workspace.baseline.filename}`
                  : "No baseline"}
              </dd>
            </div>
            <div>
              <dt>Assumptions</dt>
              <dd>
                {candidate.workspace.policy.rates.length} material rates ·{" "}
                {candidate.workspace.policy.minDoorWidth} m door target
              </dd>
            </div>
            <div>
              <dt>Review notes</dt>
              <dd>
                {noteCounts.total} saved · {noteCounts.active} active
                acknowledgements
              </dd>
            </div>
          </dl>
          <p>
            Backup files are editable. Restoring does not re-read the IFC or
            independently verify its declarations.
          </p>
          <p className="backup-replacement">
            This replaces your current workspace. Keep a copy before continuing.
          </p>
          <div className="backup-actions">
            <button
              className="secondary-button"
              onClick={download}
              disabled={busy}
            >
              <ArrowDownToLine size={14} />
              Back up current workspace
            </button>
            <button
              className="primary-button"
              onClick={restore}
              disabled={busy}
            >
              Replace workspace <ArrowRight size={15} />
            </button>
          </div>
        </section>
      )}
      {candidate && (
        <button
          className="text-link backup-another"
          onClick={() => input.current?.click()}
          disabled={busy}
        >
          <Upload size={14} />
          Choose another backup
        </button>
      )}
      {busy && (
        <p className="import-progress" role="status">
          <LoaderCircle className="spin" size={16} />
          Preparing your workspace…
        </p>
      )}
      {error && (
        <p className="alert" role="alert">
          {error}
        </p>
      )}
      <p className="backup-footnote">
        Files are read on this device. Keep the original IFC files separately;
        backups contain parsed snapshots. Evidence exports are separate records
        and cannot be restored.
      </p>
    </Dialog>
  );
}
