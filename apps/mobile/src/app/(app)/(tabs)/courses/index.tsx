import { FlashList } from "@shopify/flash-list";
import { Button, Host, Menu } from "@expo/ui/swift-ui";
import { Image } from "expo-image";
import { Stack, router } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View } from "react-native";

import { useQueryClient } from "@tanstack/react-query";

import { EmptyState } from "@/components/empty-state";
import { HeaderAccountButton } from "@/components/header-account-button";
import { InsetGroup, InsetRow, NativePage, SymbolBadge, nativePageContentContainerStyle } from "@/components/native-ui";
import { resolveMoodleImageUrl } from "@/lib/moodle-images";
import { buildCourseContentQueryOptions, useCoursesQuery } from "@/lib/moodle-queries";
import { useAppState } from "@/providers/app-provider";

export default function CoursesScreen() {
  const { activeAccount, accountSession, refreshAccountSession } = useAppState();
  const coursesQuery = useCoursesQuery();
  const queryClient = useQueryClient();
  const [selectedSemester, setSelectedSemester] = useState<string>("all");
  const interactedRef = useRef(false);

  useEffect(() => {
    if (!interactedRef.current && coursesQuery.data?.currentSemester) {
      setSelectedSemester(coursesQuery.data.currentSemester);
    }
  }, [coursesQuery.data?.currentSemester]);

  const semesters = useMemo(() => {
    return ["all", ...(coursesQuery.data?.semesters ?? [])];
  }, [coursesQuery.data?.semesters]);

  const visibleScopes = useMemo(() => {
    const filtered =
      selectedSemester === "all"
        ? coursesQuery.data?.allScopes ?? []
        : (coursesQuery.data?.allScopes ?? []).filter(
            (scope) => scope.mergedCourse.semester === selectedSemester,
          );

    return [...filtered].sort((left, right) => {
      const modifiedDelta = right.mergedCourse.timemodified - left.mergedCourse.timemodified;
      if (modifiedDelta !== 0) return modifiedDelta;
      return left.title.localeCompare(right.title);
    });
  }, [coursesQuery.data?.allScopes, selectedSemester]);

  const selectSemester = useCallback((semester: string) => {
    interactedRef.current = true;
    setSelectedSemester(semester);
  }, []);

  const filterLabel = selectedSemester === "all" ? "All" : selectedSemester;

  return (
    <>
      <Stack.Screen
        options={{
          title: "Courses",
          headerLargeTitle: false,
          headerTitleAlign: "center",
          headerRight: () => <HeaderAccountButton />,
          headerLeft: () => (
            <Host matchContents style={{ marginLeft: 8 }}>
              <Menu label={filterLabel} systemImage="line.3.horizontal.decrease.circle">
                {semesters.map((semester) => {
                  const isSelected = semester === selectedSemester;
                  const rowLabel = semester === "all" ? "All" : semester;

                  return (
                    <Button
                      key={semester}
                      label={rowLabel}
                      systemImage={isSelected ? "checkmark" : undefined}
                      onPress={() => selectSemester(semester)}
                    />
                  );
                })}
              </Menu>
            </Host>
          ),
        }}
      />
      <NativePage>
        <FlashList
          data={visibleScopes}
          keyExtractor={(item) => item.id}
          contentInsetAdjustmentBehavior="automatic"
          contentContainerStyle={nativePageContentContainerStyle}
          ItemSeparatorComponent={CourseListSpacer}
          ListHeaderComponent={null}
          ListEmptyComponent={
            coursesQuery.isLoading ? (
              <EmptyState title="Loading courses" />
            ) : (
              <EmptyState title="No courses found" description="Try switching to All semesters." />
            )
          }
          renderItem={({ item: scope }) => {
            const session = activeAccount ? accountSession(activeAccount.id) : null;
            const coverImageUrl = resolveMoodleImageUrl({
              url: scope.mergedCourse.courseimage,
              siteOrigin: activeAccount?.origin,
              accessKey: session?.accessKey,
            });

            return (
              <InsetGroup>
                <InsetRow
                  first
                  last
                  title={scope.title}
                  leading={
                    coverImageUrl ? (
                      <Image
                        source={coverImageUrl}
                        style={{ width: 38, height: 38, borderRadius: 12 }}
                        contentFit="cover"
                      />
                    ) : (
                      <SymbolBadge symbol="book.closed" />
                    )
                  }
                  onPress={() =>
                    router.push({ pathname: "/courses/[courseId]", params: { courseId: scope.id } })
                  }
                  onPressIn={() => {
                    if (!activeAccount || !session) return;
                    void Promise.all(
                      scope.courseIds.map(async (courseId) =>
                        await queryClient.prefetchQuery(
                          buildCourseContentQueryOptions({
                            siteOrigin: activeAccount.origin,
                            session,
                            courseId,
                            refreshSession: async () => await refreshAccountSession(activeAccount.id),
                          }),
                        ),
                      ),
                    );
                  }}
                />
              </InsetGroup>
            );
          }}
        />
      </NativePage>
    </>
  );
}

function CourseListSpacer() {
  return <View style={{ height: 12 }} />;
}

