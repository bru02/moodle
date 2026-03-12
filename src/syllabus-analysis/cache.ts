import { useCachedState } from "@raycast/utils";
import { useCallback, useMemo } from "react";
import { deriveSyllabusCacheState } from "./logic";
import { SyllabusAnalysisPayload } from "./types";

const CACHE_KEY = "syllabus-analysis-cache";

export function useSyllabusAnalysisCache() {
  const [cacheByScopeId, setCacheByScopeId] = useCachedState<Record<string, SyllabusAnalysisPayload>>(CACHE_KEY, {});

  const get = useCallback(
    (scopeId: string) => {
      return cacheByScopeId[scopeId] ?? null;
    },
    [cacheByScopeId],
  );

  const set = useCallback(
    (scopeId: string, payload: SyllabusAnalysisPayload) => {
      setCacheByScopeId((current) => ({ ...(current ?? {}), [scopeId]: payload }));
    },
    [setCacheByScopeId],
  );

  const remove = useCallback(
    (scopeId: string) => {
      setCacheByScopeId((current) => {
        if (!current?.[scopeId]) return current ?? {};
        const next = { ...current };
        delete next[scopeId];
        return next;
      });
    },
    [setCacheByScopeId],
  );

  return useMemo(
    () => ({
      cacheByScopeId,
      get,
      set,
      remove,
    }),
    [cacheByScopeId, get, remove, set],
  );
}

export const getSyllabusCacheState = deriveSyllabusCacheState;
