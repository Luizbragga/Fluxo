// src/lib/api-client.ts

export type ApiClientOptions = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
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

  const res = await fetch(url, {
    method: options.method ?? "GET",
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  if (!res.ok) {
    // aqui depois podemos tratar 401, 403, etc.
    const text = await res.text().catch(() => "");
    throw new Error(
      `API error ${res.status} ${res.statusText}${
        text ? `: ${text.substring(0, 200)}` : ""
      }`
    );
  }

  return (await res.json()) as T;
}
