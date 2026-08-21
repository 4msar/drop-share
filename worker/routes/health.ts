import { jsonOk } from "../lib/http.js";

export function handleHealth(): Response {
  return jsonOk({ status: "ok" });
}
