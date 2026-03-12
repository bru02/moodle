import { Action, ActionPanel, Icon, List } from "@raycast/api";
import { useMemo } from "react";
import AuthErrorDetail from "./components/AuthErrorDetail";
import { OpenInBrowserAction } from "./components/OpenInBrowserAction";
import { buildScopedSections } from "./course-content";
import { CourseScope } from "./course-scope";
import { preferences } from "./helpers/preferences";
import { useWSBatchQuery } from "./hooks/useWSQuery";
import { useCourseSyllabusAnalysis } from "./syllabus-analysis";

export default function ViewCourseGrades({
  scope,
  forceRefresh = false,
}: {
  scope: CourseScope;
  forceRefresh?: boolean;
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

  const sections = useMemo(() => buildScopedSections(scope, contentsQuery.data), [contentsQuery.data, scope]);
  const analysis = useCourseSyllabusAnalysis({
    scope,
    sections,
    gradeData: gradesQuery.data,
    forceRefresh,
  });

  if (gradesQuery.error) return <AuthErrorDetail error={gradesQuery.error} onRetry={() => gradesQuery.refetch()} />;
  if (contentsQuery.error)
    return <AuthErrorDetail error={contentsQuery.error} onRetry={() => contentsQuery.refetch()} />;

  const payload = analysis.payload;

  return (
    <List
      isLoading={gradesQuery.isLoading || contentsQuery.isLoading || analysis.isLoading}
      navigationTitle={scope.title ? `${scope.title} Grades` : "Course Grades"}
      searchBarPlaceholder="Filter syllabus components"
    >
      {payload?.sections.map((section) => (
        <List.Section key={section.id} title={`${section.label}${formatSectionRollup(section)}`}>
          {section.rows.map((row) => (
            <List.Item
              key={row.id}
              title={row.label}
              subtitle={row.effective?.label && row.effective.label !== row.label ? row.effective.label : undefined}
              accessories={buildRowAccessories(row)}
              actions={
                <ActionPanel>
                  <Action title="Refresh Syllabus Analysis" icon={Icon.ArrowClockwise} onAction={analysis.refresh} />
                  <OpenInBrowserAction
                    url={buildGradebookUrl(scope, row.moodle?.courseId ?? row.effective?.courseId)}
                  />
                </ActionPanel>
              }
            />
          ))}
        </List.Section>
      ))}

      {payload && payload.unassignedMoodleRows.length > 0 && (
        <List.Section title="Unassigned Moodle Items">
          {payload.unassignedMoodleRows.map((row) => (
            <List.Item
              key={row.id}
              title={row.label}
              accessories={[
                ...(row.raw != null && row.max != null
                  ? [{ text: `${trimNumber(row.raw)} / ${trimNumber(row.max)}` }]
                  : []),
                { tag: "Moodle" },
              ]}
              actions={
                <ActionPanel>
                  <Action title="Refresh Syllabus Analysis" icon={Icon.ArrowClockwise} onAction={analysis.refresh} />
                  <OpenInBrowserAction url={buildGradebookUrl(scope, row.courseId)} />
                </ActionPanel>
              }
            />
          ))}
        </List.Section>
      )}

      {!payload && !analysis.isLoading && (
        <List.EmptyView
          title="No Syllabus Analysis Yet"
          description="Open a synced syllabus artifact or refresh the analysis after your course files finish syncing."
          actions={
            <ActionPanel>
              <Action title="Refresh Syllabus Analysis" icon={Icon.ArrowClockwise} onAction={analysis.refresh} />
            </ActionPanel>
          }
        />
      )}

      {payload?.status === "failed" && (
        <List.EmptyView
          title="Syllabus Analysis Failed"
          description={payload.error ?? "Gemini could not parse the selected syllabus artifact."}
          actions={
            <ActionPanel>
              <Action title="Refresh Syllabus Analysis" icon={Icon.ArrowClockwise} onAction={analysis.refresh} />
            </ActionPanel>
          }
        />
      )}
    </List>
  );
}

function buildRowAccessories(
  row: NonNullable<ReturnType<typeof useCourseSyllabusAnalysis>["payload"]>["sections"][number]["rows"][number],
) {
  const accessories: List.Item.Accessory[] = [];
  if (row.effective?.raw != null && row.effective.max != null) {
    accessories.push({ text: `${trimNumber(row.effective.raw)} / ${trimNumber(row.effective.max)}` });
  } else {
    accessories.push({ tag: "Unposted" });
  }

  accessories.push({
    tag:
      row.source === "both"
        ? "Both"
        : row.source === "xlsx"
          ? "Excel"
          : row.source === "moodle"
            ? "Moodle"
            : "Unposted",
  });
  return accessories;
}

function formatSectionRollup(
  section: NonNullable<ReturnType<typeof useCourseSyllabusAnalysis>["payload"]>["sections"][number],
) {
  if (section.postedPoints == null || section.totalPoints == null) return "";
  const percentText = section.effectivePercent != null ? ` • ${trimNumber(section.effectivePercent)}%` : "";
  return ` • ${trimNumber(section.postedPoints)} / ${trimNumber(section.totalPoints)}${percentText}`;
}

function trimNumber(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/\.?0+$/, "");
}

function buildGradebookUrl(scope: CourseScope, courseId?: number) {
  return `${preferences.site_url}/grade/report/user/index.php?id=${courseId ?? scope.mergedCourse.id}`;
}
