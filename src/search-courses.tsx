import { Action, ActionPanel, Grid, Icon, LaunchProps, open } from "@raycast/api";
import { createDeeplink, useCachedState, useFrecencySorting } from "@raycast/utils";
import { mkdir } from "fs/promises";
import { useEffect, useMemo, useRef } from "react";
import AuthErrorDetail from "./components/AuthErrorDetail";
import { OpenInBrowserAction } from "./components/OpenInBrowserAction";
import WithHiddenItems, { HiddenItemActionsSection } from "./components/WithHiddenItems";
import { shortcut } from "./helpers";
import { getCourseFolder, handleFileUrl } from "./helpers/files";
import { preferences } from "./helpers/preferences";
import "./helpers/proxy";
import { useWSQuery } from "./hooks/useWSQuery";
import ViewCourse from "./view-course";
import ViewCourseGrades from "./view-course-grades";

type SearchCoursesLaunchContext = {
  courseId?: string;
  preselectItem?: number;
};

type SearchCoursesLaunchProps = LaunchProps<{ launchContext?: SearchCoursesLaunchContext }>;

export default function Command({ launchContext }: SearchCoursesLaunchProps) {
  const { data: courses, isLoading, error, refetch } = useWSQuery("core_enrol_get_users_courses", {
    userid: 0,
  });

  const [selectedSemester, setSelectedSemester] = useCachedState<string | undefined>("selectedSemester");

  const semesters = useMemo(() => {
    const semesters = new Set<string>();
    courses?.forEach((course) => {
      const semester = (course.fullname + course.shortname).match(/\d{4}\/\d{2}\/\d/)?.[0];
      if (semester) {
        semesters.add(semester);
      }
    });

    return Array.from(semesters).toSorted().toReversed();
  }, [courses]);

  const effectiveSemester = useMemo(() => {
    if (selectedSemester === "all") {
      return "all";
    }
    if (selectedSemester && semesters.includes(selectedSemester)) {
      return selectedSemester;
    }
    return semesters[0];
  }, [selectedSemester, semesters]);

  const { data: sortedCourses, visitItem } = useFrecencySorting(courses || [], {
    sortUnvisited(a, b) {
      return b.timemodified - a.timemodified;
    },
    key(c) {
      return c.id;
    },
  });

  const filteredCourses = useMemo(() => {
    if (!effectiveSemester || effectiveSemester === "all") {
      return sortedCourses;
    }
    return sortedCourses.filter((course) => {
      return (course.fullname + course.shortname).includes(effectiveSemester);
    });
  }, [sortedCourses, effectiveSemester]);

  const directLaunchCourseId = launchContext?.courseId;
  const courseToLaunch =
    directLaunchCourseId && courses
      ? courses.find((c) => String(c.id) === String(directLaunchCourseId))
      : undefined;
  const hasVisitedDirectCourse = useRef(false);

  useEffect(() => {
    if (!courseToLaunch || hasVisitedDirectCourse.current) {
      return;
    }
    hasVisitedDirectCourse.current = true;
    visitItem(courseToLaunch);
  }, [courseToLaunch, visitItem]);

  if (error) {
    return <AuthErrorDetail error={error} onRetry={() => refetch()} />;
  }

  if (courseToLaunch) {
    return (
      <ViewCourse
        course={courseToLaunch}
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
        <Grid.Dropdown
          tooltip="Filter by semester"
          onChange={(s) => setSelectedSemester(s)}
          value={effectiveSemester}
        >
          {semesters.length > 0 && <Grid.Dropdown.Item title="All" value="all" />}
          {semesters.map((semester) => (
            <Grid.Dropdown.Item key={semester} title={semester} value={semester} />
          ))}
        </Grid.Dropdown>
      }
    >
      <WithHiddenItems namespace="courses" data={filteredCourses}>
        {(c) =>
          c?.map((course) => (
            <Grid.Item
              key={course.id}
              content={{ value: handleFileUrl(course.courseimage), tooltip: course.fullname }}
              title={course.displayname}
              subtitle={course.displayname.match(/(?<=\()[^(]*?(?=\)$)/)?.pop() || ""}
              actions={
                <ActionPanel>
                  <Action.Push
                    title="View Course"
                    target={<ViewCourse course={course} />}
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
                    target={<ViewCourseGrades course={course} />}
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
                        link: createDeeplink({
                          command: "search-courses",
                          context: { courseId: course.id },
                        }),
                        name: course.displayname,
                      }}
                      shortcut={shortcut("l", ["shift"])}
                    />
                  </ActionPanel.Section>
                  <HiddenItemActionsSection item={course} />
                </ActionPanel>
              }
            />
          ))
        }
      </WithHiddenItems>
    </Grid>
  );
}
