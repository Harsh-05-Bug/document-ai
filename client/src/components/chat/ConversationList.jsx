const formatWhen = (iso) => {
  const date = new Date(iso);
  const today = new Date();
  const sameDay = date.toDateString() === today.toDateString();
  return sameDay
    ? date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
    : date.toLocaleDateString([], { day: "numeric", month: "short" });
};

export default function ConversationList({ sessions, activeId, onSelect, onNew }) {
  return (
    <div className="convo-list">
      <button className="new" type="button" onClick={onNew}>
        New conversation
      </button>

      {sessions.length > 0 && <div className="heading">Earlier</div>}

      {sessions.map((session) => (
        <button
          key={session.id}
          type="button"
          className={`convo ${session.id === activeId ? "active" : ""}`}
          title={session.title}
          onClick={() => onSelect(session.id)}
        >
          {session.title || "Untitled"}
          <span className="when">{formatWhen(session.created_at)}</span>
        </button>
      ))}
    </div>
  );
}