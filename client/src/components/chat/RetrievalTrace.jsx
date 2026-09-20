/**
 * Shows the RAG pipeline while it runs instead of a generic spinner.
 * The stages are real: embed the question, search the vector index,
 * then generate from what came back.
 */
export default function RetrievalTrace({ stage }) {
  const steps = [
    ["embedding", "Reading your question"],
    ["searching", "Searching the knowledge base"],
    ["generating", "Writing an answer from the passages found"],
  ];
  const current = steps.findIndex(([key]) => key === stage);

  return (
    <div className="trace">
      {steps.map(([key, label], i) => (
        <div key={key} className={`step ${i < current ? "done" : i === current ? "active" : ""}`}>
          {i <= current ? label : ""}
        </div>
      ))}
    </div>
  );
}
