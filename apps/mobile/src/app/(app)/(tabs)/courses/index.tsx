import { FlashList } from "@shopify/flash-list";
import { Button, Host, Menu } from "@expo/ui/swift-ui";
import { Image } from "expo-image";
import * as Calendar from "expo-calendar/next";
import { Stack, router, useFocusEffect, type Href } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View } from "react-native";

import { buildCalendarScopeMatcherForScopes, toCalendarEvent, type CourseScope } from "@moodle/core";
import { useQueryClient } from "@tanstack/react-query";

import { EmptyState } from "@/components/empty-state";
import { HeaderAccountButton } from "@/components/header-account-button";
import { headerIconButtonModifiers } from "@/components/header-glass-surface";
import { LoadingState } from "@/components/loading-state";
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

const RECENT_COURSE_GRACE_MS = 45 * 60 * 1000;
const UPCOMING_COURSE_LOOKAHEAD_MS = 7 * 24 * 60 * 60 * 1000;
const CURRENT_COURSE_REFRESH_MS = 60 * 1000;
const EMPTY_SCOPES: readonly CourseScope[] = [];

type CalendarCourseMatch = {
  startsAt: number;
  isCurrent: boolean;
  sortBucket: 0 | 1;
};

export default function CoursesScreen() {
  const { activeAccount, accountSession, refreshAccountSession } = useAppState();
  const coursesQuery = useCoursesQuery();
  const queryClient = useQueryClient();
  const calendarCourseMatches = useCalendarCourseMatches(coursesQuery.data?.allScopes ?? EMPTY_SCOPES);
  const [selectedSemesterOverride, setSelectedSemesterOverride] = useState<string | undefined>(undefined);
  const selectedSemester = selectedSemesterOverride ?? coursesQuery.data?.currentSemester ?? "all";
  const session = activeAccount ? accountSession(activeAccount.id) : null;

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
      const leftCalendarMatch = calendarCourseMatches.get(left.id);
      const rightCalendarMatch = calendarCourseMatches.get(right.id);
      if (leftCalendarMatch || rightCalendarMatch) {
        if (!leftCalendarMatch) return 1;
        if (!rightCalendarMatch) return -1;

        const bucketDelta = leftCalendarMatch.sortBucket - rightCalendarMatch.sortBucket;
        if (bucketDelta !== 0) return bucketDelta;

        const startsAtDelta = leftCalendarMatch.startsAt - rightCalendarMatch.startsAt;
        if (startsAtDelta !== 0) return startsAtDelta;
      }

      const modifiedDelta = right.mergedCourse.timemodified - left.mergedCourse.timemodified;
      if (modifiedDelta !== 0) return modifiedDelta;
      return left.title.localeCompare(right.title);
    }).map((scope) => ({
      id: scope.id,
      title: scope.title,
      courseIds: scope.courseIds,
      isCurrent: calendarCourseMatches.get(scope.id)?.isCurrent ?? false,
      coverImageUrl: resolveMoodleImageUrl({
        url: scope.mergedCourse.courseimage,
        siteOrigin: activeAccount?.origin,
        accessKey: session?.accessKey,
      }),
    }));
  }, [activeAccount?.origin, calendarCourseMatches, coursesQuery.data?.allScopes, selectedSemester, session?.accessKey]);

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

  const navigationLockRef = useRef(false);

  useFocusEffect(
    useCallback(() => {
      navigationLockRef.current = false;
    }, []),
  );

  const openCourse = useCallback((courseId: string) => {
    if (navigationLockRef.current) return;
    navigationLockRef.current = true;
    router.push({ pathname: "/courses/[courseId]", params: { courseId } } as unknown as Href);
  }, []);

  const renderCourseItem = useCallback(({ item }: { item: CourseListItem }) => {
    return <CourseRow item={item} onOpen={openCourse} onPrefetch={prefetchCourseContents} />;
  }, [openCourse, prefetchCourseContents]);

  return (
    <>
      <Stack.Screen
        options={{
          title: "Courses",
          headerLargeTitle: false,
          headerTitleAlign: "center",
          headerLeft: () => (
            <Host matchContents style={{ marginLeft: 8 }}>
              <Menu
                label="Filter semesters"
                systemImage="line.3.horizontal.decrease.circle"
                modifiers={headerIconButtonModifiers()}
              >
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
          headerRight: () => <HeaderAccountButton />,
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
              <LoadingState />
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

function useCalendarCourseMatches(scopes: readonly CourseScope[]) {
  const [permission, requestPermission] = Calendar.useCalendarPermissions();
  const [matchesByScopeId, setMatchesByScopeId] = useState<ReadonlyMap<string, CalendarCourseMatch>>(new Map());

  useEffect(() => {
    if (permission && !permission.granted && permission.canAskAgain) {
      void requestPermission();
    }
  }, [permission, requestPermission]);

  useEffect(() => {
    if (!permission?.granted || scopes.length === 0) {
      setMatchesByScopeId(new Map());
      return;
    }

    let cancelled = false;

    const refresh = async () => {
      try {
        const now = Date.now();
        const startDate = new Date(now - RECENT_COURSE_GRACE_MS);
        const endDate = new Date(now + UPCOMING_COURSE_LOOKAHEAD_MS);
        const calendars = await Calendar.getCalendars();
        const events = await Calendar.listEvents(calendars, startDate, endDate);
        const { matches } = buildCalendarScopeMatcherForScopes(scopes).matchEvents(events.map(toCalendarEvent));
        const nextMatchesByScopeId = new Map<string, CalendarCourseMatch>();

        for (const match of matches) {
          const startsAt = parseCalendarTimestamp(match.event.dtstart);
          const endsAt = parseCalendarTimestamp(match.event.dtend);
          if (startsAt == null || endsAt == null) continue;

          const isCurrent = startsAt <= now && endsAt >= now;
          const isRecent = endsAt < now && now - endsAt <= RECENT_COURSE_GRACE_MS;
          const isUpcoming = startsAt >= now;
          if (!isCurrent && !isRecent && !isUpcoming) continue;

          const sortBucket = isCurrent || isRecent ? 0 : 1;
          const existingMatch = nextMatchesByScopeId.get(match.scope.id);
          if (
            !existingMatch ||
            sortBucket < existingMatch.sortBucket ||
            (sortBucket === existingMatch.sortBucket && startsAt < existingMatch.startsAt)
          ) {
            nextMatchesByScopeId.set(match.scope.id, {
              startsAt,
              isCurrent,
              sortBucket,
            });
          }
        }

        if (!cancelled) {
          setMatchesByScopeId(nextMatchesByScopeId);
        }
      } catch {
        if (!cancelled) {
          setMatchesByScopeId(new Map());
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
  }, [permission?.granted, scopes]);

  return matchesByScopeId;
}

function parseCalendarTimestamp(value?: string) {
  if (!value) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
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
