import { useState } from "react";
import { useAuth } from "../../context/AuthContext.jsx";
import { createFolder, deleteFolder } from "../../api/folders.api.js";

/**
 * Folders as a filter strip above the document list.
 *
 * Flat, not nested: "Week 1" and "Assignments" cover what a class or a
 * team actually needs, and a tree would bring breadcrumbs, moves
 * between levels and orphan handling for very little more.
 */
export default function FolderBar({ folders, activeId, onSelect, onChanged }) {
  const { role } = useAuth();
  const [error, setError] = useState("");

  const canEdit = role === "owner" || role === "admin" || role === "member";

  async function add() {
    const name = window.prompt("Folder name");
    if (!name?.trim()) return;

    setError("");
    try {
      await createFolder(name.trim());
      onChanged?.();
    } catch (err) {
      setError(err.message);
    }
  }

  async function remove(folder, e) {
    e.stopPropagation();
    if (!confirm(
      `Delete "${folder.name}"? The documents in it stay — they move back to the top level.`
    )) return;

    setError("");
    try {
      await deleteFolder(folder.id);
      if (folder.id === activeId) onSelect(null);
      onChanged?.();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="folder-bar">
      <button
        type="button"
        className={`folder ${!activeId ? "active" : ""}`}
        onClick={() => onSelect(null)}
      >
        All documents
      </button>

      {folders.map((folder) => (
        <span
          key={folder.id}
          className={`folder ${folder.id === activeId ? "active" : ""}`}
          onClick={() => onSelect(folder.id)}
        >
          {folder.name}
          <span className="count">{folder.document_count}</span>
          {canEdit && (
            <button
              type="button"
              className="folder-remove"
              title={`Delete ${folder.name}`}
              aria-label={`Delete ${folder.name}`}
              onClick={(e) => remove(folder, e)}
            >
              ×
            </button>
          )}
        </span>
      ))}

      {canEdit && (
        <button type="button" className="folder new" onClick={add}>
          + New folder
        </button>
      )}

      {error && <p className="error" style={{ width: "100%", margin: "6px 0 0" }}>{error}</p>}
    </div>
  );
}