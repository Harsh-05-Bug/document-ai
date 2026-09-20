import client from "./axiosClient.js";

export const listDocuments = (params = {}) =>
  client.get("/documents", { params }).then((r) => r.data);

export const getDocument = (id) => client.get(`/documents/${id}`).then((r) => r.data);

export const getStatus = (id) => client.get(`/documents/${id}/status`).then((r) => r.data);

export const uploadDocument = (file, { folderId, category, onProgress } = {}) => {
  const form = new FormData();
  form.append("file", file);
  if (folderId) form.append("folderId", folderId);
  if (category) form.append("category", category);

  return client
    .post("/documents", form, {
      onUploadProgress: (e) =>
        onProgress?.(e.total ? Math.round((e.loaded / e.total) * 100) : 0),
    })
    .then((r) => r.data);
};

export const deleteDocument = (id) => client.delete(`/documents/${id}`);

export const summarizeDocument = (id, refresh = false) =>
  client.post(`/documents/${id}/summary`, null, { params: refresh ? { refresh: 1 } : {} })
    .then((r) => r.data);

export const addTags = (id, tags) =>
  client.post(`/documents/${id}/tags`, { tags }).then((r) => r.data);

export const shareDocument = (id, userId, permission) =>
  client.post(`/documents/${id}/share`, { userId, permission }).then((r) => r.data);

export const listPermissions = (id) =>
  client.get(`/documents/${id}/permissions`).then((r) => r.data);

/** The download route needs the bearer token, so fetch the bytes and
 *  hand the browser an object URL rather than a plain link. */
export const openDocument = async (id) => {
  const response = await client.get(`/documents/${id}/download`, { responseType: "blob" });
  const url = URL.createObjectURL(response.data);
  window.open(url, "_blank", "noopener");
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
};
