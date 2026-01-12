// server/web/src/lib/api-client.ts

export type ApiClientOptions = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown; // pode ser objeto OU string (vamos tratar)
  headers?: Record<string, string>; // permite headers extras (ex.: reauth) sem refatorar depois
};

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/v1";

function getAuthToken() {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("fluxo_token");
}

export class ApiError extends Error {
  status: number;
  statusText: string;
  code?: string;
  details?: unknown;

  constructor(args: {
    status: number;
    statusText: string;
    message: string;
    code?: string;
    details?: unknown;
  }) {
    super(args.message);
    this.name = "ApiError";
    this.status = args.status;
    this.statusText = args.statusText;
    this.code = args.code;
    this.details = args.details;
  }
}

async function readErrorPayload(res: Response): Promise<{
  message: string;
  code?: string;
  details?: unknown;
}> {
  const contentType = res.headers.get("content-type") ?? "";

  // tenta JSON primeiro quando o backend sinaliza JSON
  if (contentType.includes("application/json")) {
    const data = await res.json().catch(() => null);

    if (data && typeof data === "object") {
      const anyData = data as any;
      const msg =
        typeof anyData.message === "string"
          ? anyData.message
          : typeof anyData.error === "string"
          ? anyData.error
          : `API error ${res.status} ${res.statusText}`;

      const code = typeof anyData.code === "string" ? anyData.code : undefined;

      return { message: msg, code, details: data };
    }
  }

  // fallback: texto (mas tenta parsear JSON se vier como string)
  const text = await res.text().catch(() => "");
  if (!text) {
    return { message: `API error ${res.status} ${res.statusText}` };
  }

  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === "object") {
      const anyParsed = parsed as any;
      const msg =
        typeof anyParsed.message === "string"
          ? anyParsed.message
          : `API error ${res.status} ${res.statusText}`;
      const code =
        typeof anyParsed.code === "string" ? anyParsed.code : undefined;

      return { message: msg, code, details: parsed };
    }
  } catch {
    // ignora
  }

  return {
    message: text.substring(0, 300),
    details: text,
  };
}

export async function apiClient<T>(
  path: string,
  options: ApiClientOptions = {}
): Promise<T> {
  const url = `${API_BASE_URL}${path}`;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers ?? {}),
  };

  const token = getAuthToken();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  // se body já for string, não stringify de novo
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
    const payload = await readErrorPayload(res);

    throw new ApiError({
      status: res.status,
      statusText: res.statusText,
      message: payload.message,
      code: payload.code,
      details: payload.details,
    });
  }

  return (await res.json()) as T;
}
