import { Image } from "expo-image";
import { useFocusEffect } from "@react-navigation/native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Platform, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { interpolate, useAnimatedStyle, useSharedValue } from "react-native-reanimated";
import { BlurView } from "expo-blur";
import {
  FadingView,
  Header,
  LargeHeader,
  ScrollViewWithHeaders,
} from "@codeherence/react-native-header";
import type { ScrollHeaderProps } from "@codeherence/react-native-header";

import { platformColors } from "@/constants/platform-colors";

import { EmptyState } from "@/components/empty-state";
import { ModuleRow } from "@/components/module-row";
import { GroupHeader, InsetGroup, SymbolBadge } from "@/components/native-ui";
import { readCourseEngagement, recordCourseEngagement } from "@/lib/course-activity";
import { resolveMoodleImageUrl } from "@/lib/moodle-images";
import { useCourseContentsQuery, useCourseScope } from "@/lib/moodle-queries";
import { useAppState } from "@/providers/app-provider";

const HERO_HEIGHT = 300;
const canUseBlurView =
  Platform.OS === "ios" || (Platform.OS === "android" && Number(Platform.Version) >= 31);

export default function CourseDetailScreen() {
  const params = useLocalSearchParams<{ courseId?: string }>();
  const scope = useCourseScope(typeof params.courseId === "string" ? params.courseId : "");
  const { activeAccount, accountSession } = useAppState();
  const [recentActivityCutoffAt, setRecentActivityCutoffAt] = useState<number | null>(null);
  const contentsQuery = useCourseContentsQuery(scope, { recentActivityCutoffAt });

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
        setRecentActivityCutoffAt(
          lastEngagedAt != null ? Math.floor(lastEngagedAt / 1000) : null,
        );
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activeAccount, scope]);

  const display = useMemo(() => {
    return contentsQuery.data?.displayLayout ?? null;
  }, [contentsQuery.data?.displayLayout]);

  useFocusEffect(
    useCallback(() => {
      if (!activeAccount || !scope) return;
      void recordCourseEngagement({
        accountId: activeAccount.id,
        scopeId: scope.id,
        source: "course-detail",
      });
    }, [activeAccount, scope]),
  );

  if (!scope) {
    return (
      <EmptyState
        title="Course not found"
        description="This course is no longer available."
      />
    );
  }

  const session = activeAccount ? accountSession(activeAccount.id) : null;
  const coverImageUrl = resolveMoodleImageUrl({
    url: scope.mergedCourse.courseimage,
    siteOrigin: activeAccount?.origin,
    accessKey: session?.accessKey,
  });

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollViewWithHeaders
        HeaderComponent={(props) => (
          <CourseHeader
            {...props}
            coverImageUrl={coverImageUrl}
            title={scope.title}
            semester={scope.mergedCourse.semester}
          />
        )}
        LargeHeaderComponent={() => (
          <LargeHeader headerStyle={{ minHeight: HERO_HEIGHT }} />
        )}
        absoluteHeader
        disableAutoFixScroll
        ignoreLeftSafeArea
        ignoreRightSafeArea
        headerFadeInThreshold={0.3}
        disableLargeHeaderFadeAnim
        style={{ backgroundColor: platformColors.systemGroupedBackground }}
        contentContainerStyle={{ paddingBottom: 112 }}
        containerStyle={{ backgroundColor: platformColors.systemGroupedBackground }}
      >
        <View style={styles.contentContainer}>
          {contentsQuery.isLoading ? (
            <EmptyState
              title="Loading content"
              description="Fetching course content."
            />
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
            <EmptyState
              title="This course is light on native content"
              description="No sections available."
            />
          )}
        </View>
      </ScrollViewWithHeaders>
    </>
  );
}

// ---------------------------------------------------------------------------
// Header (sticky nav bar — floats over the hero image)
// ---------------------------------------------------------------------------

interface CourseHeaderProps extends ScrollHeaderProps {
  coverImageUrl: string | undefined;
  title: string;
  semester: string | null | undefined;
}

function CourseHeader({ showNavBar, scrollY, coverImageUrl, title, semester }: CourseHeaderProps) {
  const router = useRouter();
  const { top, left, right } = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const bannerHeight = useSharedValue(HERO_HEIGHT);

  const blurStyle = useAnimatedStyle(() => {
    const opacity = interpolate(Math.abs(scrollY.value), [0, 60], [0, 1], "clamp");
    return { opacity };
  });

  const bannerTranslationStyle = useAnimatedStyle(() => {
    const translateY = interpolate(scrollY.value, [0, HERO_HEIGHT], [0, -HERO_HEIGHT * 0.5], "clamp");
    return { transform: [{ translateY }] };
  });

  const animatedScaleStyle = useAnimatedStyle(() => {
    const ratio = height / bannerHeight.value;
    const scale = interpolate(scrollY.value, [0, -(height + bannerHeight.value)], [1, ratio], "clamp");
    return { transform: [{ scaleY: scale }, { scaleX: scale }] };
  }, [height]);

  const titleOpacityStyle = useAnimatedStyle(() => {
    const opacity = interpolate(scrollY.value, [0, HERO_HEIGHT * 0.6], [1, 0], "clamp");
    return { opacity };
  });

  const heroTotalHeight = HERO_HEIGHT + top;

  return (
    <View style={[styles.headerRoot, { height: heroTotalHeight }]}>
      {/* Hero banner */}
      <Animated.View style={[StyleSheet.absoluteFill, bannerTranslationStyle]}>
        <Animated.View
          onLayout={(e) => { bannerHeight.value = e.nativeEvent.layout.height; }}
          style={animatedScaleStyle}
        >
          {coverImageUrl ? (
            <Image
              source={coverImageUrl}
              style={[styles.heroImage, { width, height: heroTotalHeight }]}
              contentFit="cover"
            />
          ) : (
            <View style={[styles.heroPlaceholder, { width, height: heroTotalHeight }]}>
              <SymbolBadge symbol="book.closed.fill" />
            </View>
          )}

          {/* Blur overlay that fades in on scroll */}
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

      {/* Sticky nav bar at top */}
      <Header
        showNavBar={showNavBar}
        headerStyle={styles.transparentHeader}
        headerCenterFadesIn={false}
        noBottomBorder
        headerLeft={
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flex: 1 }}>
            <TouchableOpacity
              onPress={() => router.back()}
              style={styles.headerButton}
            >
              <Text style={{ color: "#fff", fontSize: 17, fontWeight: "600" }}>‹</Text>
            </TouchableOpacity>
            <FadingView opacity={showNavBar} style={{ flex: 1 }}>
              <Text numberOfLines={1} style={styles.navBarTitle}>
                {title}
              </Text>
            </FadingView>
          </View>
        }
        headerLeftStyle={{ paddingLeft: Math.max(left, 8), flex: 1 }}
        headerRightStyle={{ paddingRight: Math.max(right, 8) }}
      />

      {/* Course title overlay pinned to bottom of hero */}
      <Animated.View
        style={[
          {
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            paddingHorizontal: Math.max(left, 20),
            paddingBottom: 24,
            zIndex: 2,
          },
          titleOpacityStyle,
        ]}
        pointerEvents="none"
      >
        <View style={styles.scrim}>
          <View style={{ gap: 6 }}>
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

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  headerRoot: {
    position: "relative",
    zIndex: 1,
  },
  transparentHeader: {
    backgroundColor: "transparent",
  },
  headerButton: {
    backgroundColor: "rgba(0,0,0,0.45)",
    borderRadius: 100,
    width: 30,
    height: 30,
    justifyContent: "center",
    alignItems: "center",
  },
  navBarTitle: {
    fontSize: 17,
    fontWeight: "600",
    color: "#FFFFFF",
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
    paddingTop: 24,
    gap: 24,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderCurve: "continuous",
    backgroundColor: platformColors.systemGroupedBackground,
    marginTop: -20,
  },
});
