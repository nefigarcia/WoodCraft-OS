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
  extra?: Record<string, string>
): Record<string, string> {
  return {
    "Content-Type": "application/json",
    ...extra,
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const { useAuthStore } = await import("@/store/auth");
  const store = useAuthStore.getState();
  const { setTokens, logout } = store;
  const extraHeaders = options.headers as Record<string, string> | undefined;

  // Proactively refresh if we have a refresh token but no access token
  if (!store.accessToken && store.refreshToken) {
    if (!refreshPromise) {
      refreshPromise = doRefresh(store.refreshToken).finally(() => {
        refreshPromise = null;
      });
    }
    try {
      const tokens = await refreshPromise;
      setTokens(tokens.accessToken, tokens.refreshToken);
    } catch {
      logout();
      throw new ApiError("Session expired. Please sign in again.", 401);
    }
  }

  // Read the (possibly just-refreshed) access token
  const accessToken = useAuthStore.getState().accessToken;

  let res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: buildHeaders(accessToken, extraHeaders),
  });

  if (res.status === 401) {
    // Re-read fresh state — a concurrent request may have already refreshed
    const fresh = useAuthStore.getState();

    if (fresh.accessToken && fresh.accessToken !== accessToken) {
      // Another request already got a new token — retry with it
      res = await fetch(`${API_BASE}${path}`, {
        ...options,
        headers: buildHeaders(fresh.accessToken, extraHeaders),
      });
    } else if (fresh.refreshToken) {
      if (!refreshPromise) {
        refreshPromise = doRefresh(fresh.refreshToken).finally(() => {
          refreshPromise = null;
        });
      }
      try {
        const tokens = await refreshPromise;
        setTokens(tokens.accessToken, tokens.refreshToken);
        onTokenRefreshed?.(tokens.accessToken);
        res = await fetch(`${API_BASE}${path}`, {
          ...options,
          headers: buildHeaders(tokens.accessToken, extraHeaders),
        });
      } catch {
        logout();
        throw new ApiError("Session expired. Please sign in again.", 401);
      }
    }
  }

  if (!res.ok) {
    const err = (await res.json()) as { error: string; code?: string };
    throw new ApiError(err.error, res.status, err.code);
  }

  return res.json() as Promise<T>;
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
};

export { ApiError };
