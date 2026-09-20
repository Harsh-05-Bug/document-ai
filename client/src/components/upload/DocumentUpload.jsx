import { useRef, useState } from "react";
import { uploadDocument } from "../../api/documents.api.js";

const ACCEPT = ".pdf,.docx,.xlsx,.txt,.csv,.md";

export default function DocumentUpload({ folderId, onUploaded }) {
  const inputRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const [progress, setProgress] = useState(null);
  const [error, setError] = useState("");

  async function send(file) {
    if (!file) return;
    setError("");
    setProgress(0);
    try {
      const doc = await uploadDocument(file, { folderId, onProgress: setProgress });
      onUploaded?.(doc);
    } catch (err) {
      setError(err.message);
    } finally {
      setProgress(null);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div
      className={`dropzone${dragging ? " over" : ""}`}
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        send(e.dataTransfer.files[0]);
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        hidden
        onChange={(e) => send(e.target.files[0])}
      />

      {progress === null ? (
        <>
          <p>
            <strong>Drop a file here</strong> or{" "}
            <button className="quiet" onClick={() => inputRef.current?.click()}>browse</button>
          </p>
          <p style={{ margin: 0, fontSize: 13 }}>PDF, DOCX, XLSX, TXT, CSV or Markdown, up to 25 MB</p>
        </>
      ) : (
        <p style={{ margin: 0 }}>Uploading… {progress}%</p>
      )}

      {error && <p className="error" style={{ marginTop: 10 }}>{error}</p>}
    </div>
  );
}
