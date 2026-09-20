import { useCallback, useEffect, useRef, useState } from "react";
import { listDocuments } from "../api/documents.api.js";

/**
 * Loads the document list and keeps polling while anything is still
 * being processed, so a freshly uploaded file flips to "ready" on its
 * own without the user refreshing.
 */
export function useDocuments(params = {}) {
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const timer = useRef(null);
  const key = JSON.stringify(params);

  const refresh = useCallback(async () => {
    try {
      setDocuments(await listDocuments(JSON.parse(key)));
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [key]);

  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => {
    clearTimeout(timer.current);
    if (documents.some((d) => d.status === "processing")) {
      timer.current = setTimeout(refresh, 3000);
    }
    return () => clearTimeout(timer.current);
  }, [documents, refresh]);

  return { documents, loading, error, refresh, setDocuments };
}
