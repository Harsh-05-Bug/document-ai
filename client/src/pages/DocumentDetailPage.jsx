import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import ChatAssistant from "../components/chat/ChatAssistant.jsx";
import StatusPill from "../components/common/StatusPill.jsx";
import {
  getDocument, summarizeDocument, deleteDocument,
  shareDocument, listPermissions, openDocument,
} from "../api/documents.api.js";
import { listUsers } from "../api/auth.api.js";

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

  async function summarise() {
    setSummarising(true);
    setError("");
    try {
      const result = await summarizeDocument(id);
      setSummary(result.summary);
    } catch (err) {
      setError(err.message);
    } finally {
      setSummarising(false);
    }
  }

  async function remove() {
    if (!confirm(`Delete ${doc.filename}? Its indexed passages go too.`)) return;
    await deleteDocument(id);
    navigate("/documents");
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
        <button onClick={summarise} disabled={summarising || doc.status !== "ready"}>
          {summarising ? "Summarising…" : summary ? "Regenerate summary" : "Summarise"}
        </button>
        <button type="button" onClick={() => openDocument(id).catch((e) => setError(e.message))}>
          Open original
        </button>
        {canManage && <button onClick={remove}>Delete</button>}
      </div>

      {error && <p className="error">{error}</p>}

      {summary && (
        <div className="panel" style={{ marginBottom: 24, whiteSpace: "pre-wrap" }}>
          <h3>Summary</h3>
          {summary}
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

function SharePanel({ documentId }) {
  const [users, setUsers] = useState([]);
  const [grants, setGrants] = useState([]);
  const [form, setForm] = useState({ userId: "", permission: "view" });
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([listUsers(), listPermissions(documentId)])
      .then(([u, g]) => { setUsers(u); setGrants(g); })
      .catch((err) => setError(err.message));
  }, [documentId]);

  async function submit(e) {
    e.preventDefault();
    if (!form.userId) return;
    try {
      await shareDocument(documentId, form.userId, form.permission);
      setGrants(await listPermissions(documentId));
      setForm({ userId: "", permission: "view" });
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="panel">
      <h3>Who can see this</h3>

      {grants.length === 0
        ? <p className="notice">Only you and administrators, for now.</p>
        : (
          <ul style={{ listStyle: "none", padding: 0, marginBottom: 14 }}>
            {grants.map((g) => (
              <li key={g.id} className="spread">
                <span>{g.name || g.email}</span>
                <span className="meta">{g.permission}</span>
              </li>
            ))}
          </ul>
        )}

      <form className="row" onSubmit={submit}>
        <select value={form.userId} onChange={(e) => setForm({ ...form, userId: e.target.value })}>
          <option value="">Choose a colleague…</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>{u.name || u.email}</option>
          ))}
        </select>
        <select
          style={{ maxWidth: 150 }}
          value={form.permission}
          onChange={(e) => setForm({ ...form, permission: e.target.value })}
        >
          {["view", "comment", "download", "edit", "admin"].map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
        <button className="primary" type="submit">Share</button>
      </form>

      {error && <p className="error">{error}</p>}
    </div>
  );
}
