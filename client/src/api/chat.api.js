import client from "./axiosClient.js";

export const createSession = (title) =>
  client.post("/chat/sessions", { title }).then((r) => r.data);

export const listSessions = () => client.get("/chat/sessions").then((r) => r.data);

export const getSession = (id) => client.get(`/chat/sessions/${id}`).then((r) => r.data);

export const askQuestion = (sessionId, question, documentId) =>
  client.post(`/chat/sessions/${sessionId}/messages`, { question, documentId })
    .then((r) => r.data);
