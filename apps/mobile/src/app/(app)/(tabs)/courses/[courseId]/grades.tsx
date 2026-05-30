import { Stack, router, useLocalSearchParams, type Href } from "expo-router";
import { useMemo } from "react";
import { Text } from "react-native";

import { platformColors } from "@/constants/platform-colors";

import { EmptyState } from "@/components/empty-state";
import { LoadingState } from "@/components/loading-state";
import { GroupHeader, InsetGroup, InsetRow, NativeScrollPage, SectionTitle } from "@/components/native-ui";
import { useCourseContentsQuery, useCourseGradesQuery, useCourseScope } from "@/lib/moodle-queries";
import { useAppState } from "@/providers/app-provider";
import { toGradeRowSummaries } from "@moodle/core";

export default function CourseGradesScreen() {
  const params = useLocalSearchParams<{ courseId?: string }>();
  const scope = useCourseScope(typeof params.courseId === "string" ? params.courseId : "");
  const gradesQuery = useCourseGradesQuery(scope);
  const contentsQuery = useCourseContentsQuery(scope);
  const { activeAccount } = useAppState();

  const blueColor = platformColors.systemBlue;

  const sections = useMemo(
    () =>
      scope
        ? scope.courseIds.map((courseId, index) => {
            const table = gradesQuery.tables[index]?.tables?.[0];
            const rows = toGradeRowSummaries(table?.tabledata, {
              siteUrl: activeAccount?.origin ?? "",
            });

            return {
              courseId,
              title: scope.courses[index]?.displayname ?? scope.title,
              rows,
            };
          })
        : [],
    [activeAccount?.origin, gradesQuery.tables, scope],
  );

  const scopedModuleIdByRawModuleId = useMemo(() => {
    const result = new Map<number, string>();
    for (const section of contentsQuery.data?.sections ?? []) {
      for (const module of section.modules) {
        result.set(module.module.id, module.id);
      }
    }
    return result;
  }, [contentsQuery.data?.sections]);

  if (!scope) {
    return <EmptyState title="Course not found" description="This course is no longer available." />;
  }

  if (gradesQuery.error) {
    return (
      <EmptyState
        title="Grades unavailable"
        description="Could not load grades."
      />
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: "Grades" }} />
      <NativeScrollPage>
        <SectionTitle eyebrow="Grades" title={scope.title} />

        {gradesQuery.isLoading ? (
          <LoadingState />
        ) : sections.every((section) => section.rows.length === 0) ? (
          <EmptyState title="No grades found" description="No grades available." />
        ) : (
          sections.map((section) => {
            if (section.rows.length === 0) return null;

            return (
              <InsetGroup key={section.courseId}>
                <GroupHeader
                  title={section.title}
                  subtitle={scope.courseIds.length > 1 ? `Course ID ${section.courseId}` : "Grade breakdown"}
                />
                {section.rows.map((row, rowIndex) => {
                  const scopedModuleId =
                    row.moduleId != null ? scopedModuleIdByRawModuleId.get(row.moduleId) : undefined;
                  const detail = row.grade ?? "—";
                  const subtitle = [row.range, row.percentage].filter(Boolean).join("  ·  ");
                  const isTotal = /(^|\b)(total|course total|overall)(\b|$)/i.test(row.label);

                  return (
                    <InsetRow
                      key={`${row.label}:${rowIndex}`}
                      first={rowIndex === 0}
                      last={rowIndex === section.rows.length - 1}
                      title={row.label}
                      subtitle={subtitle || undefined}
                      detail={detail}
                      showChevron={Boolean(scopedModuleId)}
                      accessory={
                        isTotal ? (
                          <Text selectable style={{ fontSize: 13, fontWeight: "700", color: blueColor }}>
                            Total
                          </Text>
                        ) : null
                      }
                      onPress={
                        scopedModuleId
                          ? () =>
                              router.push({
                                pathname: "/courses/[courseId]/content/[contentId]",
                                params: { courseId: scope.id, contentId: scopedModuleId },
                              } as unknown as Href)
                          : undefined
                      }
                    />
                  );
                })}
              </InsetGroup>
            );
          })
        )}


      </NativeScrollPage>
    </>
  );
}
