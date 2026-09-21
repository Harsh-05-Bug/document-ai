import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { createSession, askQuestionStream } from "../../api/chat.api.js";
import SourceCitation from "./SourceCitation.jsx";
import RetrievalTrace from "./RetrievalTrace.jsx";

export default function ChatAssistant({ documentId, placeholder }) {
  const [sessionId, setSessionId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [question, setQuestion] = useState("");
  const [stage, setStage] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const logRef = useRef(null);

  useEffect(() => {
    createSession().then((s) => setSessionId(s.id)).catch((err) => setError(err.message));
  }, []);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, stage]);

  // Replace the last message (the answer being streamed) with a new version.
  function updateLastMessage(update) {
    setMessages((prev) => {
      const next = prev.slice();
      next[next.length - 1] = update(next[next.length - 1]);
      return next;
    });
  }

  async function ask(e) {
    e?.preventDefault();
    const text = question.trim();
    if (!text || !sessionId || busy) return;

    // Add the question plus an empty answer that fills in as text arrives.
    setMessages((prev) => [
      ...prev,
      { role: "user", content: text },
      { role: "assistant", content: "", sources: [], grounded: true, streaming: true },
    ]);
    setQuestion("");
    setError("");
    setBusy(true);

    // Embedding and searching aren't reported separately by the server,
    // so these first two stages are indicative. "generating" is real.
    setStage("embedding");
    const toSearching = setTimeout(
      () => setStage((current) => (current === "embedding" ? "searching" : current)),
      350
    );

    try {
      await askQuestionStream(sessionId, text, documentId, {
        onEvent: (event) => {
          if (event.type === "status") {
            setStage("generating");
          } else if (event.type === "delta") {
            // First words have arrived: the answer itself now shows progress.
            setStage(null);
            updateLastMessage((m) => ({ ...m, content: m.content + event.text }));
          } else if (event.type === "done") {
            updateLastMessage(() => ({ role: "assistant", ...event.message }));
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
                <ReactMarkdown>{message.content}</ReactMarkdown>
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
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="What is the annual leave policy?"
          disabled={!sessionId}
        />
        <button className="primary" type="submit" disabled={!question.trim() || busy}>
          Ask
        </button>
      </form>
    </div>
  );
}