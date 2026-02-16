import { Action, ActionPanel, Grid, Icon, LaunchProps, open } from "@raycast/api";
import { createDeeplink, useCachedState, useFrecencySorting } from "@raycast/utils";
import { mkdir } from "fs/promises";
import { useEffect, useMemo, useRef } from "react";
import AuthErrorDetail from "./components/AuthErrorDetail";
import { OpenInBrowserAction } from "./components/OpenInBrowserAction";
import WithHiddenItems, { HiddenItemActionsSection } from "./components/WithHiddenItems";
import { buildCourseScopes, findScopeByCourseId } from "./course-scope";
import { shortcut } from "./helpers";
import { getCourseFolder, handleFileUrl } from "./helpers/files";
import { preferences } from "./helpers/preferences";
import "./helpers/proxy";
import { useWSQuery } from "./hooks/useWSQuery";
import { toSimpleCourse } from "./types/simple-course";
import ViewCourse from "./view-course";
import ViewCourseGrades from "./view-course-grades";

type SearchCoursesLaunchContext = { courseId?: string; preselectItem?: number };
type SearchCoursesLaunchProps = LaunchProps<{ launchContext?: SearchCoursesLaunchContext }>;

export default function Command({ launchContext }: SearchCoursesLaunchProps) {
  const { data, isLoading, error, refetch } = useWSQuery("core_enrol_get_users_courses", { userid: 0 });
  const [selectedSemester, setSelectedSemester] = useCachedState<string | undefined>("selectedSemester");

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

  const scopes = useMemo(
    () => buildCourseScopes(filteredCourses, preferences.merge_similar_courses),
    [filteredCourses],
  );

  const directLaunchCourseId = launchContext?.courseId ? Number(launchContext.courseId) : undefined;
  const scopeToLaunch = useMemo(() => {
    if (!directLaunchCourseId) return undefined;
    return findScopeByCourseId(buildCourseScopes(courses, preferences.merge_similar_courses), directLaunchCourseId);
  }, [courses, directLaunchCourseId]);

  const hasVisitedDirectCourse = useRef(false);
  useEffect(() => {
    if (!directLaunchCourseId || hasVisitedDirectCourse.current) return;
    const c = courses.find((course) => course.id === directLaunchCourseId);
    if (!c) return;
    hasVisitedDirectCourse.current = true;
    visitItem(c);
  }, [courses, directLaunchCourseId, visitItem]);

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
      searchBarAccessory={
        <Grid.Dropdown tooltip="Filter by semester" onChange={setSelectedSemester} value={effectiveSemester}>
          {semesters.length > 0 && <Grid.Dropdown.Item title="All" value="all" />}
          {semesters.map((semester) => (
            <Grid.Dropdown.Item key={semester} title={semester} value={semester} />
          ))}
        </Grid.Dropdown>
      }
    >
      <WithHiddenItems namespace="courses" data={scopes}>
        {(visibleScopes, { isPinnedSection, hasPinnedItems }) => {
          const items = visibleScopes.map((scope) => {
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
                      onPush={() => visitItem(course)}
                    />
                    {preferences.sync_folder && (
                      <Action
                        title="Open Folder in Finder"
                        icon={Icon.Finder}
                        onAction={async () => {
                          const path = getCourseFolder(course);
                          await mkdir(path, { recursive: true });
                          await open(path);
                          await visitItem(course);
                        }}
                      />
                    )}
                    <Action.Push
                      title="View Grades"
                      target={<ViewCourseGrades scope={scope} />}
                      icon={Icon.BarChart}
                      onPush={() => visitItem(course)}
                      shortcut={shortcut("g")}
                    />
                    <OpenInBrowserAction
                      url={`${preferences.site_url}/course/view.php?id=${course.id}`}
                      onOpen={() => visitItem(course)}
                      applyShortcut
                    />
                    <ActionPanel.Section>
                      <Action.CreateQuicklink
                        quicklink={{
                          link: createDeeplink({ command: "search-courses", context: { courseId: course.id } }),
                          name: course.displayname,
                        }}
                        shortcut={shortcut("l", ["shift"])}
                      />
                    </ActionPanel.Section>
                    <HiddenItemActionsSection item={scope} />
                  </ActionPanel>
                }
              />
            );
          });

          if (items.length === 0) return null;
          if (isPinnedSection) return <Grid.Section title="Pinned">{items}</Grid.Section>;
          if (hasPinnedItems) return <Grid.Section title="Others">{items}</Grid.Section>;
          return items;
        }}
      </WithHiddenItems>
    </Grid>
  );
}
