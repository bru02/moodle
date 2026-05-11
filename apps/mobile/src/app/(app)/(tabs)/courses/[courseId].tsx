import { Image } from "expo-image";
import { useFocusEffect } from "@react-navigation/native";
import { Stack, router, useLocalSearchParams, useRouter, type Href } from "expo-router";
import SegmentedControl from "@react-native-segmented-control/segmented-control";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Platform, StyleSheet, Text, View } from "react-native";
import PagerView from "react-native-pager-view";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { Extrapolation, interpolate, useAnimatedStyle } from "react-native-reanimated";
import { BlurView } from "expo-blur";
import HeaderMotion, { useActiveScrollId, useMotionProgress } from "react-native-header-motion";

import { platformColors } from "@/constants/platform-colors";

import { EmptyState } from "@/components/empty-state";
import { ModuleRow } from "@/components/module-row";
import { NativeIconButton } from "@/components/native-icon-button";
import { GroupHeader, InsetGroup, InsetRow, SymbolBadge } from "@/components/native-ui";
import { getCourseIconTint, getCourseImageHue } from "@/lib/course-image-colors";
import { readCourseEngagement, recordCourseEngagement } from "@/lib/course-activity";
import { resolveMoodleImageUrl } from "@/lib/moodle-images";
import { useCourseContentsQuery, useCourseGradesQuery, useCourseScope } from "@/lib/moodle-queries";
import { clearCurrentUserActivity, donateUserActivity } from "@/lib/user-activity";
import { useAppState } from "@/providers/app-provider";
import { toGradeRowSummaries } from "@moodle/core";

const HERO_HEIGHT = 260;
const NAV_BAR_HEIGHT = 44;
// Distance the header collapses by. The nav bar stays pinned while the hero
// slides up behind it, so the segmented control settles right under the nav bar.
const PROGRESS_THRESHOLD = HERO_HEIGHT - NAV_BAR_HEIGHT;
const FALLBACK_COURSE_ICON_HUE = 211;
const canUseBlurView =
  Platform.OS === "ios" || (Platform.OS === "android" && Number(Platform.Version) >= 31);

type TabId = "content" | "grades";

const TAB_IDS: readonly TabId[] = ["content", "grades"];

export default function CourseDetailScreen() {
  const params = useLocalSearchParams<{ courseId?: string }>();
  const scope = useCourseScope(typeof params.courseId === "string" ? params.courseId : "");
  const { activeAccount, accountSession } = useAppState();
  const [recentActivityCutoffAt, setRecentActivityCutoffAt] = useState<number | null>(null);
  const [activeScrollId, setActiveScrollId] = useActiveScrollId<TabId>("content");
  const [hasOpenedGrades, setHasOpenedGrades] = useState(false);
  const [courseIconHue, setCourseIconHue] = useState(FALLBACK_COURSE_ICON_HUE);
  const pagerRef = useRef<PagerView>(null);

  const contentsQuery = useCourseContentsQuery(scope, { recentActivityCutoffAt });
  const gradesQuery = useCourseGradesQuery(scope, { enabled: hasOpenedGrades });

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
  const session = activeAccount ? accountSession(activeAccount.id) : null;
  const coverImageUrl = scope
    ? resolveMoodleImageUrl({
        url: scope.mergedCourse.courseimage,
        siteOrigin: activeAccount?.origin,
        accessKey: session?.accessKey,
      })
    : undefined;

  useEffect(() => {
    let cancelled = false;

    void getCourseImageHue(coverImageUrl).then((hue) => {
      if (cancelled) return;
      setCourseIconHue(hue);
    });

    return () => {
      cancelled = true;
    };
  }, [coverImageUrl]);

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

  const selectTab = useCallback(
    (id: TabId) => {
      if (id === "grades") {
        setHasOpenedGrades(true);
      }
      setActiveScrollId(id);
      const pageIndex = TAB_IDS.indexOf(id);
      if (pageIndex >= 0) {
        pagerRef.current?.setPage(pageIndex);
      }
    },
    [setActiveScrollId],
  );

  if (!scope) {
    return <EmptyState title="Course not found" description="This course is no longer available." />;
  }

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
                  tint={getCourseIconTint({ hue: courseIconHue, seminarGroup: module.course.seminarGroup })}
                  first={index === 0}
                  last={index === display.surfacedModules.length - 1}
                  showSection
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
                  tint={getCourseIconTint({ hue: courseIconHue, seminarGroup: module.course.seminarGroup })}
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
    </>
  );

  return (
    <HeaderMotion activeScrollId={activeScrollId.sv} progressThreshold={PROGRESS_THRESHOLD}>
      <HeaderMotion.Bridge>
        {(value) => (
          <Stack.Screen
            options={{
              fullScreenGestureEnabled: false,
              gestureResponseDistance: { start: 24 },
              header: () => (
                <HeaderMotion.NavigationBridge value={value}>
                  <CourseCollapsibleHeader
                    coverImageUrl={coverImageUrl}
                    title={scope.title}
                    semester={scope.mergedCourse.semester}
                    selectedTab={activeScrollId.state}
                    onSelectTab={selectTab}
                  />
                </HeaderMotion.NavigationBridge>
              ),
            }}
          />
        )}
      </HeaderMotion.Bridge>
      <PagerView
        ref={pagerRef}
        style={styles.pager}
        initialPage={0}
        onPageSelected={(event) => {
          const next = TAB_IDS[event.nativeEvent.position];
          if (next) {
            if (next === "grades") {
              setHasOpenedGrades(true);
            }
            setActiveScrollId(next);
          }
        }}
      >
        <HeaderMotion.ScrollView
          key="content"
          scrollId="content"
          style={styles.pageScrollView}
          contentContainerStyle={styles.pageContent}
        >
          {contentPage}
        </HeaderMotion.ScrollView>
        <HeaderMotion.ScrollView
          key="grades"
          scrollId="grades"
          style={styles.pageScrollView}
          contentContainerStyle={styles.pageContent}
        >
          {gradesPage}
        </HeaderMotion.ScrollView>
      </PagerView>
    </HeaderMotion>
  );
}

interface CourseCollapsibleHeaderProps {
  coverImageUrl: string | undefined;
  title: string;
  semester: string | null | undefined;
  selectedTab: TabId;
  onSelectTab: (id: TabId) => void;
}

function CourseCollapsibleHeader({
  coverImageUrl,
  title,
  semester,
  selectedTab,
  onSelectTab,
}: CourseCollapsibleHeaderProps) {
  const screenRouter = useRouter();
  const { top, left, right } = useSafeAreaInsets();
  const { progress, progressThreshold } = useMotionProgress();

  // Slide entire header up by the collapse threshold, leaving the nav bar at top.
  const containerStyle = useAnimatedStyle(() => {
    const threshold = progressThreshold.get();
    const translateY = interpolate(progress.get(), [0, 1], [0, -threshold], Extrapolation.CLAMP);
    return { transform: [{ translateY }] };
  });

  // Counter-translate the nav bar so it stays pinned to the top as the container slides up.
  const navBarStyle = useAnimatedStyle(() => {
    const threshold = progressThreshold.get();
    const translateY = interpolate(progress.get(), [0, 1], [0, threshold], Extrapolation.CLAMP);
    return { transform: [{ translateY }] };
  });

  // Nav bar background fades in as the header collapses.
  const navBarBackgroundStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.get(), [0.4, 1], [0, 1], Extrapolation.CLAMP),
  }));

  // Nav bar title fades in when collapsed.
  const navTitleStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.get(), [0.55, 1], [0, 1], Extrapolation.CLAMP),
  }));

  // Hero overlay (semester + course title) fades + scales out as the user scrolls.
  const heroOverlayStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.get(), [0, 0.6], [1, 0], Extrapolation.CLAMP),
    transform: [
      { translateY: interpolate(progress.get(), [0, 1], [0, progressThreshold.get() * 0.5], Extrapolation.CLAMP) },
      { scale: interpolate(progress.get(), [0, 1], [1, 0.92], Extrapolation.CLAMP) },
    ],
  }));

  // Hero image gets a slow parallax + slight zoom on overscroll.
  const heroImageStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: interpolate(progress.get(), [0, 1], [0, progressThreshold.get() * 0.3], Extrapolation.CLAMP) },
      { scale: interpolate(progress.get(), [-0.3, 0], [1.15, 1], Extrapolation.CLAMP) },
    ],
  }));

  return (
    <HeaderMotion.Header style={containerStyle}>
      <HeaderMotion.Header.Dynamic style={[styles.heroContainer, { height: HERO_HEIGHT + top }]}>
        <Animated.View style={[StyleSheet.absoluteFill, heroImageStyle]}>
          {coverImageUrl ? (
            <Image source={coverImageUrl} style={StyleSheet.absoluteFill} contentFit="cover" />
          ) : (
            <View style={[StyleSheet.absoluteFill, styles.heroPlaceholder]}>
              <SymbolBadge symbol="book.closed.fill" />
            </View>
          )}
        </Animated.View>

        <View style={styles.heroGradient} pointerEvents="none" />

        <Animated.View
          style={[styles.heroTitleOverlay, { paddingHorizontal: Math.max(left, 20) }, heroOverlayStyle]}
          pointerEvents="none"
        >
          <Text selectable style={styles.semesterLabel}>
            {(semester ?? "Course").toUpperCase()}
          </Text>
          <Text selectable style={styles.courseTitle}>
            {title}
          </Text>
        </Animated.View>
      </HeaderMotion.Header.Dynamic>

      <View
        style={[
          styles.tabBarContainer,
          { paddingLeft: Math.max(left, 16), paddingRight: Math.max(right, 16) },
        ]}
      >
        <SegmentedControl
          values={["Content", "Grades"]}
          selectedIndex={TAB_IDS.indexOf(selectedTab)}
          onChange={({ nativeEvent }) => {
            const next = TAB_IDS[nativeEvent.selectedSegmentIndex];
            if (next) onSelectTab(next);
          }}
        />
      </View>

      <Animated.View
        style={[
          styles.navBar,
          { paddingTop: top, paddingLeft: Math.max(left, 12), paddingRight: Math.max(right, 12) },
          navBarStyle,
        ]}
      >
        <Animated.View style={[StyleSheet.absoluteFill, navBarBackgroundStyle]} pointerEvents="none">
          {canUseBlurView ? (
            <BlurView style={StyleSheet.absoluteFill} intensity={80} tint="systemChromeMaterial" />
          ) : (
            <View style={[StyleSheet.absoluteFill, styles.navBarFallback]} />
          )}
          <View style={styles.navBarHairline} />
        </Animated.View>

        <View style={styles.navBarRow}>
          <NativeIconButton
            label="Go back"
            systemImage="chevron.left"
            tintColor={platformColors.label}
            onPress={() => screenRouter.back()}
            style={styles.headerButton}
          />
          <Animated.Text numberOfLines={1} style={[styles.navBarTitle, navTitleStyle]}>
            {title}
          </Animated.Text>
          <View style={styles.navBarSpacer} />
        </View>
      </Animated.View>
    </HeaderMotion.Header>
  );
}

const styles = StyleSheet.create({
  pager: {
    flex: 1,
  },
  pageScrollView: {
    backgroundColor: platformColors.systemGroupedBackground,
  },
  pageContent: {
    width: "100%",
    maxWidth: 800,
    alignSelf: "center",
    paddingHorizontal: 16,
    paddingBottom: 112,
    marginTop: 16,
    gap: 12,
  },
  totalLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: platformColors.systemBlue,
  },
  heroContainer: {
    width: "100%",
    overflow: "hidden",
    backgroundColor: platformColors.secondarySystemGroupedBackground,
  },
  heroGradient: {
    ...StyleSheet.absoluteFillObject,
    experimental_backgroundImage:
      "linear-gradient(to top, rgba(0,0,0,0.65) 0%, rgba(0,0,0,0.25) 45%, rgba(0,0,0,0.15) 100%)",
  },
  tabBarContainer: {
    paddingTop: 10,
    paddingBottom: 12,
    backgroundColor: platformColors.systemGroupedBackground,
  },
  navBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 2,
  },
  navBarRow: {
    height: NAV_BAR_HEIGHT,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  navBarFallback: {
    backgroundColor: platformColors.systemBackground,
  },
  navBarHairline: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: StyleSheet.hairlineWidth,
    backgroundColor: platformColors.separator,
  },
  navBarSpacer: {
    width: 36,
  },
  headerButton: {
    width: 44,
    height: 44,
  },
  navBarTitle: {
    flex: 1,
    fontSize: 17,
    fontWeight: "600",
    color: platformColors.label,
    textAlign: "center",
  },
  heroPlaceholder: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: platformColors.secondarySystemGroupedBackground,
  },
  heroTitleOverlay: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingBottom: 28,
    gap: 4,
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
});
