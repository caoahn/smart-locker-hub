type HardwareMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export type HardwareRequestOptions = {
  method?: HardwareMethod;
  body?: unknown;
  headers?: Record<string, string>;
  query?: Record<string, string | number | boolean | null | undefined>;
  timeoutMs?: number;
};

export type HardwareResponse<T = unknown> = {
  ok: boolean;
  status: number;
  data: T;
};

export class HardwareApiError extends Error {
  status?: number;
  data?: unknown;

  constructor(message: string, status?: number, data?: unknown) {
    super(message);
    this.name = "HardwareApiError";
    this.status = status;
    this.data = data;
  }
}

const DEFAULT_OPEN_PATH = "/lockers/:boxId/open";
const DEFAULT_TIMEOUT_MS = 8000;

function getRawBaseUrl() {
  return import.meta.env.IP_HARD_WARE || import.meta.env.VITE_IP_HARD_WARE || "";
}

function getOpenPathTemplate() {
  return import.meta.env.HARDWARE_OPEN_PATH || import.meta.env.VITE_HARDWARE_OPEN_PATH || DEFAULT_OPEN_PATH;
}

function getTimeoutMs() {
  const raw = import.meta.env.HARDWARE_TIMEOUT_MS || import.meta.env.VITE_HARDWARE_TIMEOUT_MS;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TIMEOUT_MS;
}

function normalizeBaseUrl(rawBaseUrl: string) {
  const trimmed = rawBaseUrl.trim();
  if (!trimmed) return "";

  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
  return withProtocol.replace(/\/+$/, "");
}

function normalizePath(path: string) {
  if (!path) return "/";
  return path.startsWith("/") ? path : `/${path}`;
}

function buildQuery(query?: HardwareRequestOptions["query"]) {
  const params = new URLSearchParams();
  Object.entries(query ?? {}).forEach(([key, value]) => {
    if (value !== null && value !== undefined) params.set(key, String(value));
  });
  const text = params.toString();
  return text ? `?${text}` : "";
}

function buildHardwareUrl(path: string, query?: HardwareRequestOptions["query"]) {
  const baseUrl = normalizeBaseUrl(getRawBaseUrl());
  if (!baseUrl) throw new HardwareApiError("IP_HARD_WARE chưa được cấu hình");
  return `${baseUrl}${normalizePath(path)}${buildQuery(query)}`;
}

async function parseResponse(response: Response) {
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) return response.json();
  const text = await response.text();
  return text || null;
}

async function request<T = unknown>(path: string, options: HardwareRequestOptions = {}): Promise<HardwareResponse<T>> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), options.timeoutMs ?? getTimeoutMs());

  try {
    const hasBody = options.body !== undefined;
    const response = await fetch(buildHardwareUrl(path, options.query), {
      method: options.method ?? "GET",
      headers: {
        ...(hasBody ? { "Content-Type": "application/json" } : {}),
        ...options.headers,
      },
      body: hasBody ? JSON.stringify(options.body) : undefined,
      signal: controller.signal,
    });
    const data = await parseResponse(response);

    if (!response.ok) {
      throw new HardwareApiError(`Phần cứng trả lỗi HTTP ${response.status}`, response.status, data);
    }

    return { ok: true, status: response.status, data: data as T };
  } catch (error) {
    if (error instanceof HardwareApiError) throw error;
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new HardwareApiError("Kết nối phần cứng quá thời gian chờ");
    }
    throw new HardwareApiError(error instanceof Error ? error.message : "Không thể kết nối phần cứng");
  } finally {
    window.clearTimeout(timeout);
  }
}

function resolveOpenPath(boxId: number) {
  return getOpenPathTemplate()
    .replaceAll(":boxId", String(boxId))
    .replaceAll(":box_id", String(boxId))
    .replaceAll("{boxId}", String(boxId))
    .replaceAll("{box_id}", String(boxId));
}

export const hardwareApi = {
  isConfigured() {
    return Boolean(normalizeBaseUrl(getRawBaseUrl()));
  },

  getConfig() {
    return {
      baseUrl: normalizeBaseUrl(getRawBaseUrl()),
      openPath: getOpenPathTemplate(),
      timeoutMs: getTimeoutMs(),
    };
  },

  request,

  get<T = unknown>(path: string, query?: HardwareRequestOptions["query"]) {
    return request<T>(path, { method: "GET", query });
  },

  post<T = unknown>(path: string, body?: unknown) {
    return request<T>(path, { method: "POST", body });
  },

  put<T = unknown>(path: string, body?: unknown) {
    return request<T>(path, { method: "PUT", body });
  },

  patch<T = unknown>(path: string, body?: unknown) {
    return request<T>(path, { method: "PATCH", body });
  },

  delete<T = unknown>(path: string, body?: unknown) {
    return request<T>(path, { method: "DELETE", body });
  },

  health() {
    return request("/health", { method: "GET", timeoutMs: 3000 });
  },

  openLocker(boxId: number, context: "dropoff" | "pickup" | "admin" = "dropoff") {
    return request(resolveOpenPath(boxId), {
      method: "POST",
      body: {
        box_id: boxId,
        boxId,
        locker_id: boxId,
        context,
        requested_at: new Date().toISOString(),
      },
    });
  },
};
