type HardwareMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
type HardwareOpenContext = "dropoff" | "pickup" | "admin";

export type HardwareRequestOptions = {
  method?: HardwareMethod;
  baseUrl?: string;
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

type NumberMap = Record<number, number>;
type PathMap = Record<number, string>;
type BaseUrlMap = Record<number, string>;

function getRawBaseUrl() {
  return import.meta.env.IP_HARD_WARE || import.meta.env.VITE_IP_HARD_WARE || "";
}

function getRawBaseUrlMap() {
  return import.meta.env.HARDWARE_BASE_URLS || import.meta.env.VITE_HARDWARE_BASE_URLS || "";
}

function getOpenPathTemplate() {
  return import.meta.env.HARDWARE_OPEN_PATH || import.meta.env.VITE_HARDWARE_OPEN_PATH || DEFAULT_OPEN_PATH;
}

function getTimeoutMs() {
  const raw = import.meta.env.HARDWARE_TIMEOUT_MS || import.meta.env.VITE_HARDWARE_TIMEOUT_MS;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TIMEOUT_MS;
}

function getRawBoxIdMap() {
  return import.meta.env.HARDWARE_BOX_ID_MAP || import.meta.env.VITE_HARDWARE_BOX_ID_MAP || "";
}

function getRawOpenPathMap() {
  return import.meta.env.HARDWARE_OPEN_PATHS || import.meta.env.VITE_HARDWARE_OPEN_PATHS || "";
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

function parseDelimitedMap<T>(raw: string, mapValue: (value: string) => T | null) {
  return raw
    .split(",")
    .map((pair) => pair.trim())
    .filter(Boolean)
    .reduce<Record<number, T>>((acc, pair) => {
      const separator = pair.includes("=") ? "=" : ":";
      const [rawKey, ...rawValue] = pair.split(separator);
      const key = Number(rawKey.trim());
      const value = mapValue(rawValue.join(separator).trim());

      if (Number.isInteger(key) && key > 0 && value !== null) acc[key] = value;
      return acc;
    }, {});
}

export function parseHardwareBoxIdMap(raw: string): NumberMap {
  const trimmed = raw.trim();
  if (!trimmed) return {};

  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    return Object.entries(parsed).reduce<NumberMap>((acc, [rawKey, rawValue]) => {
      const key = Number(rawKey);
      const value = Number(rawValue);
      if (Number.isInteger(key) && key > 0 && Number.isInteger(value) && value > 0) acc[key] = value;
      return acc;
    }, {});
  } catch {
    return parseDelimitedMap(trimmed, (value) => {
      const parsed = Number(value);
      return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
    });
  }
}

export function parseHardwareOpenPathMap(raw: string): PathMap {
  const trimmed = raw.trim();
  if (!trimmed) return {};

  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    return Object.entries(parsed).reduce<PathMap>((acc, [rawKey, rawValue]) => {
      const key = Number(rawKey);
      const value = String(rawValue ?? "").trim();
      if (Number.isInteger(key) && key > 0 && value) acc[key] = value;
      return acc;
    }, {});
  } catch {
    return parseDelimitedMap(trimmed, (value) => value || null);
  }
}

export function parseHardwareBaseUrlMap(raw: string): BaseUrlMap {
  const trimmed = raw.trim();
  if (!trimmed) return {};

  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    return Object.entries(parsed).reduce<BaseUrlMap>((acc, [rawKey, rawValue]) => {
      const key = Number(rawKey);
      const value = normalizeBaseUrl(String(rawValue ?? ""));
      if (Number.isInteger(key) && key > 0 && value) acc[key] = value;
      return acc;
    }, {});
  } catch {
    return parseDelimitedMap(trimmed, (value) => normalizeBaseUrl(value) || null);
  }
}

function buildHardwareUrl(path: string, query?: HardwareRequestOptions["query"], rawBaseUrl = getRawBaseUrl()) {
  const baseUrl = normalizeBaseUrl(rawBaseUrl);
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
    const response = await fetch(buildHardwareUrl(path, options.query, options.baseUrl), {
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

function applyOpenPathTemplate(template: string, boxId: number, hardwareBoxId: number) {
  return template
    .replaceAll(":boxId", String(boxId))
    .replaceAll(":box_id", String(boxId))
    .replaceAll(":lockerId", String(boxId))
    .replaceAll(":locker_id", String(boxId))
    .replaceAll("{boxId}", String(boxId))
    .replaceAll("{box_id}", String(boxId))
    .replaceAll("{lockerId}", String(boxId))
    .replaceAll("{locker_id}", String(boxId))
    .replaceAll(":hardwareBoxId", String(hardwareBoxId))
    .replaceAll(":hardware_box_id", String(hardwareBoxId))
    .replaceAll(":relayId", String(hardwareBoxId))
    .replaceAll(":relay_id", String(hardwareBoxId))
    .replaceAll("{hardwareBoxId}", String(hardwareBoxId))
    .replaceAll("{hardware_box_id}", String(hardwareBoxId))
    .replaceAll("{relayId}", String(hardwareBoxId))
    .replaceAll("{relay_id}", String(hardwareBoxId));
}

export function resolveOpenTarget(boxId: number) {
  const hardwareBoxId = parseHardwareBoxIdMap(getRawBoxIdMap())[boxId] ?? boxId;
  const baseUrl = parseHardwareBaseUrlMap(getRawBaseUrlMap())[boxId] ?? normalizeBaseUrl(getRawBaseUrl());
  const openPathMap = parseHardwareOpenPathMap(getRawOpenPathMap());
  const template = openPathMap[boxId] ?? getOpenPathTemplate();

  return {
    boxId,
    baseUrl,
    hardwareBoxId,
    path: applyOpenPathTemplate(template, boxId, hardwareBoxId),
  };
}

export const hardwareApi = {
  isConfigured() {
    return Boolean(normalizeBaseUrl(getRawBaseUrl()) || Object.keys(parseHardwareBaseUrlMap(getRawBaseUrlMap())).length);
  },

  getConfig() {
    return {
      baseUrl: normalizeBaseUrl(getRawBaseUrl()),
      baseUrlMap: parseHardwareBaseUrlMap(getRawBaseUrlMap()),
      openPath: getOpenPathTemplate(),
      openPathMap: parseHardwareOpenPathMap(getRawOpenPathMap()),
      boxIdMap: parseHardwareBoxIdMap(getRawBoxIdMap()),
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

  async openLocker(boxId: number, context: HardwareOpenContext = "dropoff") {
    const target = resolveOpenTarget(boxId);

    try {
      return await request(target.path, {
        method: "POST",
        baseUrl: target.baseUrl,
        body: {
          box_id: boxId,
          boxId,
          locker_id: boxId,
          hardware_box_id: target.hardwareBoxId,
          hardwareBoxId: target.hardwareBoxId,
          relay_id: target.hardwareBoxId,
          context,
          requested_at: new Date().toISOString(),
        },
      });
    } catch (error) {
      if (error instanceof HardwareApiError && error.status === 404) {
        throw new HardwareApiError(
          `Thiết bị không có endpoint mở tủ #${boxId} (${target.baseUrl}${target.path}). Kiểm tra firmware hoặc cấu hình HARDWARE_BASE_URLS/HARDWARE_OPEN_PATHS/HARDWARE_BOX_ID_MAP.`,
          error.status,
          error.data,
        );
      }
      throw error;
    }
  },
};
