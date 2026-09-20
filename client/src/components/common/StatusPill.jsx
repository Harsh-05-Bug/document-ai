const COPY = {
  ready: "Ready",
  processing: "Indexing",
  failed: "Failed",
};

export default function StatusPill({ status, chunks }) {
  return (
    <span className={`pill ${status}`} title={status === "ready" && chunks ? `${chunks} chunks indexed` : ""}>
      {COPY[status] || status}
    </span>
  );
}
