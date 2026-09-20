import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { createSession, askQuestion } from "../../api/chat.api.js";
import SourceCitation from "./SourceCitation.jsx";
import RetrievalTrace from "./RetrievalTrace.jsx";

export default function ChatAssistant({ documentId, placeholder }) {
  const [sessionId, setSessionId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [question, setQuestion] = useState("");
  const [stage, setStage] = useState(null);
  const [error, setError] = useState("");
  const logRef = useRef(null);

  useEffect(() => {
    createSession().then((s) => setSessionId(s.id)).catch((err) => setError(err.message));
  }, []);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, stage]);

  async function ask(e) {
    e?.preventDefault();
    const text = question.trim();
    if (!text || !sessionId || stage) return;

    setMessages((prev) => [...prev, { role: "user", content: text }]);
    setQuestion("");
    setError("");

    // The stages are indicative: the server does all three in one call.
    setStage("embedding");
    const toSearching = setTimeout(() => setStage("searching"), 350);
    const toGenerating = setTimeout(() => setStage("generating"), 1400);

    try {
      const reply = await askQuestion(sessionId, text, documentId);
      setMessages((prev) => [...prev, { role: "assistant", ...reply }]);
    } catch (err) {
      setError(err.message);
    } finally {
      clearTimeout(toSearching);
      clearTimeout(toGenerating);
      setStage(null);
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

        {messages.map((message, i) =>
          message.role === "user" ? (
            <div className="turn user" key={i}>{message.content}</div>
          ) : (
            <div className="turn assistant" key={i}>
              <div className={message.grounded ? "answer" : "answer ungrounded"}>
                <ReactMarkdown>{message.content}</ReactMarkdown>
              </div>
              <SourceCitation sources={message.sources} />
              {!message.grounded && (
                <p className="notice" style={{ marginTop: 8 }}>
                  Nothing in your documents matched closely enough to answer this. Try
                  different wording, or upload the document that covers it.
                </p>
              )}
            </div>
          )
        )}

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
        <button className="primary" type="submit" disabled={!question.trim() || !!stage}>
          Ask
        </button>
      </form>
    </div>
  );
}