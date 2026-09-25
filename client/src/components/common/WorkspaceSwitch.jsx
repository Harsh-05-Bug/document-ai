import { useEffect, useRef, useState } from "react";
import { useAuth } from "../../context/AuthContext.jsx";
import { createWorkspace } from "../../api/workspaces.api.js";

export default function WorkspaceSwitch() {
  const { workspaces, workspaceId, workspace, switchWorkspace, refreshWorkspaces } = useAuth();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const ref = useRef(null);

  // Close when the click lands anywhere else, or on Escape.
  useEffect(() => {
    if (!open) return;

    function onPointerDown(e) {
      if (!ref.current?.contains(e.target)) setOpen(false);
    }
    function onKeyDown(e) {
      if (e.key === "Escape") setOpen(false);
    }

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  async function makeWorkspace() {
    const name = window.prompt("Name your new workspace");
    if (!name?.trim()) return;

    setError("");
    try {
      const created = await createWorkspace(name.trim());
      await refreshWorkspaces();
      switchWorkspace(created.id);
      setOpen(false);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="workspace-switch" ref={ref}>
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <span className="name">
          {workspace?.name || "No workspace"}
          <span className="role">{workspace?.role || ""}</span>
        </span>
        <span className="caret">▾</span>
      </button>

      {open && (
        <div className="workspace-menu">
          {workspaces.map((w) => (
            <button
              key={w.id}
              type="button"
              className={w.id === workspaceId ? "active" : ""}
              onClick={() => { switchWorkspace(w.id); setOpen(false); }}
            >
              {w.name}
              <span className="role"> · {w.role}</span>
            </button>
          ))}

          <div className="divider" />
          <button type="button" className="new" onClick={makeWorkspace}>
            New workspace
          </button>
        </div>
      )}

      {error && <p className="error" style={{ marginTop: 6 }}>{error}</p>}
    </div>
  );
}