import { findScopeByCourseId, isAuthError, listCourses, toSimpleCourse, type CourseScope } from "@moodle/core";
import { Action, ActionPanel, Grid, Icon, LaunchProps } from "@raycast/api";
import { createDeeplink, useCachedState, useFrecencySorting } from "@raycast/utils";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import AuthErrorDetail from "./components/AuthErrorDetail";
import { OpenFolderAction } from "./components/OpenFolderAction";
import { OpenInBrowserAction } from "./components/OpenInBrowserAction";
import WithHiddenItems, { HiddenItemActionsSection } from "./components/WithHiddenItems";
import { shortcut } from "./helpers";
import { logCourseAccess, type CourseAccessMethod } from "./helpers/course-access-log";
import { handleFileUrl } from "./helpers/files";
import { preferences } from "./helpers/preferences";
import "./helpers/proxy";
import { useWSQuery } from "./hooks/useWSQuery";
import LazyViewCourseGrades from "./lazy-view-course-grades";
import ViewCourse from "./view-course";

type SearchCoursesLaunchContext = { courseId?: string; preselectItem?: number };
type SearchCoursesLaunchProps = LaunchProps<{ launchContext?: SearchCoursesLaunchContext }>;
const COURSE_VISIBILITY_NAMESPACE = "courses";

export default function Command({ launchContext }: SearchCoursesLaunchProps) {
  const { data, isLoading, error, refetch } = useWSQuery("core_enrol_get_users_courses", { userid: 0 });
  const [selectedSemester, setSelectedSemester] = useCachedState<string | undefined>("selectedSemester");
  const [searchText, setSearchText] = useState("");

  const courses = useMemo(() => (data ?? []).map(toSimpleCourse), [data]);

  const { data: sortedCourses, visitItem } = useFrecencySorting(courses, {
    sortUnvisited: (a, b) => b.timemodified - a.timemodified,
    key: (c) => String(c.id),
  });

  const listedCourses = useMemo(
    () =>
      listCourses({
        courses: sortedCourses,
        merge: preferences.merge_similar_courses,
        semester: selectedSemester,
      }),
    [selectedSemester, sortedCourses],
  );
  const semesters = listedCourses.semesters;
  const effectiveSemester = listedCourses.selectedSemester;
  const scopes = listedCourses.scopes;

  const directLaunchCourseId = launchContext?.courseId ? Number(launchContext.courseId) : undefined;
  const scopeToLaunch = useMemo(() => {
    if (!directLaunchCourseId) return undefined;
    return findScopeByCourseId(
      listCourses({
        courses,
        merge: preferences.merge_similar_courses,
        semester: "all",
      }).scopes,
      directLaunchCourseId,
    );
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

  if (error && isAuthError(error)) {
    return <AuthErrorDetail error={error} onRetry={() => refetch()} />;
  }

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
        subtitle={[course.courseCode, course.seminarGroup].filter(Boolean).join(" · ")}
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
              target={<LazyViewCourseGrades scope={scope} />}
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
