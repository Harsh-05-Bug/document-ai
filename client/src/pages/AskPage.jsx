import { useCallback, useEffect, useState } from "react";
import ChatAssistant from "../components/chat/ChatAssistant.jsx";
import ConversationList from "../components/chat/ConversationList.jsx";
import { listSessions, renameSession, deleteSession } from "../api/chat.api.js";

export default function AskPage() {
  const [sessions, setSessions] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [error, setError] = useState("");
  // Changing the key remounts the chat, which clears it for a new
  // conversation without needing a reset path inside the component.
  const [resetKey, setResetKey] = useState(0);

  const refresh = useCallback(
    () => listSessions().then(setSessions).catch(() => {}),
    []
  );

  useEffect(() => { refresh(); }, [refresh]);

  // Ctrl/Cmd+K starts a new conversation, the usual shortcut in chat apps.
  useEffect(() => {
    function onKeyDown(e) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setActiveId(null);
        setResetKey((n) => n + 1);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  function startNew() {
    setActiveId(null);
    setResetKey((n) => n + 1);
  }

  function openSession(id) {
    setActiveId(id);
    setResetKey((n) => n + 1);
  }

  async function rename(id, title) {
    // Update on screen first, then reconcile — renaming shouldn't feel
    // like it needs a round trip.
    setSessions((prev) => prev.map((s) => (s.id === id ? { ...s, title } : s)));
    try {
      await renameSession(id, title);
    } catch (err) {
      setError(err.message);
      refresh();
    }
  }

  async function remove(id) {
    const previous = sessions;
    setSessions((prev) => prev.filter((s) => s.id !== id));
    if (id === activeId) startNew();

    try {
      await deleteSession(id);
    } catch (err) {
      setError(err.message);
      setSessions(previous);
    }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Ask</h1>
          <p>
            Questions are answered only from documents you have permission to read —
            the search itself is filtered before anything reaches the model.
          </p>
        </div>
      </div>

      {error && <p className="error">{error}</p>}

      <div className="ask-layout">
        <ConversationList
          sessions={sessions}
          activeId={activeId}
          onSelect={openSession}
          onNew={startNew}
          onRename={rename}
          onDelete={remove}
        />

        <ChatAssistant
          key={resetKey}
          openSessionId={activeId}
          onSessionStart={(id) => {
            setActiveId(id);
            refresh();
          }}
        />
      </div>
    </>
  );
}