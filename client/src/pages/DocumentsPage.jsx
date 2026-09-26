import { useCallback, useEffect, useState } from "react";
import DocumentUpload from "../components/upload/DocumentUpload.jsx";
import DocumentRow from "../components/documents/DocumentRow.jsx";
import FolderBar from "../components/documents/FolderBar.jsx";
import { useDocuments } from "../hooks/useDocuments.js";
import { useAuth } from "../context/AuthContext.jsx";
import { listFolders } from "../api/folders.api.js";

export default function DocumentsPage() {
  const { workspaceId, workspace, role } = useAuth();
  const [filter, setFilter] = useState("");
  const [folderId, setFolderId] = useState(null);
  const [folders, setFolders] = useState([]);

  const { documents, loading, error, refresh } = useDocuments(
    folderId ? { folderId } : {}
  );

  const refreshFolders = useCallback(
    () => listFolders().then(setFolders).catch(() => {}),
    []
  );

  useEffect(() => { refreshFolders(); }, [refreshFolders, workspaceId]);

  // Switching workspace shouldn't leave a folder from the old one selected.
  useEffect(() => { setFolderId(null); }, [workspaceId]);

  const visible = documents.filter((d) =>
    d.filename.toLowerCase().includes(filter.toLowerCase())
  );

  const canUpload = role === "owner" || role === "admin" || role === "member";
  const activeFolder = folders.find((f) => f.id === folderId);

  function afterChange() {
    refresh();
    refreshFolders();
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Documents</h1>
          <p>
            Everyone in {workspace?.name || "this workspace"} can read these and ask
            questions about them. Uploaded files are split into passages and indexed
            for search — that usually takes a few seconds.
          </p>
        </div>
        <input
          style={{ maxWidth: 240 }}
          placeholder="Filter by name"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
      </div>

      <FolderBar
        folders={folders}
        activeId={folderId}
        onSelect={setFolderId}
        onChanged={refreshFolders}
      />

      {canUpload ? (
        <DocumentUpload folderId={folderId} onUploaded={afterChange} />
      ) : (
        <p className="notice">
          You're a viewer here, so you can read and ask questions but not upload.
        </p>
      )}

      {error && <p className="error" style={{ marginTop: 16 }}>{error}</p>}

      {loading ? (
        <p className="empty">Loading…</p>
      ) : visible.length === 0 ? (
        <p className="empty">
          {documents.length === 0
            ? activeFolder
              ? `Nothing in ${activeFolder.name} yet.`
              : "Nothing here yet. Upload a document to get started."
            : "No documents match that filter."}
        </p>
      ) : (
        <div className="doc-list" style={{ marginTop: 24 }}>
          {visible.map((doc) => (
            <DocumentRow
              key={doc.id}
              doc={doc}
              folders={folders}
              onChanged={afterChange}
            />
          ))}
        </div>
      )}
    </>
  );
}