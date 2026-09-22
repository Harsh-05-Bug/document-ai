import { useCallback, useEffect, useState } from "react";
import ChatAssistant from "../components/chat/ChatAssistant.jsx";
import ConversationList from "../components/chat/ConversationList.jsx";
import { listSessions } from "../api/chat.api.js";

export default function AskPage() {
  const [sessions, setSessions] = useState([]);
  const [activeId, setActiveId] = useState(null);
  // Changing the key remounts the chat, which clears it for a new
  // conversation without needing a reset path inside the component.
  const [resetKey, setResetKey] = useState(0);

  const refresh = useCallback(
    () => listSessions().then(setSessions).catch(() => {}),
    []
  );

  useEffect(() => { refresh(); }, [refresh]);

  function startNew() {
    setActiveId(null);
    setResetKey((n) => n + 1);
  }

  function openSession(id) {
    setActiveId(id);
    setResetKey((n) => n + 1);
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

      <div className="ask-layout">
        <ConversationList
          sessions={sessions}
          activeId={activeId}
          onSelect={openSession}
          onNew={startNew}
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