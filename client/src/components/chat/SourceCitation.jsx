import { Link } from "react-router-dom";

/**
 * Citations are the answer to "why should I trust this?" — so they show
 * the file, the page, and the exact passage the model was given.
 */
export default function SourceCitation({ sources }) {
  if (!sources?.length) return null;

  return (
    <div className="sources">
      <div className="label">
        {sources.length === 1 ? "Source" : `${sources.length} sources`}
      </div>

      {sources.map((source) => (
        <div className="source" key={source.index ?? source.chunk_id}>
          <Link className="file" to={`/documents/${source.document_id}`}>
            [{source.index}] {source.filename}
          </Link>
          <span className="page">
            {source.page ? `page ${source.page}` : "whole document"}
            {source.similarity ? ` · ${Math.round(source.similarity * 100)}% match` : ""}
          </span>
          {source.snippet && <p className="snippet">{source.snippet}…</p>}
        </div>
      ))}
    </div>
  );
}
