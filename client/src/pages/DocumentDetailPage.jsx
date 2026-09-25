import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import ChatAssistant from "../components/chat/ChatAssistant.jsx";
import StatusPill from "../components/common/StatusPill.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import {
  getDocument, summarizeDocument, deleteDocument,
  shareDocument, listPermissions, revokePermission, openDocument,
} from "../api/documents.api.js";
import { listPeople } from "../api/workspaces.api.js";

export default function DocumentDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [doc, setDoc] = useState(null);
  const [summary, setSummary] = useState("");
  const [summarising, setSummarising] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    getDocument(id)
      .then((d) => { setDoc(d); setSummary(d.summary || ""); })
      .catch((err) => setError(err.message));
  }, [id]);

  /** refresh=true asks for a new summary instead of the stored one. */
  async function summarise(refresh = false) {
    setSummarising(true);
    setError("");
    try {
      const result = await summarizeDocument(id, refresh);
      setSummary(result.summary);
    } catch (err) {
      setError(err.message);
    } finally {
      setSummarising(false);
    }
  }

  async function remove() {
    if (!confirm(`Delete ${doc.filename}? Its indexed passages go too.`)) return;
    try {
      await deleteDocument(id);
      navigate("/documents");
    } catch (err) {
      setError(err.message);
    }
  }

  if (error && !doc) return <p className="error">{error}</p>;
  if (!doc) return <p className="empty">Loading…</p>;

  const canManage = doc.permission === "admin";

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{doc.filename}</h1>
          <p>
            Uploaded by {doc.owner_email} on {new Date(doc.created_at).toLocaleDateString()}
            {doc.page_count ? ` · ${doc.page_count} pages` : ""}
            {doc.chunk_count ? ` · ${doc.chunk_count} indexed passages` : ""}
          </p>
        </div>
        <StatusPill status={doc.status} chunks={doc.chunk_count} />
      </div>

      <div className="row" style={{ marginBottom: 24 }}>
        <button onClick={() => summarise(!!summary)} disabled={summarising || doc.status !== "ready"}>
          {summarising ? "Summarising…" : summary ? "Regenerate summary" : "Summarise"}
        </button>
        <button type="button" onClick={() => openDocument(id).catch((e) => setError(e.message))}>
          Open original
        </button>
        {canManage && <button className="danger-outline" onClick={remove}>Delete</button>}
      </div>

      {error && <p className="error">{error}</p>}

      {summarising && !summary && (
        <p className="notice" style={{ marginBottom: 24 }}>
          Reading the whole document — this takes longer than a question, since every
          passage is summarised and then merged.
        </p>
      )}

      {summary && (
        <div className="panel summary" style={{ marginBottom: 24 }}>
          <h3>Summary</h3>
          <ReactMarkdown>{summary}</ReactMarkdown>
        </div>
      )}

      {canManage && <SharePanel documentId={id} />}

      <h2 style={{ margin: "28px 0 12px" }}>Ask this document</h2>
      <ChatAssistant
        documentId={id}
        placeholder="Questions here search only this document."
      />
    </>
  );
}

/**
 * Extra permissions on one document.
 *
 * Everyone in the workspace can already read it — that's what a shared
 * space means. This panel grants more than that: edit, download, admin.
 * The picker lists workspace members only, since granting access to an
 * outsider would be a path around the workspace boundary.
 */
function SharePanel({ documentId }) {
  const { workspaceId } = useAuth();
  const [people, setPeople] = useState([]);
  const [grants, setGrants] = useState([]);
  const [form, setForm] = useState({ userId: "", permission: "edit" });
  const [error, setError] = useState("");

  useEffect(() => {
    if (!workspaceId) return;
    Promise.all([listPeople(workspaceId), listPermissions(documentId)])
      .then(([p, g]) => { setPeople(p); setGrants(g); })
      .catch((err) => setError(err.message));
  }, [documentId, workspaceId]);

  async function submit(e) {
    e.preventDefault();
    if (!form.userId) return;
    try {
      await shareDocument(documentId, form.userId, form.permission);
      setGrants(await listPermissions(documentId));
      setForm({ userId: "", permission: "edit" });
      setError("");
    } catch (err) {
      setError(err.message);
    }
  }

  async function revoke(grant) {
    if (!confirm(`Remove ${grant.name || grant.email}'s extra access?`)) return;

    const previous = grants;
    setGrants((prev) => prev.filter((g) => g.id !== grant.id));
    try {
      await revokePermission(documentId, grant.user_id);
    } catch (err) {
      setError(err.message);
      setGrants(previous);
    }
  }

  // Someone who already has a grant shouldn't appear in the picker.
  const available = people.filter((p) => !grants.some((g) => g.user_id === p.id));

  return (
    <div className="panel">
      <h3>Extra access</h3>
      <p className="notice">
        Everyone in this workspace can already read this document. Grant more here.
      </p>

      {grants.length > 0 && (
        <ul className="grant-list">
          {grants.map((g) => (
            <li key={g.id} className="spread">
              <span>{g.name || g.email}</span>
              <span className="row">
                <span className="meta">{g.permission}</span>
                <button
                  className="quiet"
                  type="button"
                  title="Remove extra access"
                  aria-label={`Remove extra access for ${g.name || g.email}`}
                  onClick={() => revoke(g)}
                >
                  ×
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}

      <form className="row" onSubmit={submit}>
        <select value={form.userId} onChange={(e) => setForm({ ...form, userId: e.target.value })}>
          <option value="">Choose someone…</option>
          {available.map((p) => (
            <option key={p.id} value={p.id}>{p.name || p.email}</option>
          ))}
        </select>
        <select
          style={{ maxWidth: 150 }}
          value={form.permission}
          onChange={(e) => setForm({ ...form, permission: e.target.value })}
        >
          {["comment", "download", "edit", "admin"].map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
        <button className="primary" type="submit" disabled={!form.userId}>Grant</button>
      </form>

      {error && <p className="error">{error}</p>}
    </div>
  );
}