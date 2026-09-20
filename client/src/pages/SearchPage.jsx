import { useState } from "react";
import { Link } from "react-router-dom";
import { search } from "../api/search.api.js";

const MODES = [
  ["hybrid", "Hybrid", "Keyword and meaning, merged by rank"],
  ["keyword", "Keyword", "Filenames and exact wording"],
  ["semantic", "Meaning", "Vector similarity only"],
];

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState("hybrid");
  const [results, setResults] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function run(e) {
    e.preventDefault();
    if (!query.trim()) return;
    setBusy(true);
    setError("");
    try {
      setResults(await search(query, mode));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Search</h1>
          <p>{MODES.find(([m]) => m === mode)[2]}.</p>
        </div>
      </div>

      <form className="row" onSubmit={run}>
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="refund window" />
        <select style={{ maxWidth: 150 }} value={mode} onChange={(e) => setMode(e.target.value)}>
          {MODES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        <button className="primary" type="submit" disabled={busy}>
          {busy ? "Searching…" : "Search"}
        </button>
      </form>

      {error && <p className="error">{error}</p>}

      {results && results.length === 0 && <p className="empty">No matches.</p>}

      <div className="results">
        {results?.map((hit, i) => {
          const id = hit.document_id || hit.id;
          return (
            <Link className="result" to={`/documents/${id}`} key={`${id}-${i}`}>
              <div className="spread">
                <strong>{hit.filename}</strong>
                <span className="why">
                  {hit.page_number ? `page ${hit.page_number}` : ""}
                  {hit.similarity ? ` · ${Math.round(hit.similarity * 100)}% match` : ""}
                  {hit.keyword_hit && hit.semantic_hit ? " · both" : ""}
                </span>
              </div>
              {(hit.snippet || hit.content) && (
                <p className="meta" style={{ margin: "4px 0 0" }}>
                  {(hit.snippet || hit.content).replace(/<<|>>/g, "").slice(0, 240)}…
                </p>
              )}
            </Link>
          );
        })}
      </div>
    </>
  );
}
