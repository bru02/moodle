import { isAuthError, toGradeRowSummaries, type CourseScope } from "@moodle/core";
import { ActionPanel, List } from "@raycast/api";
import { useMemo } from "react";

import AuthErrorDetail from "./components/AuthErrorDetail";
import { OpenInBrowserAction } from "./components/OpenInBrowserAction";
import { preferences } from "./helpers/preferences";
import { useWSBatchQuery } from "./hooks/useWSQuery";

export default function ViewCourseGrades({
  scope,
}: {
  scope: CourseScope;
}) {
  const gradesQuery = useWSBatchQuery(
    "gradereport_user_get_grades_table",
    scope.courseIds.map((courseid) => ({ courseid, userid: 0 })),
  );
  const contentsQuery = useWSBatchQuery(
    "core_course_get_contents",
    scope.courseIds.map((courseid) => ({ courseid })),
    {
      staleTime: 0,
    },
  );

  const moodleSections = useMemo(
    () =>
      scope.courseIds.map((courseId, index) => {
        const table = gradesQuery.data?.[index]?.tables?.[0];
        return {
          courseId,
          title: scope.courses[index]?.displayname ?? scope.title,
          rows: toGradeRowSummaries(table?.tabledata, {
            siteUrl: preferences.site_url,
          }),
        };
      }),
    [gradesQuery.data, scope],
  );

  if (gradesQuery.error && isAuthError(gradesQuery.error)) {
    return <AuthErrorDetail error={gradesQuery.error} onRetry={() => gradesQuery.refetch()} />;
  }
  if (contentsQuery.error)
    if (isAuthError(contentsQuery.error)) {
      return <AuthErrorDetail error={contentsQuery.error} onRetry={() => contentsQuery.refetch()} />;
    }

  return (
    <List
      isLoading={gradesQuery.isLoading || contentsQuery.isLoading}
      navigationTitle={scope.title ? `${scope.title} Grades` : "Course Grades"}
      searchBarPlaceholder="Filter Moodle grades"
    >
      {moodleSections.map((section) => {
        if (section.rows.length === 0) return null;

        return (
          <List.Section
            key={section.courseId}
            title={section.title}
            subtitle={scope.courseIds.length > 1 ? `Course ID ${section.courseId}` : "Moodle grade table"}
          >
            {section.rows.map((row, rowIndex) => (
              <List.Item
                key={`${section.courseId}:${row.label}:${rowIndex}`}
                title={row.label}
                subtitle={[row.range, row.percentage].filter(Boolean).join(" · ") || undefined}
                accessories={row.grade ? [{ text: row.grade }] : []}
                actions={
                  <ActionPanel>
                    <OpenInBrowserAction url={buildGradebookUrl(scope, section.courseId)} />
                  </ActionPanel>
                }
              />
            ))}
          </List.Section>
        );
      })}
    </List>
  );
}

function buildGradebookUrl(scope: CourseScope, courseId?: number) {
  return `${preferences.site_url}/grade/report/user/index.php?id=${courseId ?? scope.mergedCourse.id}`;
}
