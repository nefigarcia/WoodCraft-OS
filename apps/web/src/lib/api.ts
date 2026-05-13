const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api";

class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string
  ) {
    super(message);
    this.name = "ApiError";
  }
}

let onTokenRefreshed: ((token: string) => void) | null = null;
let refreshPromise: Promise<{ accessToken: string; refreshToken: string }> | null = null;

async function doRefresh(
  refreshToken: string
): Promise<{ accessToken: string; refreshToken: string }> {
  const res = await fetch(`${API_BASE}/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken }),
  });
  if (!res.ok) throw new ApiError("Session expired", 401);
  return res.json() as Promise<{ accessToken: string; refreshToken: string }>;
}

function buildHeaders(
  token: string | null,
  extra?: Record<string, string>,
  omitContentType = false
): Record<string, string> {
  return {
    ...(omitContentType ? {} : { "Content-Type": "application/json" }),
    ...extra,
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function requestRaw(
  path: string,
  options: RequestInit = {},
  omitContentType = false
): Promise<Response> {
  const { useAuthStore } = await import("@/store/auth");
  const store = useAuthStore.getState();
  const { setTokens, logout } = store;
  const extraHeaders = options.headers as Record<string, string> | undefined;

  if (!store.accessToken && store.refreshToken) {
    if (!refreshPromise) {
      refreshPromise = doRefresh(store.refreshToken).finally(() => { refreshPromise = null; });
    }
    try {
      const tokens = await refreshPromise;
      setTokens(tokens.accessToken, tokens.refreshToken);
    } catch {
      logout();
      throw new ApiError("Session expired. Please sign in again.", 401);
    }
  }

  const accessToken = useAuthStore.getState().accessToken;

  let res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: buildHeaders(accessToken, extraHeaders, omitContentType),
  });

  if (res.status === 401) {
    const fresh = useAuthStore.getState();
    if (fresh.accessToken && fresh.accessToken !== accessToken) {
      res = await fetch(`${API_BASE}${path}`, {
        ...options,
        headers: buildHeaders(fresh.accessToken, extraHeaders, omitContentType),
      });
    } else if (fresh.refreshToken) {
      if (!refreshPromise) {
        refreshPromise = doRefresh(fresh.refreshToken).finally(() => { refreshPromise = null; });
      }
      try {
        const tokens = await refreshPromise;
        setTokens(tokens.accessToken, tokens.refreshToken);
        onTokenRefreshed?.(tokens.accessToken);
        res = await fetch(`${API_BASE}${path}`, {
          ...options,
          headers: buildHeaders(tokens.accessToken, extraHeaders, omitContentType),
        });
      } catch {
        logout();
        throw new ApiError("Session expired. Please sign in again.", 401);
      }
    }
  }

  return res;
}

async function requestFile<T>(path: string, body: FormData): Promise<T> {
  const res = await requestRaw(path, { method: "POST", body }, true);
  if (!res.ok) {
    const err = (await res.json()) as { error: string; code?: string };
    throw new ApiError(err.error, res.status, err.code);
  }
  return res.json() as Promise<T>;
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await requestRaw(path, options);
  if (!res.ok) {
    const err = (await res.json()) as { error: string; code?: string };
    throw new ApiError(err.error, res.status, err.code);
  }
  return res.json() as Promise<T>;
}

async function requestBlob(path: string, options: RequestInit = {}): Promise<Blob> {
  const res = await requestRaw(path, options);
  if (!res.ok) throw new ApiError(`Request failed: ${res.status}`, res.status);
  return res.blob();
}

export const apiClient = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body: unknown) =>
    request<T>(path, { method: "POST", body: JSON.stringify(body) }),
  patch: <T>(path: string, body: unknown) =>
    request<T>(path, { method: "PATCH", body: JSON.stringify(body) }),
  put: <T>(path: string, body: unknown) =>
    request<T>(path, { method: "PUT", body: JSON.stringify(body) }),
  delete: <T>(path: string) => request<T>(path, { method: "DELETE" }),
  download: (path: string) => requestBlob(path),
  postFile: <T>(path: string, body: FormData) => requestFile<T>(path, body),
};

export { ApiError };
