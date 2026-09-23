import { useState } from "react";
import { Link } from "react-router-dom";
import StatusPill from "../common/StatusPill.jsx";
import { retryDocument, deleteDocument } from "../../api/documents.api.js";

const formatSize = (bytes) => {
  if (!bytes) return "—";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** i).toFixed(i ? 1 : 0)} ${units[i]}`;
};

export default function DocumentRow({ doc, onChanged }) {
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

  async function remove(e) {
    intercept(e);
    if (busy) return;
    if (!window.confirm(`Delete "${doc.filename}"? This also removes its indexed passages.`)) return;

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

  return (
    <Link className="doc-row" to={`/documents/${doc.id}`}>
      <div>
        <div className="name">{doc.filename}</div>
        <div className="meta">
          {formatSize(Number(doc.size_bytes))} · {new Date(doc.created_at).toLocaleDateString()}
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

      <span className="doc-actions">
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