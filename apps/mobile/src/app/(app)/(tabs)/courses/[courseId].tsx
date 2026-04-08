import { Image } from "expo-image";
import { useFocusEffect } from "@react-navigation/native";
import { Stack, router, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  useWindowDimensions,
  View,
} from "react-native";
import PagerView from "react-native-pager-view";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { interpolate, useAnimatedStyle, useSharedValue } from "react-native-reanimated";
import { BlurView } from "expo-blur";
import { FadingView, Header, ScrollViewWithHeaders } from "@codeherence/react-native-header";
import type { ScrollHeaderProps } from "@codeherence/react-native-header";

import { platformColors } from "@/constants/platform-colors";

import { EmptyState } from "@/components/empty-state";
import { ModuleRow } from "@/components/module-row";
import { GroupHeader, InsetGroup, InsetRow, SymbolBadge } from "@/components/native-ui";
import { readCourseEngagement, recordCourseEngagement } from "@/lib/course-activity";
import { resolveMoodleImageUrl } from "@/lib/moodle-images";
import { useCourseContentsQuery, useCourseGradesQuery, useCourseScope } from "@/lib/moodle-queries";
import { clearCurrentUserActivity, donateUserActivity } from "@/lib/user-activity";
import { useAppState } from "@/providers/app-provider";
import { toGradeRowSummaries } from "@moodle/core";

const HERO_HEIGHT = 220;
const canUseBlurView =
  Platform.OS === "ios" || (Platform.OS === "android" && Number(Platform.Version) >= 31);

export default function CourseDetailScreen() {
  const params = useLocalSearchParams<{ courseId?: string }>();
  const scope = useCourseScope(typeof params.courseId === "string" ? params.courseId : "");
  const { activeAccount, accountSession } = useAppState();
  const [recentActivityCutoffAt, setRecentActivityCutoffAt] = useState<number | null>(null);
  const [selectedPage, setSelectedPage] = useState(0);
  const [pageHeights, setPageHeights] = useState<Record<number, number>>({ 0: 1, 1: 1 });
  const pagerRef = useRef<PagerView>(null);
  const scrollRef = useRef<Animated.ScrollView>(null);
  const selectedPageRef = useRef(0);
  const currentScrollOffsetRef = useRef(0);
  const tabScrollOffsetsRef = useRef<Record<number, number>>({ 0: 0, 1: 0 });

  const contentsQuery = useCourseContentsQuery(scope, { recentActivityCutoffAt });
  const gradesQuery = useCourseGradesQuery(scope);

  useEffect(() => {
    let cancelled = false;

    if (!activeAccount || !scope) {
      setRecentActivityCutoffAt(null);
      return;
    }

    void (async () => {
      const lastEngagedAt = await readCourseEngagement({
        accountId: activeAccount.id,
        scopeId: scope.id,
      });

      if (!cancelled) {
        setRecentActivityCutoffAt(lastEngagedAt != null ? Math.floor(lastEngagedAt / 1000) : null);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activeAccount, scope]);

  useFocusEffect(
    useCallback(() => {
      if (!activeAccount || !scope) return;

      void recordCourseEngagement({
        accountId: activeAccount.id,
        scopeId: scope.id,
        source: "course-detail",
      });

      void donateUserActivity({
        activityType: "me.toldy.moodle.view-course",
        title: scope.title,
        description: scope.title,
        route: `/courses/${scope.id}`,
        url: `mobile://courses/${scope.id}`,
        persistentIdentifier: `${activeAccount.id}:course:${scope.id}`,
        keywords: [scope.mergedCourse.courseCode, scope.mergedCourse.semester, scope.mergedCourse.seminarGroup].filter(
          (value): value is string => Boolean(value),
        ),
        userInfo: {
          accountId: activeAccount.id,
          scopeId: scope.id,
        },
      });

      return () => {
        void clearCurrentUserActivity();
      };
    }, [activeAccount, scope]),
  );

  const display = useMemo(() => contentsQuery.data?.displayLayout ?? null, [contentsQuery.data?.displayLayout]);

  const gradeSections = useMemo(
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

  const setMeasuredHeight = useCallback((page: number, height: number) => {
    setPageHeights((current) => {
      if (Math.abs((current[page] ?? 0) - height) < 1) return current;
      return { ...current, [page]: Math.max(height, 1) };
    });
  }, []);

  const captureScrollOffset = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = event.nativeEvent.contentOffset.y;
    currentScrollOffsetRef.current = y;
    tabScrollOffsetsRef.current[selectedPageRef.current] = y;
  }, []);

  const restoreScrollOffset = useCallback((page: number) => {
    const targetOffset = tabScrollOffsetsRef.current[page] ?? 0;
    setTimeout(() => {
      scrollRef.current?.scrollTo({ y: targetOffset, animated: false });
      currentScrollOffsetRef.current = targetOffset;
    }, 0);
  }, []);

  const selectPage = useCallback((page: number) => {
    const currentPage = selectedPageRef.current;
    if (page === currentPage) return;

    tabScrollOffsetsRef.current[currentPage] = currentScrollOffsetRef.current;
    setSelectedPage(page);
    pagerRef.current?.setPage(page);
    restoreScrollOffset(page);
  }, [restoreScrollOffset]);

  useEffect(() => {
    selectedPageRef.current = selectedPage;
  }, [selectedPage]);

  if (!scope) {
    return <EmptyState title="Course not found" description="This course is no longer available." />;
  }

  const session = activeAccount ? accountSession(activeAccount.id) : null;
  const coverImageUrl = resolveMoodleImageUrl({
    url: scope.mergedCourse.courseimage,
    siteOrigin: activeAccount?.origin,
    accessKey: session?.accessKey,
  });

  const contentPage = (
    <>
      {contentsQuery.isLoading ? (
        <EmptyState title="Loading content" description="Fetching course content." />
      ) : contentsQuery.error ? (
        <EmptyState title="Content unavailable" description="Could not load course sections." />
      ) : display ? (
        <>
          {display.surfacedModules.length > 0 ? (
            <InsetGroup>
              <GroupHeader title="Actionable now" />
              {display.surfacedModules.map((module, index) => (
                <ModuleRow
                  key={module.id}
                  module={module}
                  courseId={scope.id}
                  first={index === 0}
                  last={index === display.surfacedModules.length - 1}
                />
              ))}
            </InsetGroup>
          ) : null}

          {display.sections.map((section) => (
            <InsetGroup key={section.id}>
              <GroupHeader title={section.title} />
              {section.modules.map((module, index) => (
                <ModuleRow
                  key={module.id}
                  module={module}
                  courseId={scope.id}
                  first={index === 0}
                  last={index === section.modules.length - 1}
                />
              ))}
            </InsetGroup>
          ))}
        </>
      ) : (
        <EmptyState title="This course is light on native content" description="No sections available." />
      )}
    </>
  );

  const gradesPage = (
    <>
      {gradesQuery.error ? (
        <EmptyState title="Grades unavailable" description="Could not load grades." />
      ) : gradesQuery.isLoading ? (
        <EmptyState title="Loading grades" description="Loading grades." />
      ) : gradeSections.every((section) => section.rows.length === 0) ? (
        <EmptyState title="No grades found" description="No grades available." />
      ) : (
        gradeSections.map((section) => {
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
                        <Text selectable style={styles.totalLabel}>
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
                            })
                        : undefined
                    }
                  />
                );
              })}
            </InsetGroup>
          );
        })
      )}
    </>
  );

  return (
    <>
      <Stack.Screen options={{ headerShown: false, fullScreenGestureEnabled: false, gestureResponseDistance: { start: 24 } }} />
      <CourseScrollPage
        coverImageUrl={coverImageUrl}
        title={scope.title}
        semester={scope.mergedCourse.semester}
        scrollRef={scrollRef}
        onScrollEndDrag={captureScrollOffset}
        onMomentumScrollEnd={captureScrollOffset}
      >
        <CoursePageTabs selectedPage={selectedPage} onSelectPage={selectPage} />

        <PagerView
          ref={pagerRef}
          style={[styles.bodyPager, { height: pageHeights[selectedPage] ?? 1 }]}
          initialPage={0}
          overdrag={false}
          onPageSelected={(event) => {
            const nextPage = event.nativeEvent.position;
            const currentPage = selectedPageRef.current;
            tabScrollOffsetsRef.current[currentPage] = currentScrollOffsetRef.current;
            setSelectedPage(nextPage);
            restoreScrollOffset(nextPage);
          }}
        >
          <View key="content" collapsable={false} style={styles.pagerPage}>
            <View style={styles.pageBody} onLayout={(event) => setMeasuredHeight(0, event.nativeEvent.layout.height)}>
              {contentPage}
            </View>
          </View>

          <View key="grades" collapsable={false} style={styles.pagerPage}>
            <View style={styles.pageBody} onLayout={(event) => setMeasuredHeight(1, event.nativeEvent.layout.height)}>
              {gradesPage}
            </View>
          </View>
        </PagerView>
      </CourseScrollPage>
    </>
  );
}

function CourseScrollPage({
  coverImageUrl,
  title,
  semester,
  scrollRef,
  onScrollEndDrag,
  onMomentumScrollEnd,
  children,
}: {
  coverImageUrl: string | undefined;
  title: string;
  semester: string | null | undefined;
  scrollRef?: RefObject<Animated.ScrollView | null>;
  onScrollEndDrag?: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
  onMomentumScrollEnd?: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
  children: ReactNode;
}) {
  return (
    <ScrollViewWithHeaders
      ref={scrollRef}
      HeaderComponent={(props) => (
        <CourseHeader {...props} coverImageUrl={coverImageUrl} title={title} semester={semester} />
      )}
      absoluteHeader
      disableAutoFixScroll
      ignoreLeftSafeArea
      ignoreRightSafeArea
      headerFadeInThreshold={0.3}
      onScrollEndDrag={onScrollEndDrag}
      onMomentumScrollEnd={onMomentumScrollEnd}
      style={{ backgroundColor: platformColors.systemGroupedBackground }}
      contentContainerStyle={{ paddingBottom: 112 }}
      containerStyle={{ backgroundColor: platformColors.systemGroupedBackground }}
    >
      <View style={styles.contentContainer}>{children}</View>
    </ScrollViewWithHeaders>
  );
}

function CoursePageTabs({
  selectedPage,
  onSelectPage,
}: {
  selectedPage: number;
  onSelectPage: (page: number) => void;
}) {
  return (
    <View style={styles.tabsRoot}>
      <Pressable
        accessibilityRole="button"
        onPress={() => onSelectPage(0)}
        style={[styles.tabButton, selectedPage === 0 ? styles.tabButtonActive : null]}
      >
        <Text style={[styles.tabLabel, selectedPage === 0 ? styles.tabLabelActive : null]}>Content</Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        onPress={() => onSelectPage(1)}
        style={[styles.tabButton, selectedPage === 1 ? styles.tabButtonActive : null]}
      >
        <Text style={[styles.tabLabel, selectedPage === 1 ? styles.tabLabelActive : null]}>Grades</Text>
      </Pressable>
    </View>
  );
}

interface CourseHeaderProps extends ScrollHeaderProps {
  coverImageUrl: string | undefined;
  title: string;
  semester: string | null | undefined;
}

function CourseHeader({ showNavBar, scrollY, coverImageUrl, title, semester }: CourseHeaderProps) {
  const screenRouter = useRouter();
  const { top, left, right } = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const bannerHeight = useSharedValue(HERO_HEIGHT);

  const blurStyle = useAnimatedStyle(() => {
    const opacity = interpolate(Math.abs(scrollY.get()), [0, 60], [0, 1], "clamp");
    return { opacity };
  });

  const bannerTranslationStyle = useAnimatedStyle(() => {
    const translateY = interpolate(scrollY.get(), [0, HERO_HEIGHT], [0, -HERO_HEIGHT * 0.8], "clamp");
    return { transform: [{ translateY }] };
  });

  const animatedScaleStyle = useAnimatedStyle(() => {
    const currentBannerHeight = bannerHeight.get();
    const ratio = height / currentBannerHeight;
    const scale = interpolate(scrollY.get(), [0, -(height + currentBannerHeight)], [1, ratio], "clamp");
    return { transform: [{ scaleY: scale }, { scaleX: scale }] };
  }, [height]);

  const titleOpacityStyle = useAnimatedStyle(() => {
    const opacity = interpolate(scrollY.get(), [0, HERO_HEIGHT * 0.6], [1, 0], "clamp");
    return { opacity };
  });

  const heroTotalHeight = HERO_HEIGHT + top;

  return (
    <View style={[styles.headerRoot, { height: heroTotalHeight }]}>
      <Animated.View style={[StyleSheet.absoluteFill, bannerTranslationStyle]}>
        <Animated.View
          onLayout={(event) => {
            bannerHeight.set(event.nativeEvent.layout.height);
          }}
          style={animatedScaleStyle}
        >
          {coverImageUrl ? (
            <Image source={coverImageUrl} style={[styles.heroImage, { width, height: heroTotalHeight }]} contentFit="cover" />
          ) : (
            <View style={[styles.heroPlaceholder, { width, height: heroTotalHeight }]}>
              <SymbolBadge symbol="book.closed.fill" />
            </View>
          )}

          {canUseBlurView ? (
            <Animated.View style={[StyleSheet.absoluteFill, { zIndex: 1 }, blurStyle]}>
              <BlurView style={StyleSheet.absoluteFill} intensity={60} tint="dark" />
            </Animated.View>
          ) : (
            <Animated.View
              style={[StyleSheet.absoluteFill, { zIndex: 1, backgroundColor: "rgba(0,0,0,0.5)" }, blurStyle]}
            />
          )}
        </Animated.View>
      </Animated.View>

      <Header
        showNavBar={showNavBar}
        headerStyle={styles.transparentHeader}
        headerCenterFadesIn={false}
        noBottomBorder
        headerLeft={
          <View style={styles.headerLeftContainer}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Go back"
              onPress={() => screenRouter.back()}
              style={styles.headerButton}
            >
              <Image source="sf:chevron.left" style={styles.headerBackIcon} contentFit="contain" />
            </Pressable>
            <FadingView opacity={showNavBar} style={styles.fadingTitleContainer}>
              <Text numberOfLines={1} style={styles.navBarTitle}>
                {title}
              </Text>
            </FadingView>
          </View>
        }
        headerLeftStyle={{ paddingLeft: Math.max(left, 8), flex: 1 }}
        headerRightStyle={{ paddingRight: Math.max(right, 8) }}
      />

      <Animated.View
        style={[
          styles.heroTitleOverlay,
          {
            paddingHorizontal: Math.max(left, 20),
          },
          titleOpacityStyle,
        ]}
        pointerEvents="none"
      >
        <View style={styles.scrim}>
          <View style={styles.heroTextGroup}>
            <Text selectable style={styles.semesterLabel}>
              {(semester ?? "Course").toUpperCase()}
            </Text>
            <Text selectable style={styles.courseTitle}>
              {title}
            </Text>
          </View>
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  bodyPager: {
    width: "100%",
  },
  pagerPage: {
    width: "100%",
    height: "100%",
  },
  pageBody: {
    gap: 20,
  },
  tabsRoot: {
    alignSelf: "center",
    flexDirection: "row",
    borderRadius: 12,
    borderCurve: "continuous",
    padding: 4,
    backgroundColor: platformColors.secondarySystemGroupedBackground,
    marginBottom: 8,
  },
  tabButton: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    borderCurve: "continuous",
  },
  tabButtonActive: {
    backgroundColor: platformColors.systemBackground,
  },
  tabLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: platformColors.secondaryLabel,
  },
  tabLabelActive: {
    color: platformColors.label,
  },
  totalLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: platformColors.systemBlue,
  },
  headerRoot: {
    position: "relative",
    zIndex: 1,
  },
  transparentHeader: {
    backgroundColor: "transparent",
  },
  headerLeftContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
  },
  headerButton: {
    justifyContent: "center",
    alignItems: "center",
    minWidth: 28,
    height: 32,
    marginLeft: -2,
  },
  headerBackIcon: {
    width: 13,
    height: 22,
    tintColor: "#FFFFFF",
  },
  navBarTitle: {
    fontSize: 17,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  fadingTitleContainer: {
    flex: 1,
  },
  heroImage: {
    height: HERO_HEIGHT,
  },
  heroPlaceholder: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: platformColors.secondarySystemGroupedBackground,
  },
  scrim: {
    backgroundColor: "rgba(0,0,0,0.45)",
    borderRadius: 16,
    padding: 16,
  },
  heroTitleOverlay: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingBottom: 24,
    zIndex: 2,
  },
  heroTextGroup: {
    gap: 6,
  },
  semesterLabel: {
    fontSize: 13,
    fontWeight: "600",
    letterSpacing: 0.8,
    color: "rgba(255,255,255,0.85)",
  },
  courseTitle: {
    fontSize: 28,
    lineHeight: 33,
    fontWeight: "800",
    color: "#FFFFFF",
    letterSpacing: -0.4,
  },
  contentContainer: {
    width: "100%",
    maxWidth: 800,
    alignSelf: "center",
    paddingHorizontal: 16,
    paddingTop: 10,
    gap: 12,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderCurve: "continuous",
    backgroundColor: platformColors.systemGroupedBackground,
    marginTop: -30,
  },
});
