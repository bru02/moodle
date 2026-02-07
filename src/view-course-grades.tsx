import { ActionPanel, Icon, List } from "@raycast/api";
import { stripHTML } from "./helpers";
import { preferences, siteOrigin } from "./helpers/preferences";
import { Course } from "./types";
// @ts-expect-error no types
import domino from "@mixmark-io/domino";
import { createDeeplink } from "@raycast/utils";
import AuthErrorDetail from "./components/AuthErrorDetail";
import { OpenInBrowserAction } from "./components/OpenInBrowserAction";
import WithHiddenItems, { HiddenItemActionsSection } from "./components/WithHiddenItems";
import { useWSQuery } from "./hooks/useWSQuery";

export default function ViewCourseGrades({ course }: { course: Course }) {
  const { data, isLoading, error, refetch } = useWSQuery("gradereport_user_get_grades_table", {
    courseid: +course.id,
    userid: 0,
  });

  if (error) {
    return <AuthErrorDetail error={error} onRetry={() => refetch()} />;
  }

  return (
    <List isLoading={isLoading} navigationTitle="Course Grades">
      <WithHiddenItems
        namespace={`course-grades-${course.id}`}
        data={data?.tables?.[0]?.tabledata?.filter((r) => "itemname" in r && ("grade" in r || "percentage" in r)) || []}
        getItemKey={(item) => item.itemname!.id}
      >
        {(tableData) =>
          tableData.map((row, i) => {
            const gradeHeader = domino.createDocument(row.itemname?.content || "").querySelector(".gradeitemheader");
            let linkedActivity = gradeHeader?.getAttribute("href");
            console.log("Original linkedActivity:", linkedActivity);

            if (linkedActivity) {
              const url = new URL(linkedActivity);
              console.log("Parsed URL:", url);

              if (url.origin === siteOrigin) {
                console.log("Creating deeplink for URL:", url);
                const moduleId = url.searchParams.get("id");

                if (moduleId)
                  linkedActivity = createDeeplink({
                    command: "search-courses",
                    context: { courseId: course.id, preselectItem: moduleId },
                  });
              }
            }

            let accessoryText = stripHTML(row.percentage?.content || "");

            const grade = stripHTML(row.grade?.content || "")
              .split("\n")
              .shift()!;
            const range = stripHTML(row.range?.content || "");

            if (grade && range) {
              const split = range.split("–");

              const hi = split[1] ? split[1].trim() : "∞";

              accessoryText = `${grade.replace(".00", "")} / ${hi}`;
            }

            return (
              <List.Item
                key={i}
                title={gradeHeader.innerText}
                accessories={[{ text: accessoryText }]}
                actions={
                  <ActionPanel>
                    {linkedActivity && (
                      <OpenInBrowserAction title="View Activity" icon={Icon.Link} url={linkedActivity} />
                    )}
                    <OpenInBrowserAction url={`${preferences.site_url}/grade/report/user/index.php?id=${course.id}`} />
                    <HiddenItemActionsSection item={row} />
                  </ActionPanel>
                }
              />
            );
          })
        }
      </WithHiddenItems>
    </List>
  );
}
