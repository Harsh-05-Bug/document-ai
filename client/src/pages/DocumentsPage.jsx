import { useState } from "react";
import DocumentUpload from "../components/upload/DocumentUpload.jsx";
import DocumentRow from "../components/documents/DocumentRow.jsx";
import { useDocuments } from "../hooks/useDocuments.js";

export default function DocumentsPage() {
  const [filter, setFilter] = useState("");
  const { documents, loading, error, refresh } = useDocuments();

  const visible = documents.filter((d) =>
    d.filename.toLowerCase().includes(filter.toLowerCase())
  );

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Documents</h1>
          <p>
            Uploaded files are split into passages and indexed for search. That
            usually takes a few seconds; the status updates on its own.
          </p>
        </div>
        <input
          style={{ maxWidth: 240 }}
          placeholder="Filter by name"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
      </div>

      <DocumentUpload onUploaded={refresh} />

      {error && <p className="error" style={{ marginTop: 16 }}>{error}</p>}

      {loading ? (
        <p className="empty">Loading…</p>
      ) : visible.length === 0 ? (
        <p className="empty">
          {documents.length === 0
            ? "Nothing here yet. Upload a policy, handbook or report to get started."
            : "No documents match that filter."}
        </p>
      ) : (
        <div className="doc-list" style={{ marginTop: 24 }}>
          {visible.map((doc) => (
            <DocumentRow key={doc.id} doc={doc} onChanged={refresh} />
          ))}
        </div>
      )}
    </>
  );
}
