import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getOverview } from "../api/analytics.api.js";

const formatBytes = (bytes) => {
  if (!bytes) return "0 MB";
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
};

export default function DashboardPage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    getOverview().then(setData).catch((err) => setError(err.message));
  }, []);

  if (error) return <p className="error">{error}</p>;
  if (!data) return <p className="empty">Loading…</p>;

  const peak = Math.max(1, ...data.activity.map((d) => d.questions));

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Activity</h1>
          <p>Counts cover the documents you can access, and your own questions.</p>
        </div>
      </div>

      <div className="stats">
        <Stat value={data.total_documents} label="Documents" />
        <Stat value={formatBytes(data.total_storage_bytes)} label="Stored" />
        <Stat value={data.total_chunks} label="Indexed passages" />
        <Stat value={data.questions_asked} label="Questions asked" />
        <Stat value={data.unanswered_questions} label="Answered with no source" />
      </div>

      {data.processing > 0 && (
        <p className="notice" style={{ marginTop: 12 }}>
          {data.processing} document{data.processing > 1 ? "s" : ""} still indexing
          {data.failed > 0 ? `, ${data.failed} failed` : ""}.
        </p>
      )}

      <div className="columns">
        <div className="panel">
          <h3>Most opened</h3>
          {data.top_documents.length === 0 ? (
            <p className="notice">Nothing opened yet.</p>
          ) : (
            <ol>
              {data.top_documents.map((doc) => (
                <li key={doc.id}>
                  <Link to={`/documents/${doc.id}`}>{doc.filename}</Link>{" "}
                  <span className="meta">{doc.views}</span>
                </li>
              ))}
            </ol>
          )}
        </div>

        <div className="panel">
          <h3>Questions people repeat</h3>
          {data.top_questions.length === 0 ? (
            <p className="notice">No questions yet.</p>
          ) : (
            <ol>
              {data.top_questions.map((q) => (
                <li key={q.question}>{q.question} <span className="meta">×{q.times_asked}</span></li>
              ))}
            </ol>
          )}
        </div>

        <div className="panel">
          <h3>By category</h3>
          <div className="bars">
            {data.categories.map((c) => (
              <div className="bar" key={c.category}>
                <span>{c.category}</span>
                <div className="track">
                  <div className="fill" style={{ width: `${(c.documents / data.total_documents) * 100}%` }} />
                </div>
                <span className="meta">{c.documents}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="panel">
          <h3>Questions over the last fortnight</h3>
          <div className="bars">
            {data.activity.map((d) => (
              <div className="bar" key={d.day}>
                <span className="meta">{d.day.slice(5)}</span>
                <div className="track">
                  <div className="fill" style={{ width: `${(d.questions / peak) * 100}%` }} />
                </div>
                <span className="meta">{d.questions}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

function Stat({ value, label }) {
  return (
    <div className="stat">
      <div className="value">{value}</div>
      <div className="label">{label}</div>
    </div>
  );
}
