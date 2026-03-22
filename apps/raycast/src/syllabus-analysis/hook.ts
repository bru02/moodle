import type { CourseScope, ScopedRenderedSection } from "@moodle/core";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useUser } from "../client";
import { preferences } from "../helpers/preferences";
import { CoreGradesGetUserGradesTableWSResponse } from "../types/grade";
import { buildAnalysisFingerprint, runSyllabusAnalysis } from "./analysis";
import { getSyllabusCacheState, useSyllabusAnalysisCache } from "./cache";
import { selectSyllabusArtifact } from "./selector";
import { SyllabusCacheState } from "./types";

export function useCourseSyllabusAnalysis(params: {
  scope: CourseScope;
  sections: readonly ScopedRenderedSection[];
  gradeData: readonly CoreGradesGetUserGradesTableWSResponse[] | undefined;
  forceRefresh?: boolean;
}) {
  const { scope, sections, gradeData, forceRefresh = false } = params;
  const user = useUser();
  const cache = useSyllabusAnalysisCache();
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [hasConsumedForceRefresh, setHasConsumedForceRefresh] = useState(!forceRefresh);
  const cachedPayload = cache.get(scope.id);
  const [computedCacheState, setComputedCacheState] = useState<SyllabusCacheState | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const inFlightRunKeyRef = useRef<string | null>(null);
  const selectedArtifact = useMemo(() => selectSyllabusArtifact(sections), [sections]);
  const cacheState = computedCacheState ?? getSyllabusCacheState(cachedPayload, selectedArtifact?.identity);

  const identifiers = useMemo(() => {
    const values = new Set<string>();
    for (const value of [
      user.username,
      user.fullname,
      preferences.username,
      ...(gradeData?.map((courseData) => courseData.tables?.[0]?.userfullname).filter(Boolean) ?? []),
    ]) {
      if (value) values.add(value);
    }
    return [...values];
  }, [gradeData, user.fullname, user.username]);

  useEffect(() => {
    if (!gradeData || sections.length === 0 || !selectedArtifact) return;

    let cancelled = false;

    void (async () => {
      const cached = cache.get(scope.id);
      const fingerprintState = await buildAnalysisFingerprint({
        scope,
        sections,
        gradeData,
        identifiers,
      });

      if (cancelled) return;
      const effectiveCacheState = !cached
        ? "missing"
        : cached.fingerprint === fingerprintState.fingerprint
          ? cached.status === "failed"
            ? "failed"
            : "parsed"
          : "stale";

      setComputedCacheState(effectiveCacheState);

      const shouldRun =
        (!hasConsumedForceRefresh && forceRefresh) ||
        refreshNonce > 0 ||
        !cached ||
        cached.fingerprint !== fingerprintState.fingerprint;
      if (!shouldRun) return;

      const runKey = `${scope.id}:${fingerprintState.fingerprint ?? "missing"}:${refreshNonce}:${forceRefresh ? "force" : "auto"}`;
      if (inFlightRunKeyRef.current === runKey) return;
      inFlightRunKeyRef.current = runKey;

      setIsLoading(!cached);
      setIsRefreshing(Boolean(cached));

      try {
        const nextPayload = await runSyllabusAnalysis({
          scope,
          sections,
          gradeData,
          identifiers,
        });

        if (cancelled) return;
        cache.set(scope.id, nextPayload);
        setComputedCacheState(nextPayload.status === "failed" ? "failed" : "parsed");
        setHasConsumedForceRefresh(true);
        setIsLoading(false);
        setIsRefreshing(false);
      } finally {
        if (inFlightRunKeyRef.current === runKey) {
          inFlightRunKeyRef.current = null;
        }
      }
    })().catch((error) => {
      console.error("syllabus-analysis: refresh failed", error);
      if (cancelled) return;
      setIsLoading(false);
      setIsRefreshing(false);
      setComputedCacheState((current) => (current === "missing" ? "failed" : current));
    });

    return () => {
      cancelled = true;
    };
  }, [
    cache,
    forceRefresh,
    gradeData,
    hasConsumedForceRefresh,
    identifiers,
    refreshNonce,
    scope,
    sections,
    selectedArtifact,
  ]);

  const refresh = useCallback(() => {
    setRefreshNonce((value) => value + 1);
  }, []);

  return {
    selectedArtifact,
    payload: cachedPayload,
    cacheState,
    isLoading,
    isRefreshing,
    refresh,
  };
}
