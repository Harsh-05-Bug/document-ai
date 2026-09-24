import { useRef, useState } from "react";
import { uploadDocument } from "../../api/documents.api.js";

const ACCEPT = ".pdf,.docx,.xlsx,.txt,.csv,.md";

export default function DocumentUpload({ folderId, onUploaded }) {
  const inputRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const [queue, setQueue] = useState([]);   // { name, status, progress, error }
  const [busy, setBusy] = useState(false);

  /**
   * Uploads run one at a time on purpose. Firing them in parallel would
   * trip the server's rate limit and start several ingestions at once;
   * sequential is slower but predictable, and each file reports its own
   * progress. A failure is recorded and the queue continues.
   */
  async function send(files) {
    const list = Array.from(files || []).filter(Boolean);
    if (!list.length || busy) return;

    setBusy(true);
    setQueue(list.map((f) => ({ name: f.name, status: "waiting", progress: 0 })));

    for (let i = 0; i < list.length; i++) {
      setQueue((prev) => prev.map((item, n) => (n === i ? { ...item, status: "uploading" } : item)));

      try {
        const doc = await uploadDocument(list[i], {
          folderId,
          onProgress: (progress) =>
            setQueue((prev) => prev.map((item, n) => (n === i ? { ...item, progress } : item))),
        });
        setQueue((prev) => prev.map((item, n) => (n === i ? { ...item, status: "done" } : item)));
        onUploaded?.(doc);
      } catch (err) {
        setQueue((prev) =>
          prev.map((item, n) => (n === i ? { ...item, status: "failed", error: err.message } : item))
        );
      }
    }

    setBusy(false);
    if (inputRef.current) inputRef.current.value = "";

    // Leave failures on screen; clear a clean run after a moment.
    setQueue((prev) => (prev.some((item) => item.status === "failed") ? prev : []));
  }

  const done = queue.filter((item) => item.status === "done").length;

  return (
    <div
      className={`dropzone${dragging ? " over" : ""}`}
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        send(e.dataTransfer.files);
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        multiple
        hidden
        onChange={(e) => send(e.target.files)}
      />

      {!busy && queue.length === 0 ? (
        <>
          <p>
            <strong>Drop files here</strong> or{" "}
            <button className="quiet" type="button" onClick={() => inputRef.current?.click()}>
              browse
            </button>
          </p>
          <p style={{ margin: 0, fontSize: 13 }}>
            PDF, DOCX, XLSX, TXT, CSV or Markdown, up to 25 MB each
          </p>
        </>
      ) : (
        <div className="upload-queue">
          {queue.length > 1 && (
            <p className="queue-head">
              {busy ? `Uploading ${done + 1} of ${queue.length}` : `${done} of ${queue.length} uploaded`}
            </p>
          )}

          {queue.map((item, i) => (
            <div className={`queue-item ${item.status}`} key={`${item.name}-${i}`}>
              <span className="queue-name" title={item.name}>{item.name}</span>
              <span className="queue-state">
                {item.status === "waiting" && "waiting"}
                {item.status === "uploading" && `${item.progress}%`}
                {item.status === "done" && "✓"}
                {item.status === "failed" && (item.error || "failed")}
              </span>
            </div>
          ))}

          {!busy && queue.some((item) => item.status === "failed") && (
            <button className="quiet" type="button" onClick={() => setQueue([])}>
              Dismiss
            </button>
          )}
        </div>
      )}
    </div>
  );
}