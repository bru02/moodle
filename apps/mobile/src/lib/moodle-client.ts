import {
  buildAuthenticatedExternalOpenUrl,
  buildCourseScopes,
  fetchCourseCatalog,
  fetchTaskProjectionData,
  listCourseContents as buildCourseContentsResult,
  type CoreCourseGetContentsWSResponse,
  type CourseScope,
  type SimpleCourse,
  type TaskItem,
} from "@moodle/core";
import type { Href } from "expo-router";

import type { MoodleSession } from "./moodle-types";
import { requestWS, type WSAdapter } from "./useWSQuery";

export type MoodleCoursesResult = {
  courses: SimpleCourse[];
  semesters: string[];
  allScopes: CourseScope[];
  scopes: CourseScope[];
  currentSemester: string | null;
};

export type MobileTaskItem = TaskItem & {
  route: Href;
  detail?: string;
};

export type TaskSections = {
  actionable: readonly MobileTaskItem[];
  review: readonly MobileTaskItem[];
};

type RefreshSession = () => Promise<MoodleSession | null>;

export async function fetchCourses(input: {
  siteOrigin: string;
  session: MoodleSession;
  mergeSimilarCourses: boolean;
  refreshSession?: RefreshSession;
}): Promise<MoodleCoursesResult> {
  const adapter = toWSAdapter(input);
  const catalog = await fetchCourseCatalog({
    requestWS: async <T>(
      service: string,
      requestParams?: Record<string, unknown>,
    ) => await requestWS<T>(adapter, service, requestParams),
    userId: 0,
    merge: input.mergeSimilarCourses,
  });
  const sortedScopes = sortScopes(catalog.scopes);
  const sortedAllScopes = sortScopes(
    buildCourseScopes(catalog.courses, input.mergeSimilarCourses),
  );

  return {
    courses: catalog.courses,
    semesters: catalog.semesters,
    allScopes: sortedAllScopes,
    scopes: sortedScopes,
    currentSemester:
      catalog.selectedSemester === "all" ? null : catalog.selectedSemester,
  };
}

function sortScopes(scopes: readonly CourseScope[]) {
  return [...scopes].sort((left, right) => {
    const modifiedDelta =
      right.mergedCourse.timemodified - left.mergedCourse.timemodified;
    if (modifiedDelta !== 0) return modifiedDelta;
    return left.title.localeCompare(right.title);
  });
}

export async function fetchCourseContentRow(input: {
  siteOrigin: string;
  session: MoodleSession;
  courseId: number;
  refreshSession?: RefreshSession;
}) {
  return await requestWS<CoreCourseGetContentsWSResponse>(
    toWSAdapter(input),
    "core_course_get_contents",
    {
      courseid: input.courseId,
    },
  );
}

export function buildScopeContents(
  scope: CourseScope,
  contentRows: readonly (CoreCourseGetContentsWSResponse | undefined)[],
  options?: {
    recentActivityCutoffAt?: number | null;
  },
) {
  const { scopedSections, displayLayout } = buildCourseContentsResult({
    scope,
    contentRows,
    recentActivityCutoffAt: options?.recentActivityCutoffAt,
  });

  return {
    sections: scopedSections,
    displayLayout,
  };
}

export async function buildAutologinRedirectUrl(input: {
  siteOrigin: string;
  session: MoodleSession;
  destinationUrl: string;
  lastAutoLoginAt?: number;
  now?: number;
}) {
  return await buildAuthenticatedExternalOpenUrl({
    url: input.destinationUrl,
    siteOrigin: input.siteOrigin,
    accessKey: input.session.accessKey,
    token: input.session.token,
    privateToken: input.session.privateToken,
    userId: input.session.userId,
    lastAutoLoginAt: input.lastAutoLoginAt ?? input.session.authenticatedAt,
    now: input.now,
  });
}

type MoodleUrlModuleRecord = {
  id?: number;
  coursemodule?: number;
  externalurl?: string;
};

function extractUrlModuleRecords(payload: unknown): MoodleUrlModuleRecord[] {
  if (Array.isArray(payload)) {
    return payload as MoodleUrlModuleRecord[];
  }

  if (!payload || typeof payload !== "object" || !("urls" in payload)) {
    return [];
  }

  const urls = (payload as { urls?: unknown }).urls;
  return Array.isArray(urls) ? (urls as MoodleUrlModuleRecord[]) : [];
}

export async function fetchUrlModuleExternalUrl(input: {
  siteOrigin: string;
  session: MoodleSession;
  courseId: number;
  moduleId: number;
  moduleInstanceId?: number;
  refreshSession?: RefreshSession;
}) {
  const payload = await requestWS<unknown>(
    toWSAdapter(input),
    "mod_url_get_urls_by_courses",
    {
      courseids: [input.courseId],
    },
  );

  const match = extractUrlModuleRecords(payload).find((item) => {
    if (typeof item.externalurl !== "string" || item.externalurl.length === 0) {
      return false;
    }

    return item.coursemodule === input.moduleId || item.id === input.moduleInstanceId;
  });

  return match?.externalurl;
}

export async function fetchTaskSections(input: {
  siteOrigin: string;
  session: MoodleSession;
  courses: readonly SimpleCourse[];
  scopes: readonly CourseScope[];
  scopeContentRows: ReadonlyMap<
    string,
    readonly (CoreCourseGetContentsWSResponse | undefined)[]
  >;
  refreshSession?: RefreshSession;
}): Promise<TaskSections> {
  const allowedKinds = new Set<TaskItem["kind"]>(["assignment", "quiz"]);
  const scopeByCourseId = new Map<number, CourseScope>();
  const moduleRouteByModuleId = new Map<number, Href>();
  for (const scope of input.scopes) {
    for (const courseId of scope.courseIds) {
      scopeByCourseId.set(courseId, scope);
    }
    for (const section of buildScopeContents(scope, input.scopeContentRows.get(scope.id) ?? []).sections) {
      for (const module of section.modules) {
        moduleRouteByModuleId.set(module.module.id, {
          pathname: "/tasks/content/[courseId]/[contentId]",
          params: { courseId: scope.id, contentId: module.id },
        } as unknown as Href);
      }
    }
  }

  const adapter = toWSAdapter(input);
  const projection = await fetchTaskProjectionData({
    siteOrigin: input.siteOrigin,
    courses: input.courses,
    scopes: input.scopes,
    scopeContentRowsByScope: input.scopeContentRows,
    requestWS: async <T>(
      service: string,
      requestParams?: Record<string, unknown>,
    ) => await requestWS<T>(adapter, service, requestParams),
  });

  return {
    actionable: projection.actionable
      .filter((task) => allowedKinds.has(task.kind))
      .map((task) => mapTask(task, scopeByCourseId, moduleRouteByModuleId)),
    review: projection.recentReview
      .filter((task) => allowedKinds.has(task.kind))
      .map((task) => mapTask(task, scopeByCourseId, moduleRouteByModuleId)),
  };
}

function mapTask(
  task: TaskItem,
  scopeByCourseId: ReadonlyMap<number, CourseScope>,
  moduleRouteByModuleId: ReadonlyMap<number, Href>,
): MobileTaskItem {
  const scope = scopeByCourseId.get(task.courseId);
  const moduleId = extractModuleIdFromUrl(task.url);
  const moduleRoute =
    moduleId != null ? moduleRouteByModuleId.get(moduleId) : undefined;

  if (!scope || !moduleRoute) {
    throw new Error(`Missing module route for task ${task.id}`);
  }

  return {
    ...task,
    route: moduleRoute,
    detail: task.subtitle,
  };
}

function extractModuleIdFromUrl(url: string | undefined) {
  if (!url) return undefined;

  try {
    const parsed = new URL(url);
    const value = Number(parsed.searchParams.get("id"));
    return Number.isFinite(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

function toWSAdapter(input: {
  siteOrigin: string;
  session: MoodleSession;
  refreshSession?: RefreshSession;
}): WSAdapter {
  return {
    siteOrigin: input.siteOrigin,
    session: input.session,
    refreshSession: async () =>
      (await input.refreshSession?.()) ?? input.session,
  };
}
