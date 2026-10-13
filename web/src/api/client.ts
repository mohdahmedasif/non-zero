export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public data: Record<string, unknown> | null,
  ) {
    super(message);
  }
}

/** The request never reached the server. */
export class OfflineError extends Error {
  constructor() {
    super('Cannot reach the server. Check your connection.');
  }
}

let onUnauthorized = () => {};
/** Called when the server says the session is gone, so the app can ask for the PIN. */
export function setUnauthorizedHandler(handler: () => void): void {
  onUnauthorized = handler;
}

let onUnpaired = () => {};
/** Called when the server says this browser has not been paired with the admin key. */
export function setUnpairedHandler(handler: () => void): void {
  onUnpaired = handler;
}

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      credentials: 'same-origin',
      headers: body === undefined ? undefined : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new OfflineError();
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    // A dev proxy or gateway with no server behind it is the same as being offline.
    if (res.status >= 502 && res.status <= 504) throw new OfflineError();
    if (res.status === 401 && url !== '/api/auth/unlock') onUnauthorized();
    if (res.status === 403 && data?.code === 'unpaired') onUnpaired();
    throw new ApiError(res.status, data?.error ?? `Request failed (${res.status})`, data);
  }
  return data as T;
}

export const api = {
  get: <T>(url: string) => request<T>('GET', url),
  post: <T>(url: string, body?: unknown) => request<T>('POST', url, body),
  put: <T>(url: string, body?: unknown) => request<T>('PUT', url, body),
  patch: <T>(url: string, body?: unknown) => request<T>('PATCH', url, body),
  delete: <T>(url: string) => request<T>('DELETE', url),
};

export const errorMessage = (err: unknown) => (err instanceof Error ? err.message : 'Something went wrong');
