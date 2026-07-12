/**
 * Galaxy API client — typed fetch wrapper for all backend requests.
 *
 * Usage:
 *   const client = createApiClient({ baseUrl: process.env.NEXT_PUBLIC_API_URL! });
 *   const orgs = await client.get<OrgListResponse>('/organizations');
 *   await client.post('/workflows', { body: payload });
 */

export interface ApiClientOptions {
  baseUrl: string;
  /** Called before each request to get the current auth token. */
  getToken?: (() => string | null | undefined) | undefined;
  /** Called when a 401 is received — e.g. to trigger a logout. */
  onUnauthorized?: (() => void) | undefined;
}

export interface RequestOptions {
  body?: unknown;
  headers?: Record<string, string>;
  /** Suppress automatic error throwing — return the raw Response instead. */
  raw?: boolean;
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export function createApiClient(opts: ApiClientOptions) {
  const { baseUrl, getToken, onUnauthorized } = opts;

  async function request<T>(
    method: string,
    path: string,
    options: RequestOptions = {},
  ): Promise<T> {
    const correlationId = crypto.randomUUID();
    const token = getToken?.();

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'x-correlation-id': correlationId,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    };

    const fetchInit: RequestInit = {
      method,
      headers,
      credentials: 'include',
    };
    if (options.body !== undefined) {
      fetchInit.body = JSON.stringify(options.body);
    }
    const res = await fetch(`${baseUrl}${path}`, fetchInit);

    if (res.status === 401) {
      onUnauthorized?.();
      throw new ApiError(401, 'UNAUTHORIZED', 'Authentication required');
    }

    if (!res.ok) {
      let errorBody: { error?: string; code?: string; details?: unknown } = {};
      try {
        errorBody = (await res.json()) as typeof errorBody;
      } catch {
        // ignore parse errors
      }
      throw new ApiError(
        res.status,
        errorBody.code ?? 'API_ERROR',
        errorBody.error ?? `Request failed with status ${String(res.status)}`,
        errorBody.details,
      );
    }

    if (res.status === 204) return undefined as T;

    return res.json() as Promise<T>;
  }

  return {
    get: <T>(path: string, options?: Omit<RequestOptions, 'body'>) =>
      request<T>('GET', path, options),
    post: <T>(path: string, options?: RequestOptions) => request<T>('POST', path, options),
    put: <T>(path: string, options?: RequestOptions) => request<T>('PUT', path, options),
    patch: <T>(path: string, options?: RequestOptions) => request<T>('PATCH', path, options),
    delete: <T>(path: string, options?: Omit<RequestOptions, 'body'>) =>
      request<T>('DELETE', path, options),
  };
}

export type GalaxyApiClient = ReturnType<typeof createApiClient>;
