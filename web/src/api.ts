// Client for server.py. All AWS calls go through /api/call (boto3 on the server).

export class ApiError extends Error {
  code: string;
  status: number;
  constructor(code: string, message: string, status: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

async function req<T = any>(method: string, url: string, body?: unknown, headers: Record<string, string> = {}): Promise<T> {
  const opts: RequestInit = { method, headers: { "X-Emu-Console": "1", ...headers } };
  if (body !== undefined) {
    if (body instanceof Blob || body instanceof ArrayBuffer) opts.body = body as BodyInit;
    else {
      opts.body = JSON.stringify(body);
      (opts.headers as Record<string, string>)["Content-Type"] = "application/json";
    }
  }
  let r: Response;
  try {
    r = await fetch(url, opts);
  } catch {
    throw new ApiError("ConsoleOffline", "Can't reach the console server. Is server.py running?", 0);
  }
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    const e = (data as any).error || {};
    throw new ApiError(e.code || "Error", e.message || r.statusText, r.status);
  }
  return data as T;
}

export const api = {
  req,
  async call<T = any>(service: string, operation: string, params: Record<string, unknown> = {}): Promise<T> {
    const d = await req<{ result: T }>("POST", "/api/call", { service, operation, params });
    return d.result;
  },
  health: () => req<{ up: boolean; endpoint: string; region?: string; account?: string; message?: string }>("GET", "/api/health"),
  async upload(bucket: string, key: string, file: Blob, options: Record<string, unknown> = {}) {
    const url = `/api/s3/upload?bucket=${encodeURIComponent(bucket)}&key=${encodeURIComponent(key)}`;
    const json = JSON.stringify(options);
    const b64 = btoa(String.fromCharCode(...new TextEncoder().encode(json)));
    return req<{ ok: boolean; versionId?: string }>("POST", url, file, { "X-File-Type": (file as File).type || "", "X-Upload-Options": b64 });
  },
  presign: (bucket: string, key: string, expires = 3600, versionId?: string) =>
    req<{ url: string }>("POST", "/api/s3/presign", { bucket, key, expires, versionId }),
  downloadUrl(bucket: string, key: string, opts: { inline?: boolean; versionId?: string } = {}) {
    const p = new URLSearchParams({ bucket, key });
    if (opts.inline) p.set("inline", "1");
    if (opts.versionId) p.set("versionId", opts.versionId);
    return `/api/s3/download?${p}`;
  },
};

/** True when the error means "this configuration isn't set", which the console shows as Disabled/None. */
export function isNotConfigured(e: unknown) {
  return e instanceof ApiError && (e.status === 404 || /^NoSuch|NotFound/.test(e.code));
}
export function isNotImplemented(e: unknown) {
  return e instanceof ApiError && (e.status === 501 || e.status === 405 || e.code === "NotImplemented");
}
