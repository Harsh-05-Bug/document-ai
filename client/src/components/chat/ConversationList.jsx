import { useEffect, useRef, useState } from "react";

const formatWhen = (iso) => {
  const date = new Date(iso);
  const today = new Date();
  const sameDay = date.toDateString() === today.toDateString();
  return sameDay
    ? date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
    : date.toLocaleDateString([], { day: "numeric", month: "short" });
};

export default function ConversationList({ sessions, activeId, onSelect, onNew, onRename, onDelete }) {
  const [editingId, setEditingId] = useState(null);
  const [draft, setDraft] = useState("");
  const inputRef = useRef(null);

  useEffect(() => {
    if (editingId) inputRef.current?.select();
  }, [editingId]);

  function startEditing(session, e) {
    e.stopPropagation();
    setEditingId(session.id);
    setDraft(session.title || "");
  }

  function commit() {
    const title = draft.trim();
    if (title) onRename(editingId, title);
    setEditingId(null);
  }

  async function remove(session, e) {
    e.stopPropagation();
    if (!window.confirm(`Delete "${session.title || "this conversation"}"?`)) return;
    onDelete(session.id);
  }

  return (
    <div className="convo-list">
      <button className="new" type="button" onClick={onNew}>
        New conversation
      </button>

      {sessions.length > 0 && <div className="heading">Earlier</div>}

      {sessions.map((session) =>
        editingId === session.id ? (
          <input
            key={session.id}
            ref={inputRef}
            className="convo-edit"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter") commit();
              if (e.key === "Escape") setEditingId(null);
            }}
          />
        ) : (
          <div
            key={session.id}
            className={`convo ${session.id === activeId ? "active" : ""}`}
            onClick={() => onSelect(session.id)}
          >
            <span className="convo-title" title={session.title}>
              {session.title || "Untitled"}
              <span className="when">{formatWhen(session.created_at)}</span>
            </span>

            <span className="convo-actions">
              <button
                type="button"
                title="Rename"
                aria-label="Rename conversation"
                onClick={(e) => startEditing(session, e)}
              >
                ✎
              </button>
              <button
                type="button"
                title="Delete"
                aria-label="Delete conversation"
                onClick={(e) => remove(session, e)}
              >
                ×
              </button>
            </span>
          </div>
        )
      )}
    </div>
  );
}