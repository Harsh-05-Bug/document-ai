import { useState } from "react";
import { Link } from "react-router-dom";
import StatusPill from "../common/StatusPill.jsx";
import { retryDocument } from "../../api/documents.api.js";

const formatSize = (bytes) => {
  if (!bytes) return "—";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** i).toFixed(i ? 1 : 0)} ${units[i]}`;
};

export default function DocumentRow({ doc, onChanged }) {
  const [retrying, setRetrying] = useState(false);
  const [error, setError] = useState("");

  async function retry(e) {
    // The whole row is a link, so stop the click from navigating.
    e.preventDefault();
    e.stopPropagation();
    if (retrying) return;

    setRetrying(true);
    setError("");
    try {
      await retryDocument(doc.id);
      onChanged?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setRetrying(false);
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

      {doc.status === "failed" && (
        <button type="button" onClick={retry} disabled={retrying}>
          {retrying ? "Retrying…" : "Retry"}
        </button>
      )}

      <StatusPill status={doc.status} chunks={doc.chunk_count} />
    </Link>
  );
}