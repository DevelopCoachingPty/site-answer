"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { api } from "@/lib/api-client";

interface UseApiState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useApi<T>(path: string, params?: Record<string, string | number | undefined>): UseApiState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Stable serialization of params to avoid unnecessary re-fetches
  const paramsKey = useMemo(() => JSON.stringify(params), [params]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await api.get<T>(path, params);
      setData(result);
    } catch {
      // Retry once on 5xx or network errors
      try {
        await new Promise((r) => setTimeout(r, 2000));
        const result = await api.get<T>(path, params);
        setData(result);
      } catch (retryErr) {
        setError(retryErr instanceof Error ? retryErr.message : "Request failed");
      }
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, paramsKey]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, loading, error, refetch: fetchData };
}
