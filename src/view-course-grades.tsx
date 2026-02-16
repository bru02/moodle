import { ActionPanel, Icon, List } from "@raycast/api";
import { createDeeplink } from "@raycast/utils";
// @ts-expect-error no types
import domino from "@mixmark-io/domino";
import AuthErrorDetail from "./components/AuthErrorDetail";
import { OpenInBrowserAction } from "./components/OpenInBrowserAction";
import WithHiddenItems, { HiddenItemActionsSection } from "./components/WithHiddenItems";
import { CourseScope } from "./course-scope";
import { stripHTML } from "./helpers";
import { preferences, siteOrigin } from "./helpers/preferences";
import { useWSBatchQuery } from "./hooks/useWSQuery";
import { CoreGradesTableRow } from "./types/grade";

type GradeRow = { id: string; row: CoreGradesTableRow; courseId: number };

export default function ViewCourseGrades({ scope }: { scope: CourseScope }) {
  const { data, isLoading, error, refetch } = useWSBatchQuery(
    "gradereport_user_get_grades_table",
    scope.courseIds.map((courseid) => ({ courseid, userid: 0 })),
  );

  const rows: GradeRow[] =
    data?.flatMap((courseData, index) => {
      const courseId = scope.courseIds[index];
      if (courseId == null) return [];
      return (courseData.tables?.[0]?.tabledata ?? [])
        .filter((r) => "itemname" in r && ("grade" in r || "percentage" in r))
        .map((row, i) => ({ id: `${courseId}:${row.itemname?.id ?? i}`, row, courseId }));
    }) ?? [];

  if (error) return <AuthErrorDetail error={error} onRetry={() => refetch()} />;

  return (
    <List isLoading={isLoading} navigationTitle={scope.title ? `${scope.title} Grades` : "Course Grades"}>
      <WithHiddenItems namespace={`course-grades-${scope.id}`} data={rows} getItemKey={(item) => item.id}>
        {(tableData, { isPinnedSection, hasPinnedItems }) => {
          const items = tableData.map(({ row, courseId, id }) => {
            const gradeHeader = domino.createDocument(row.itemname?.content || "").querySelector(".gradeitemheader");
            let linkedActivity = gradeHeader?.getAttribute("href");

            if (linkedActivity) {
              const url = new URL(linkedActivity);
              if (url.origin === siteOrigin) {
                const moduleId = url.searchParams.get("id");
                if (moduleId) {
                  linkedActivity = createDeeplink({
                    command: "search-courses",
                    context: { courseId, preselectItem: moduleId },
                  });
                }
              }
            }

            let accessoryText = stripHTML(row.percentage?.content || "");
            const grade = stripHTML(row.grade?.content || "")
              .split("\n")
              .shift()!;
            const range = stripHTML(row.range?.content || "");
            if (grade && range) {
              const hi = range.split("–")[1]?.trim() ?? "∞";
              accessoryText = `${grade.replace(".00", "")} / ${hi}`;
            }

            return (
              <List.Item
                key={id}
                title={gradeHeader?.innerText || "Grade Item"}
                accessories={[{ text: accessoryText }]}
                actions={
                  <ActionPanel>
                    {linkedActivity && (
                      <OpenInBrowserAction title="View Activity" icon={Icon.Link} url={linkedActivity} />
                    )}
                    <OpenInBrowserAction url={`${preferences.site_url}/grade/report/user/index.php?id=${courseId}`} />
                    <HiddenItemActionsSection item={{ id, row, courseId }} />
                  </ActionPanel>
                }
              />
            );
          });

          if (items.length === 0) return null;
          if (isPinnedSection) return <List.Section title="Pinned">{items}</List.Section>;
          if (hasPinnedItems) return <List.Section title="Others">{items}</List.Section>;
          return items;
        }}
      </WithHiddenItems>
    </List>
  );
}
