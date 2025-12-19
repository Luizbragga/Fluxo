// src/lib/api-client.ts

export type ApiClientOptions = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown; // pode ser objeto OU string (vamos tratar)
  // no futuro a gente pode adicionar query params tipados aqui também
};

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/v1";

function getAuthToken() {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("fluxo_token");
}

export async function apiClient<T>(
  path: string,
  options: ApiClientOptions = {}
): Promise<T> {
  const url = `${API_BASE_URL}${path}`;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  const token = getAuthToken();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  // ✅ aqui é o ajuste: se o body já for string, não stringify de novo
  const body =
    options.body === undefined
      ? undefined
      : typeof options.body === "string"
      ? options.body
      : JSON.stringify(options.body);

  const res = await fetch(url, {
    method: options.method ?? "GET",
    headers,
    body,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `API error ${res.status} ${res.statusText}${
        text ? `: ${text.substring(0, 200)}` : ""
      }`
    );
  }

  return (await res.json()) as T;
}
