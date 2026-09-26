import client from "./axiosClient.js";

export const listFolders = () => client.get("/folders").then((r) => r.data);

export const createFolder = (name) =>
  client.post("/folders", { name }).then((r) => r.data);

export const deleteFolder = (id) => client.delete(`/folders/${id}`);

/** Move a document into a folder, or out of one by passing null. */
export const moveDocument = (documentId, folderId) =>
  client.patch(`/documents/${documentId}/folder`, { folderId }).then((r) => r.data);