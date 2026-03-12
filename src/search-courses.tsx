import { Action, ActionPanel, Grid, Icon, LaunchProps } from "@raycast/api";
import { createDeeplink, useCachedState, useFrecencySorting } from "@raycast/utils";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AuthErrorDetail from "./components/AuthErrorDetail";
import { OpenFolderAction } from "./components/OpenFolderAction";
import { OpenInBrowserAction } from "./components/OpenInBrowserAction";
import WithHiddenItems, { HiddenItemActionsSection } from "./components/WithHiddenItems";
import { buildCourseScopes, findScopeByCourseId, type CourseScope } from "./course-scope";
import { shortcut } from "./helpers";
import { logCourseAccess, type CourseAccessMethod } from "./helpers/course-access-log";
import { handleFileUrl } from "./helpers/files";
import { preferences } from "./helpers/preferences";
import "./helpers/proxy";
import { useHiddenItemsState } from "./hooks/useHiddenItems";
import { useWSQuery } from "./hooks/useWSQuery";
import { toSimpleCourse } from "./types/simple-course";
import ViewCourse from "./view-course";
import ViewCourseGrades from "./view-course-grades";

type SearchCoursesLaunchContext = { courseId?: string; preselectItem?: number };
type SearchCoursesLaunchProps = LaunchProps<{ launchContext?: SearchCoursesLaunchContext }>;
const COURSE_VISIBILITY_NAMESPACE = "courses";

export default function Command({ launchContext }: SearchCoursesLaunchProps) {
  const { data, isLoading, error, refetch } = useWSQuery("core_enrol_get_users_courses", { userid: 0 });
  const [selectedSemester, setSelectedSemester] = useCachedState<string | undefined>("selectedSemester");
  const [searchText, setSearchText] = useState("");

  const courses = useMemo(() => (data ?? []).map(toSimpleCourse), [data]);
  const semesters = useMemo(() => {
    const set = new Set<string>();
    for (const c of courses) if (c.semester) set.add(c.semester);
    return Array.from(set).toSorted().toReversed();
  }, [courses]);

  const effectiveSemester = useMemo(() => {
    if (selectedSemester === "all") return "all";
    if (selectedSemester && semesters.includes(selectedSemester)) return selectedSemester;
    return semesters[0];
  }, [selectedSemester, semesters]);

  const { data: sortedCourses, visitItem } = useFrecencySorting(courses, {
    sortUnvisited: (a, b) => b.timemodified - a.timemodified,
    key: (c) => String(c.id),
  });

  const filteredCourses = useMemo(() => {
    if (!effectiveSemester || effectiveSemester === "all") return sortedCourses;
    return sortedCourses.filter((course) => course.semester === effectiveSemester);
  }, [sortedCourses, effectiveSemester]);

  const courseVisibility = useHiddenItemsState(COURSE_VISIBILITY_NAMESPACE);
  const scopes = useMemo(
    () => buildCourseScopes(filteredCourses, preferences.merge_similar_courses),
    [filteredCourses],
  );
  const scopeIdsByCourseId = useMemo(() => {
    const map = new Map<string, string>();
    for (const scope of scopes) {
      for (const courseId of scope.courseIds) {
        map.set(String(courseId), scope.id);
      }
    }
    return map;
  }, [scopes]);

  const directLaunchCourseId = launchContext?.courseId ? Number(launchContext.courseId) : undefined;
  const scopeToLaunch = useMemo(() => {
    if (!directLaunchCourseId) return undefined;
    return findScopeByCourseId(buildCourseScopes(courses, preferences.merge_similar_courses), directLaunchCourseId);
  }, [courses, directLaunchCourseId]);

  const hasVisitedDirectCourse = useRef(false);
  const trackCourseAccess = useCallback(
    (courseId: number, method: CourseAccessMethod, searchQuery?: string | null) => {
      const effectiveSearchQuery = searchQuery === undefined ? searchText : searchQuery;
      void logCourseAccess({
        courseId,
        method,
        searchQuery: effectiveSearchQuery,
      });
    },
    [searchText],
  );

  useEffect(() => {
    if (!directLaunchCourseId || hasVisitedDirectCourse.current) return;
    const c = courses.find((course) => course.id === directLaunchCourseId);
    if (!c) return;
    hasVisitedDirectCourse.current = true;
    visitItem(c);
    trackCourseAccess(c.id, "deeplink", null);
  }, [courses, directLaunchCourseId, trackCourseAccess, visitItem]);

  useEffect(() => {
    migrateLegacyCourseKeys(courseVisibility.hiddenItems, scopeIdsByCourseId, courseVisibility.setHiddenKeys);
  }, [courseVisibility.hiddenItems, courseVisibility.setHiddenKeys, scopeIdsByCourseId]);

  useEffect(() => {
    migrateLegacyCourseKeys(courseVisibility.pinnedItems, scopeIdsByCourseId, courseVisibility.setPinnedKeys);
  }, [courseVisibility.pinnedItems, courseVisibility.setPinnedKeys, scopeIdsByCourseId]);

  if (error) return <AuthErrorDetail error={error} onRetry={() => refetch()} />;

  if (scopeToLaunch) {
    return (
      <ViewCourse
        scope={scopeToLaunch}
        preselectItem={launchContext?.preselectItem ? +launchContext.preselectItem : undefined}
      />
    );
  }

  return (
    <Grid
      columns={4}
      inset={Grid.Inset.Zero}
      fit={Grid.Fit.Fill}
      isLoading={isLoading}
      searchText={searchText}
      onSearchTextChange={setSearchText}
      filtering
      searchBarAccessory={
        <Grid.Dropdown tooltip="Filter by semester" onChange={setSelectedSemester} value={effectiveSemester}>
          {semesters.length > 0 && <Grid.Dropdown.Item title="All" value="all" />}
          {semesters.map((semester) => (
            <Grid.Dropdown.Item key={semester} title={semester} value={semester} />
          ))}
        </Grid.Dropdown>
      }
    >
      <WithHiddenItems namespace={COURSE_VISIBILITY_NAMESPACE} data={scopes} getItemKey={(scope) => scope.id}>
        {(visibleScopes, { isPinnedSection, hasPinnedItems }) => {
          const items = renderScopeItems(visibleScopes, visitItem, trackCourseAccess);
          if (items.length === 0) return null;
          if (isPinnedSection) return <Grid.Section title="Pinned">{items}</Grid.Section>;
          if (hasPinnedItems) return <Grid.Section title="Others">{items}</Grid.Section>;
          return items;
        }}
      </WithHiddenItems>
    </Grid>
  );
}

function renderScopeItems(
  scopes: readonly CourseScope[],
  visitItem: (course: CourseScope["mergedCourse"]) => void,
  trackCourseAccess: (courseId: number, method: CourseAccessMethod) => void,
) {
  return scopes.map((scope) => {
    const course = scope.mergedCourse;
    return (
      <Grid.Item
        key={scope.id}
        content={handleFileUrl(course.courseimage)}
        title={course.displayname}
        subtitle={course.seminarGroup ?? ""}
        actions={
          <ActionPanel>
            <Action.Push
              title="View Course"
              target={<ViewCourse scope={scope} />}
              icon={Icon.CheckList}
              onPush={() => {
                visitItem(course);
                trackCourseAccess(course.id, "view-course");
              }}
            />
            {preferences.sync_folder && (
              <OpenFolderAction
                scope={scope}
                onOpen={(c) => {
                  visitItem(course);
                  trackCourseAccess(c.id, "open-folder");
                }}
              />
            )}
            <Action.Push
              title="View Grades"
              target={<ViewCourseGrades scope={scope} />}
              icon={Icon.BarChart}
              onPush={() => {
                visitItem(course);
                trackCourseAccess(course.id, "view-grades");
              }}
              shortcut={shortcut("g")}
            />
            <OpenInBrowserAction
              url={`${preferences.site_url}/course/view.php?id=${course.id}`}
              onOpen={() => {
                visitItem(course);
                trackCourseAccess(course.id, "open-browser");
              }}
            />
            <ActionPanel.Section>
              <Action.CreateQuicklink
                quicklink={{
                  link: createDeeplink({ command: "search-courses", context: { courseId: course.id } }),
                  name: course.displayname,
                }}
                icon={Icon.Link}
                shortcut={shortcut("l", ["shift"])}
              />
            </ActionPanel.Section>
            <HiddenItemActionsSection item={scope} />
          </ActionPanel>
        }
      />
    );
  });
}

function migrateLegacyCourseKeys(
  itemKeys: readonly (string | number)[],
  scopeIdsByCourseId: ReadonlyMap<string, string>,
  setKeys: (itemKeys: readonly (string | number)[], value: boolean) => void,
) {
  const keysToRemove = itemKeys.filter((itemKey) => {
    const normalizedKey = String(itemKey);
    const scopeId = scopeIdsByCourseId.get(normalizedKey);
    return scopeId != null && scopeId !== normalizedKey;
  });
  if (keysToRemove.length === 0) {
    return;
  }

  const scopeIdsToAdd = keysToRemove.flatMap((itemKey) => {
    const scopeId = scopeIdsByCourseId.get(String(itemKey));
    return scopeId ? [scopeId] : [];
  });

  setKeys(scopeIdsToAdd, true);
  setKeys(keysToRemove, false);
}
