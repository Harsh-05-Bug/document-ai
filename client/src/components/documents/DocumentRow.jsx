import { useState } from "react";
import { Link } from "react-router-dom";
import StatusPill from "../common/StatusPill.jsx";
import { retryDocument, deleteDocument } from "../../api/documents.api.js";
import { moveDocument } from "../../api/folders.api.js";

const formatSize = (bytes) => {
  if (!bytes) return "—";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** i).toFixed(i ? 1 : 0)} ${units[i]}`;
};

export default function DocumentRow({ doc, folders = [], onChanged }) {
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  // The whole row is a link, so every action has to stop the click
  // from navigating to the document page.
  function intercept(e) {
    e.preventDefault();
    e.stopPropagation();
  }

  async function retry(e) {
    intercept(e);
    if (busy) return;

    setBusy("retry");
    setError("");
    try {
      await retryDocument(doc.id);
      onChanged?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy("");
    }
  }

  async function move(e) {
    intercept(e);
    const folderId = e.target.value || null;

    setBusy("move");
    setError("");
    try {
      await moveDocument(doc.id, folderId);
      onChanged?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy("");
    }
  }

  async function remove(e) {
    intercept(e);
    if (busy) return;
    if (!confirm(`Delete "${doc.filename}"? This also removes its indexed passages.`)) return;

    setBusy("delete");
    setError("");
    try {
      await deleteDocument(doc.id);
      onChanged?.();
    } catch (err) {
      setError(err.message);
      setBusy("");
    }
  }

  // Who added it matters in a shared space: a teacher's notes and a
  // classmate's draft carry different weight.
  const uploader = doc.owner_email?.split("@")[0];

  return (
    <Link className="doc-row" to={`/documents/${doc.id}`}>
      <div>
        <div className="name">{doc.filename}</div>
        <div className="meta">
          {formatSize(Number(doc.size_bytes))} · {new Date(doc.created_at).toLocaleDateString()}
          {uploader ? ` · ${uploader}` : ""}
          {doc.folder_name ? ` · ${doc.folder_name}` : ""}
          {doc.status === "failed" && doc.error ? ` · ${doc.error}` : ""}
        </div>
        {doc.tags?.length > 0 && (
          <div className="tags">
            {doc.tags.map((tag) => <span className="tag" key={tag}>{tag}</span>)}
          </div>
        )}
        {error && <div className="meta error">{error}</div>}
      </div>

      <span className="meta">{doc.chunk_count ? `${doc.chunk_count} chunks` : ""}</span>

      <span className="doc-actions" onClick={intercept}>
        {folders.length > 0 && (
          <select
            value={doc.folder_id || ""}
            onChange={move}
            onClick={intercept}
            disabled={!!busy}
            title="Move to folder"
            aria-label={`Move ${doc.filename} to a folder`}
          >
            <option value="">No folder</option>
            {folders.map((folder) => (
              <option key={folder.id} value={folder.id}>{folder.name}</option>
            ))}
          </select>
        )}

        {doc.status === "failed" && (
          <button type="button" onClick={retry} disabled={!!busy}>
            {busy === "retry" ? "Retrying…" : "Retry"}
          </button>
        )}

        <button
          type="button"
          className="danger"
          title="Delete"
          aria-label={`Delete ${doc.filename}`}
          onClick={remove}
          disabled={!!busy}
        >
          {busy === "delete" ? "…" : "×"}
        </button>
      </span>

      <StatusPill status={doc.status} chunks={doc.chunk_count} />
    </Link>
  );
}