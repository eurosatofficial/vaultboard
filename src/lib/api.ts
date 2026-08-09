import type { ApiErrorData } from "../types";

let csrfToken = "";

export class ApiError extends Error {
  status: number;
  code: string;
  details?: ApiErrorData["details"];

  constructor(status: number, data: ApiErrorData) {
    super(data.error || "Request failed");
    this.name = "ApiError";
    this.status = status;
    this.code = data.code;
    this.details = data.details;
  }
}

export function setCsrfToken(token: string) {
  csrfToken = token;
}

export async function api<T>(url: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set("Accept", "application/json");
  headers.set("X-Vaultboard-Request", "1");
  if (options.body) headers.set("Content-Type", "application/json");
  if (csrfToken && options.method && !["GET", "HEAD"].includes(options.method)) {
    headers.set("X-CSRF-Token", csrfToken);
  }

  const response = await fetch(url, { ...options, headers, credentials: "same-origin" });
  if (response.status === 204) return undefined as T;
  const data = await response.json().catch(() => ({ error: "Unexpected server response", code: "INVALID_RESPONSE" }));
  if (!response.ok) throw new ApiError(response.status, data as ApiErrorData);
  return data as T;
}

export const jsonBody = (value: unknown) => JSON.stringify(value);
