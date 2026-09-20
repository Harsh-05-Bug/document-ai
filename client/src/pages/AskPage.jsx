import ChatAssistant from "../components/chat/ChatAssistant.jsx";

export default function AskPage() {
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
      <ChatAssistant />
    </>
  );
}
