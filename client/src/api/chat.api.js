import client from "./axiosClient.js";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:4000/api";

export const createSession = (title) =>
  client.post("/chat/sessions", { title }).then((r) => r.data);

export const listSessions = () => client.get("/chat/sessions").then((r) => r.data);

export const getSession = (id) => client.get(`/chat/sessions/${id}`).then((r) => r.data);

export const renameSession = (id, title) =>
  client.patch(`/chat/sessions/${id}`, { title }).then((r) => r.data);

export const deleteSession = (id) => client.delete(`/chat/sessions/${id}`);

export const askQuestion = (sessionId, question, documentId) =>
  client.post(`/chat/sessions/${sessionId}/messages`, { question, documentId })
    .then((r) => r.data);

/**
 * Streaming version of askQuestion. Calls onEvent for each event:
 *   { type: "status", stage }   retrieval done, the answer is being written
 *   { type: "delta", text }     a piece of the answer
 *   { type: "done", message }   the saved message, with sources
 *
 * Uses fetch rather than axios because axios can't read a response
 * body incrementally in the browser. It repeats the two things the axios
 * interceptors do for every other call: attach the token, and send the
 * user to login when it has expired.
 */
export async function askQuestionStream(sessionId, question, documentId, { onEvent }) {
  const token = localStorage.getItem("token");

  const res = await fetch(`${API_URL}/chat/sessions/${sessionId}/messages/stream`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ question, documentId }),
  });

  if (res.status === 401) {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    window.location.assign("/login");
    throw new Error("Your session has expired. Please sign in again.");
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed (${res.status})`);
  }

  // Server-Sent Events: each event is one or more "data: ..." lines
  // followed by a blank line. Buffer until an event is complete.
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    let boundary;
    while ((boundary = buffer.indexOf("\n\n")) !== -1) {
      const raw = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);

      const data = raw
        .split("\n")
        .filter((line) => line.startsWith("data: "))
        .map((line) => line.slice(6))
        .join("\n");
      if (!data) continue;

      const event = JSON.parse(data);
      if (event.type === "error") throw new Error(event.message);
      onEvent(event);
    }
  }
}