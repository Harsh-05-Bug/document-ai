import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { createSession, getSession, askQuestionStream } from "../../api/chat.api.js";
import SourceCitation from "./SourceCitation.jsx";
import RetrievalTrace from "./RetrievalTrace.jsx";

/**
 * openSessionId  – load this existing conversation (null = a new one)
 * onSessionStart – called with the id when a new conversation is created,
 *                  so the list outside can refresh and highlight it
 */
export default function ChatAssistant({ documentId, placeholder, openSessionId, onSessionStart }) {
  const [sessionId, setSessionId] = useState(openSessionId || null);
  const [messages, setMessages] = useState([]);
  const [question, setQuestion] = useState("");
  const [stage, setStage] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const logRef = useRef(null);

  // Load an existing conversation, or clear the board for a new one.
  useEffect(() => {
    setSessionId(openSessionId || null);
    setError("");

    if (!openSessionId) {
      setMessages([]);
      return;
    }

    let cancelled = false;
    getSession(openSessionId)
      .then((session) => {
        if (cancelled) return;
        setMessages(
          session.messages.map((m) => ({
            role: m.role,
            content: m.content,
            sources: m.sources || [],
            grounded: (m.sources || []).length > 0,
          }))
        );
      })
      .catch((err) => !cancelled && setError(err.message));

    // Switching conversations quickly shouldn't let an older response
    // land after a newer one.
    return () => { cancelled = true; };
  }, [openSessionId]);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, stage]);

  /**
   * Replace the answer currently being streamed.
   *
   * A late event can arrive after the placeholder has been removed — for
   * instance when the request failed and the half-written answer was
   * dropped. Updating nothing is the correct response; crashing is not.
   */
  function updateStreamingMessage(update) {
    setMessages((prev) => {
      const last = prev[prev.length - 1];
      if (!last?.streaming) return prev;

      const next = prev.slice();
      next[next.length - 1] = update(last);
      return next;
    });
  }

  async function ask(e) {
    e?.preventDefault();
    const text = question.trim();
    if (!text || busy) return;

    setQuestion("");
    setError("");
    setBusy(true);

    // Add the question plus an empty answer that fills in as text arrives.
    setMessages((prev) => [
      ...prev,
      { role: "user", content: text },
      { role: "assistant", content: "", sources: [], grounded: true, streaming: true },
    ]);

    // Embedding and searching aren't reported separately by the server,
    // so these first two stages are indicative. "generating" is real.
    setStage("embedding");
    const toSearching = setTimeout(
      () => setStage((current) => (current === "embedding" ? "searching" : current)),
      350
    );

    try {
      // Conversations are created on the first question, not on page
      // load, so browsing the app doesn't leave empty ones behind.
      let id = sessionId;
      if (!id) {
        const session = await createSession();
        id = session.id;
        setSessionId(id);
        onSessionStart?.(id);
      }

      await askQuestionStream(id, text, documentId, {
        onEvent: (event) => {
          if (event.type === "status") {
            setStage("generating");
          } else if (event.type === "delta") {
            // First words have arrived: the answer itself now shows progress.
            setStage(null);
            updateStreamingMessage((m) => ({ ...m, content: m.content + event.text }));
          } else if (event.type === "done") {
            updateStreamingMessage(() => ({ role: "assistant", ...event.message }));
            onSessionStart?.(id);
          }
        },
      });
    } catch (err) {
      setError(err.message);
      // Drop a half-written answer rather than leave it looking complete.
      setMessages((prev) => (prev.at(-1)?.streaming ? prev.slice(0, -1) : prev));
    } finally {
      clearTimeout(toSearching);
      setStage(null);
      setBusy(false);
    }
  }

  return (
    <div className="chat">
      <div className="chat-log" ref={logRef}>
        {messages.length === 0 && !stage && (
          <p className="notice">
            {placeholder || "Ask anything that's covered by the documents you can access. Answers come back with the file and page they came from."}
          </p>
        )}

        {messages.map((message, i) => {
          if (message.role === "user") {
            return <div className="turn user" key={i}>{message.content}</div>;
          }

          // Nothing to show until the first words arrive; the trace covers the wait.
          if (message.streaming && !message.content) return null;

          return (
            <div className="turn assistant" key={i}>
              <div className={message.grounded ? "answer" : "answer ungrounded"}>
                <ReactMarkdown>{message.content || ""}</ReactMarkdown>
              </div>

              {!message.streaming && (
                <>
                  <SourceCitation sources={message.sources} />
                  {!message.grounded && (
                    <p className="notice" style={{ marginTop: 8 }}>
                      Nothing in your documents matched closely enough to answer this. Try
                      different wording, or upload the document that covers it.
                    </p>
                  )}
                </>
              )}
            </div>
          );
        })}

        {stage && <RetrievalTrace stage={stage} />}
        {error && <p className="error">{error}</p>}
      </div>

      <form className="composer" onSubmit={ask}>
        <textarea
          rows={1}
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => {
            // Enter sends; Shift+Enter starts a new line, as in most chat apps.
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              ask(e);
            }
          }}
          placeholder="What is the annual leave policy?"
          disabled={busy}
        />
        <button className="primary" type="submit" disabled={!question.trim() || busy}>
          Ask
        </button>
      </form>
    </div>
  );
}