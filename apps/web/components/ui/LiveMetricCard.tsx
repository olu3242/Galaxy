'use client';

import useSWR from 'swr';
import { MetricCard } from './MetricCard';
import type { MetricCardProps } from './MetricCard';

interface LiveMetricCardProps extends Omit<MetricCardProps, 'value'> {
  /** API path to fetch — must return { data: { value: string | number } } */
  apiPath: string;
  /** Fallback value shown while loading or on error */
  fallback: string;
}

async function fetchMetric(url: string): Promise<{ data: { value: string | number } }> {
  const token =
    typeof document !== 'undefined'
      ? (/(?:^|; )gx-token=([^;]*)/.exec(document.cookie) ?? [])[1]
      : undefined;
  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL ?? ''}${url}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    credentials: 'include',
  });
  if (!res.ok) throw new Error('fetch failed');
  return res.json() as Promise<{ data: { value: string | number } }>;
}

export function LiveMetricCard({
  apiPath,
  fallback,
  ...cardProps
}: LiveMetricCardProps): React.ReactElement {
  const { data, isLoading } = useSWR<{ data: { value: string | number } }>(apiPath, fetchMetric, {
    revalidateOnFocus: false,
    refreshInterval: 30_000,
  });

  const value = isLoading ? '…' : data?.data.value != null ? String(data.data.value) : fallback;

  return <MetricCard {...cardProps} value={value} />;
}
