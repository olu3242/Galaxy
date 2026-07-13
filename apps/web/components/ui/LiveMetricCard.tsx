'use client';

import useSWR from 'swr';
import { useApiClient } from '../../lib/api/context';
import { MetricCard } from './MetricCard';
import type { MetricCardProps } from './MetricCard';

interface LiveMetricCardProps extends Omit<MetricCardProps, 'value'> {
  /** API path to fetch — must return { data: { value: string | number } } */
  apiPath: string;
  /** Fallback value shown while loading or on error */
  fallback: string;
}

export function LiveMetricCard({
  apiPath,
  fallback,
  ...cardProps
}: LiveMetricCardProps): React.ReactElement {
  const client = useApiClient();
  const { data, isLoading } = useSWR<{ data: { value: string | number } }>(
    apiPath,
    (p: string) => client.get<{ data: { value: string | number } }>(p),
    { revalidateOnFocus: false, refreshInterval: 30_000 },
  );

  const value = isLoading ? '…' : data?.data.value != null ? String(data.data.value) : fallback;

  return <MetricCard {...cardProps} value={value} />;
}
