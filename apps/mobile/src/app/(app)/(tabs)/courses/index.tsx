import { FlashList } from "@shopify/flash-list";
import { Button, Host, Menu } from "@expo/ui/swift-ui";
import { Image } from "expo-image";
import * as Calendar from "expo-calendar/next";
import { Stack, router } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { View } from "react-native";

import { useQueryClient } from "@tanstack/react-query";

import { EmptyState } from "@/components/empty-state";
import { HeaderAccountButton } from "@/components/header-account-button";
import { InsetGroup, InsetRow, NativePage, SymbolBadge, nativePageContentContainerStyle } from "@/components/native-ui";
import { resolveMoodleImageUrl } from "@/lib/moodle-images";
import { buildCourseContentQueryOptions, useCoursesQuery } from "@/lib/moodle-queries";
import { useAppState } from "@/providers/app-provider";

type CourseListItem = {
  id: string;
  title: string;
  courseIds: number[];
  coverImageUrl?: string;
  isCurrent: boolean;
};

const CURRENT_COURSE_WINDOW_MS = 10 * 60 * 1000;
const CURRENT_COURSE_REFRESH_MS = 60 * 1000;

export default function CoursesScreen() {
  const { activeAccount, accountSession, refreshAccountSession } = useAppState();
  const coursesQuery = useCoursesQuery();
  const queryClient = useQueryClient();
  const currentCourseTitles = useCurrentCourseTitles();
  const [selectedSemesterOverride, setSelectedSemesterOverride] = useState<string | undefined>(undefined);
  const selectedSemester = selectedSemesterOverride ?? coursesQuery.data?.currentSemester ?? "all";
  const session = activeAccount ? accountSession(activeAccount.id) : null;
  const currentCourseTitleSet = useMemo(() => new Set(currentCourseTitles), [currentCourseTitles]);

  const semesters = useMemo(() => {
    return ["all", ...(coursesQuery.data?.semesters ?? [])];
  }, [coursesQuery.data?.semesters]);

  const visibleItems = useMemo(() => {
    const filtered =
      selectedSemester === "all"
        ? coursesQuery.data?.allScopes ?? []
        : (coursesQuery.data?.allScopes ?? []).filter(
            (scope) => scope.mergedCourse.semester === selectedSemester,
          );

    return [...filtered].sort((left, right) => {
      const leftIsCurrent = currentCourseTitleSet.has(normalizeCourseTitle(left.title));
      const rightIsCurrent = currentCourseTitleSet.has(normalizeCourseTitle(right.title));
      if (leftIsCurrent !== rightIsCurrent) {
        return leftIsCurrent ? -1 : 1;
      }

      const modifiedDelta = right.mergedCourse.timemodified - left.mergedCourse.timemodified;
      if (modifiedDelta !== 0) return modifiedDelta;
      return left.title.localeCompare(right.title);
    }).map((scope) => ({
      id: scope.id,
      title: scope.title,
      courseIds: scope.courseIds,
      isCurrent: currentCourseTitleSet.has(normalizeCourseTitle(scope.title)),
      coverImageUrl: resolveMoodleImageUrl({
        url: scope.mergedCourse.courseimage,
        siteOrigin: activeAccount?.origin,
        accessKey: session?.accessKey,
      }),
    }));
  }, [activeAccount?.origin, coursesQuery.data?.allScopes, currentCourseTitleSet, selectedSemester, session?.accessKey]);

  const selectSemester = useCallback((semester: string) => {
    setSelectedSemesterOverride(semester);
  }, []);

  const prefetchCourseContents = useCallback((courseIds: number[]) => {
    if (!activeAccount || !session) return;

    void Promise.all(
      courseIds.map(async (courseId) =>
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
  }, [activeAccount, queryClient, refreshAccountSession, session]);

  const openCourse = useCallback((courseId: string) => {
    router.push({ pathname: "/courses/[courseId]", params: { courseId } });
  }, []);

  const renderCourseItem = useCallback(({ item }: { item: CourseListItem }) => {
    return <CourseRow item={item} onOpen={openCourse} onPrefetch={prefetchCourseContents} />;
  }, [openCourse, prefetchCourseContents]);

  const filterLabel = selectedSemester === "all" ? "All" : selectedSemester;

  return (
    <>
      <Stack.Screen
        options={{
          title: "Courses",
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
          data={visibleItems}
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
          renderItem={renderCourseItem}
        />
      </NativePage>
    </>
  );
}

function CourseRow({
  item,
  onOpen,
  onPrefetch,
}: {
  item: CourseListItem;
  onOpen: (courseId: string) => void;
  onPrefetch: (courseIds: number[]) => void;
}) {
  const handlePress = useCallback(() => {
    onOpen(item.id);
  }, [item.id, onOpen]);

  const handlePressIn = useCallback(() => {
    onPrefetch(item.courseIds);
  }, [item.courseIds, onPrefetch]);

  return (
    <InsetGroup>
      <InsetRow
        first
        last
        title={item.title}
        subtitle={item.isCurrent ? "Now" : undefined}
        leading={
          item.coverImageUrl ? (
            <Image source={item.coverImageUrl} style={styles.courseImage} contentFit="cover" />
          ) : (
            <SymbolBadge symbol="book.closed" />
          )
        }
        onPress={handlePress}
        onPressIn={handlePressIn}
      />
    </InsetGroup>
  );
}

function CourseListSpacer() {
  return <View style={styles.spacer} />;
}

function useCurrentCourseTitles() {
  const [permission, requestPermission] = Calendar.useCalendarPermissions();
  const [titles, setTitles] = useState<string[]>([]);

  useEffect(() => {
    if (permission && !permission.granted && permission.canAskAgain) {
      void requestPermission();
    }
  }, [permission, requestPermission]);

  useEffect(() => {
    if (!permission?.granted) {
      setTitles([]);
      return;
    }

    let cancelled = false;

    const refresh = async () => {
      try {
        const now = Date.now();
        const startDate = new Date(now - CURRENT_COURSE_WINDOW_MS);
        const endDate = new Date(now + CURRENT_COURSE_WINDOW_MS);
        const calendars = await Calendar.getCalendars();
        const events = await Calendar.listEvents(calendars, startDate, endDate);
        const nextTitles = [...new Set(events.map((event) => normalizeCourseTitle(event.title)).filter(Boolean))];

        if (!cancelled) {
          setTitles(nextTitles);
        }
      } catch {
        if (!cancelled) {
          setTitles([]);
        }
      }
    };

    void refresh();
    const intervalId = globalThis.setInterval(() => {
      void refresh();
    }, CURRENT_COURSE_REFRESH_MS);

    return () => {
      cancelled = true;
      globalThis.clearInterval(intervalId);
    };
  }, [permission?.granted]);

  return titles;
}

function normalizeCourseTitle(value: string) {
  return value
    .normalize("NFKC")
    .replace(/[\u2010-\u2015\u2212]/g, "-")
    .toLocaleLowerCase("hu-HU")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

const styles = {
  courseImage: {
    width: 38,
    height: 38,
    borderRadius: 12,
  },
  spacer: {
    height: 12,
  },
};
