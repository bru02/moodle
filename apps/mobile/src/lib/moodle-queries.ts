import { useEffect, useMemo } from "react";
import {
  type CourseDisplayLayout,
  type CoreCourseGetContentsWSResponse,
  type CoreGradesGetUserGradesTableWSResponse,
  type CourseScope,
  type ScopedRenderedSection,
} from "@moodle/core";
import { useQuery } from "@tanstack/react-query";

import { useAppState } from "@/providers/app-provider";

import {
  buildScopeContents,
  fetchCourses,
  fetchTaskSections,
  type MoodleCoursesResult,
  type TaskSections,
} from "./moodle-client";
import type { MoodleSession } from "./moodle-types";
import { writeSpotlightSnapshot } from "./spotlight";
import { buildWSQueryOptions, useWSQueries, type WSAdapter } from "./useWSQuery";

type CourseContentsQueryResult = {
  data:
    | {
        sections: readonly ScopedRenderedSection[];
        displayLayout: CourseDisplayLayout;
      }
    | undefined;
  error: Error | null;
  isLoading: boolean;
};

export function buildCourseContentQueryOptions(input: {
  siteOrigin: string;
  session: MoodleSession;
  courseId: number;
  refreshSession: () => Promise<MoodleSession | null>;
}) {
  return buildWSQueryOptions<CoreCourseGetContentsWSResponse>(
    toWSAdapter(input),
    "core_course_get_contents",
    { courseid: input.courseId },
  );
}

export function useCoursesQuery() {
  const { activeAccount, accountSession, settings, refreshAccountSession } = useAppState();
  const session = activeAccount ? accountSession(activeAccount.id) : null;
  const accountKey = activeAccount ? { id: activeAccount.id, origin: activeAccount.origin } : null;
  const sessionKey = session ? { userId: session.userId } : null;
  const mergeSimilarCourses = settings.mergeSimilarCourses;

  const query = useQuery<MoodleCoursesResult>({
    // The cache key already tracks the effective fetch inputs for this query.
    // oxlint-disable-next-line @tanstack/query/exhaustive-deps
    queryKey:
      accountKey && sessionKey
        ? ["moodle", "courses", accountKey, sessionKey, mergeSimilarCourses]
        : ["moodle", "courses", "empty"],
    enabled: Boolean(accountKey && sessionKey),
    queryFn: async () => {
      if (!accountKey || !sessionKey) {
        throw new Error("Missing active account or session");
      }

      const currentSession = accountSession(accountKey.id);
      if (!currentSession) {
        throw new Error("Missing active account session");
      }

      return await fetchCourses({
        siteOrigin: accountKey.origin,
        session: currentSession,
        mergeSimilarCourses,
        refreshSession: async () => await refreshAccountSession(accountKey.id),
      });
    },
  });

  useEffect(() => {
    if (!activeAccount || !query.data) return;

    const semester = query.data.currentSemester;
    const snapshotCourses = query.data.scopes
      .filter((scope) => (semester ? scope.mergedCourse.semester === semester : true))
      .map((scope) => ({
        id: scope.id,
        title: scope.title,
        courseCode: scope.mergedCourse.courseCode,
        semester: scope.mergedCourse.semester,
        seminarGroup: scope.mergedCourse.seminarGroup,
        courseIds: scope.courseIds,
        route: `/courses/${scope.id}`,
        updatedAt: scope.mergedCourse.timemodified,
        lastUsedAt: scope.mergedCourse.lastaccess ? scope.mergedCourse.lastaccess * 1000 : undefined,
      }));

    void writeSpotlightSnapshot({
      activeAccountId: activeAccount.id,
      generatedAt: Date.now(),
      courses: snapshotCourses,
    });
  }, [activeAccount, query.data]);

  return query;
}

export function useCourseScope(scopeId: string) {
  const coursesQuery = useCoursesQuery();
  return coursesQuery.data?.allScopes.find((scope) => scope.id === scopeId) ?? null;
}

export function useCourseContentsQuery(
  scope: CourseScope | null,
  options?: {
    recentActivityCutoffAt?: number | null;
  },
): CourseContentsQueryResult {
  const { activeAccount, accountSession, refreshAccountSession } = useAppState();
  const session = activeAccount ? accountSession(activeAccount.id) : null;
  const adapter = activeAccount && session ? toWSAdapter({
    siteOrigin: activeAccount.origin,
    session,
    refreshSession: async () => await refreshAccountSession(activeAccount.id),
  }) : null;
  const hasInputs = Boolean(adapter && scope);

  const queries = useWSQueries<CoreCourseGetContentsWSResponse>(
    adapter,
    hasInputs && scope
      ? scope.courseIds.map((courseId) => ({
          service: "core_course_get_contents",
          params: { courseid: courseId },
        }))
      : [],
  );

  const contentRows = queries.map((query) => query.data);

  return useMemo(() => {
    if (!hasInputs || !scope) {
      return {
        data: undefined,
        error: null,
        isLoading: false,
      };
    }

    const contents = buildScopeContents(scope, contentRows, {
      recentActivityCutoffAt: options?.recentActivityCutoffAt,
    });

    return {
      data: contents,
      error: queries.find((query) => query.error)?.error ?? null,
      isLoading: queries.some((query) => query.status === "pending" && query.data === undefined),
    };
  }, [contentRows, hasInputs, options?.recentActivityCutoffAt, queries, scope]);
}

export function useTasksQuery() {
  const { activeAccount, accountSession, settings, refreshAccountSession } = useAppState();
  const session = activeAccount ? accountSession(activeAccount.id) : null;
  const accountKey = activeAccount ? { id: activeAccount.id, origin: activeAccount.origin } : null;
  const sessionKey = session ? { userId: session.userId } : null;
  const adapter = activeAccount && session ? toWSAdapter({
    siteOrigin: activeAccount.origin,
    session,
    refreshSession: async () => await refreshAccountSession(activeAccount.id),
  }) : null;
  const coursesQuery = useCoursesQuery();
  const coursesData = coursesQuery.data ?? null;
  const scopes = useMemo(() => coursesData?.scopes ?? [], [coursesData?.scopes]);

  const contentQueries = useWSQueries<CoreCourseGetContentsWSResponse>(
    adapter,
    adapter
      ? scopes.flatMap((scope) =>
          scope.courseIds.map((courseId) => ({
            service: "core_course_get_contents",
            params: { courseid: courseId },
          })),
        )
      : [],
  );

  const scopeContentRowsEntries = useMemo(() => {
    const rowsByScope: Array<readonly [string, readonly (CoreCourseGetContentsWSResponse | undefined)[]]> = [];
    let cursor = 0;

    for (const scope of scopes) {
      const rows = scope.courseIds.map(() => contentQueries[cursor++]?.data);
      rowsByScope.push([scope.id, rows]);
    }

    return rowsByScope;
  }, [contentQueries, scopes]);
  const scopeContentRows = useMemo(
    () => scopeContentRowsEntries,
    [scopeContentRowsEntries],
  );

  const contentsReady =
    Boolean(accountKey && sessionKey && coursesData) &&
    contentQueries.length === scopes.reduce((count, scope) => count + scope.courseIds.length, 0) &&
    contentQueries.every((query) => query.status !== "pending");

  const query = useQuery<TaskSections>({
    // The cache key already tracks the effective fetch inputs for this query.
    // oxlint-disable-next-line @tanstack/query/exhaustive-deps
    queryKey:
      accountKey && sessionKey && coursesData
        ? [
            "moodle",
            "tasks",
            accountKey,
            sessionKey,
            settings.mergeSimilarCourses ? "merged" : "raw",
            coursesData,
            scopes,
            scopeContentRows,
          ]
        : ["moodle", "tasks", "empty"],
    enabled: Boolean(accountKey && sessionKey && coursesData && contentsReady),
    queryFn: async () => {
      if (!accountKey || !coursesData) {
        throw new Error("Missing active task query dependencies");
      }

      const currentSession = accountSession(accountKey.id);
      if (!currentSession) {
        throw new Error("Missing active task session");
      }

      return await fetchTaskSections({
        siteOrigin: accountKey.origin,
        session: currentSession,
        courses: coursesData.courses,
        scopes,
        scopeContentRows: new Map(scopeContentRows),
        refreshSession: async () => await refreshAccountSession(accountKey.id),
      });
    },
  });

  const isLoading = coursesQuery.isLoading || (Boolean(accountKey && sessionKey && coursesData) && !contentsReady) || query.isLoading;
  const error = contentQueries.find((result) => result.error)?.error ?? query.error ?? null;

  return {
    data: query.data,
    isLoading,
    error,
    refetch: query.refetch,
  };
}

export type CourseGradesResult = {
  tables: readonly CoreGradesGetUserGradesTableWSResponse[];
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
};

export function useCourseGradesQuery(scope: CourseScope | null): CourseGradesResult {
  const { activeAccount, accountSession, refreshAccountSession } = useAppState();
  const session = activeAccount ? accountSession(activeAccount.id) : null;
  const adapter =
    activeAccount && session
      ? toWSAdapter({
          siteOrigin: activeAccount.origin,
          session,
          refreshSession: async () => await refreshAccountSession(activeAccount.id),
        })
      : null;

  const queries = useWSQueries<CoreGradesGetUserGradesTableWSResponse>(
    adapter,
    adapter && scope
      ? scope.courseIds.map((courseId) => ({
          service: "gradereport_user_get_grades_table",
          params: { courseid: courseId, userid: 0 },
        }))
      : [],
  );

  const tables = useMemo(
    () => queries.map((query) => query.data).filter((table): table is CoreGradesGetUserGradesTableWSResponse => Boolean(table)),
    [queries],
  );

  return useMemo(
    () => ({
      tables,
      isLoading: Boolean(adapter && scope) && queries.some((query) => query.status === "pending" && query.data === undefined),
      error: queries.find((query) => query.error)?.error ?? null,
      refetch: async () => {
        await Promise.all(queries.map(async (query) => await query.refetch()));
      },
    }),
    [adapter, queries, scope, tables],
  );
}

function toWSAdapter(input: {
  siteOrigin: string;
  session: MoodleSession;
  refreshSession: () => Promise<MoodleSession | null>;
}): WSAdapter {
  return {
    siteOrigin: input.siteOrigin,
    session: input.session,
    refreshSession: input.refreshSession,
  };
}
