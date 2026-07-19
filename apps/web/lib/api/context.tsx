'use client';

import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { createApiClient, type GalaxyApiClient } from './client';

interface ApiContextValue {
  client: GalaxyApiClient;
  organizationId: string | null;
}

const ApiContext = createContext<ApiContextValue | null>(null);

export interface ApiProviderProps {
  children: ReactNode;
  /**
   * The API base URL. Defaults to NEXT_PUBLIC_API_URL env var.
   * Falls back to empty string (relative) for server-side rendering safety.
   */
  baseUrl?: string;
  /** JWT token for the current session */
  token?: string | null;
  /** Active organization context */
  organizationId?: string | null;
  /** Called when the API returns 401 */
  onUnauthorized?: () => void;
}

export function ApiProvider({
  children,
  baseUrl,
  token,
  organizationId = null,
  onUnauthorized,
}: ApiProviderProps) {
  const resolvedBaseUrl =
    baseUrl ?? (typeof process !== 'undefined' ? (process.env.NEXT_PUBLIC_API_URL ?? '') : '');

  const clientOpts: Parameters<typeof createApiClient>[0] = {
    baseUrl: resolvedBaseUrl,
    getToken: () => token ?? null,
  };
  if (onUnauthorized !== undefined) clientOpts.onUnauthorized = onUnauthorized;

  const client = useMemo(
    () => createApiClient(clientOpts),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [resolvedBaseUrl, token, onUnauthorized],
  );

  const value = useMemo<ApiContextValue>(
    () => ({ client, organizationId }),
    [client, organizationId],
  );

  return <ApiContext.Provider value={value}>{children}</ApiContext.Provider>;
}

export function useApi(): ApiContextValue {
  const ctx = useContext(ApiContext);
  if (!ctx) throw new Error('useApi must be used within <ApiProvider>');
  return ctx;
}

export function useApiClient(): GalaxyApiClient {
  return useApi().client;
}

export function useOrganizationId(): string | null {
  return useApi().organizationId;
}
