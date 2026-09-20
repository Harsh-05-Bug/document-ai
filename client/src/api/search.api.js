import client from "./axiosClient.js";

export const search = (q, mode = "hybrid") => {
  const path = mode === "hybrid" ? "/search/hybrid" : mode === "semantic" ? "/search/semantic" : "/search";
  return client.get(path, { params: { q } }).then((r) => r.data);
};
