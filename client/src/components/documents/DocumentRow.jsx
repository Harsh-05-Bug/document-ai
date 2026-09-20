import { Link } from "react-router-dom";
import StatusPill from "../common/StatusPill.jsx";

const formatSize = (bytes) => {
  if (!bytes) return "—";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** i).toFixed(i ? 1 : 0)} ${units[i]}`;
};

export default function DocumentRow({ doc }) {
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
      </div>
      <span className="meta">{doc.chunk_count ? `${doc.chunk_count} chunks` : ""}</span>
      <StatusPill status={doc.status} chunks={doc.chunk_count} />
    </Link>
  );
}
