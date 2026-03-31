import { useRouter } from "expo-router";
import { useMemo } from "react";
import { Platform, Text, useWindowDimensions, type ColorValue } from "react-native";

import heuristicTableRenderers from "@native-html/heuristic-table-plugin";
import { platformColors } from "@/constants/platform-colors";
import RenderHTML, {
  HTMLContentModel,
  HTMLElementModel,
  IMGElement,
  useNormalizedUrl,
  type CustomMixedRenderer,
} from "@native-html/render";

import type { CoreCourseModuleContentFile } from "@moodle/core";
import { handleMoodleFileUrl } from "@moodle/core";

import { MaxContentWidth } from "@/constants/theme";
import { openExternalUrl } from "@/lib/browser";
import { MoodleMath } from "@/components/moodle-math";
import {
  extractMoodleActivityModuleId,
  MOODLE_MATH_BLOCK_TAG,
  MOODLE_MATH_INLINE_TAG,
  prepareMoodleHtml,
} from "@/lib/moodle-html";
import { buildAutologinRedirectUrl } from "@/lib/moodle-client";
import type { MoodleSession } from "@/lib/moodle-types";
import { presentSafariLinkPreview } from "@/lib/safari-link-preview";
import { useAppState } from "@/providers/app-provider";

type MoodleHtmlProps = {
  html: string;
  baseUrl?: string;
  contents?: readonly CoreCourseModuleContentFile[];
  scopeId?: string;
  variant?: "primary" | "secondary";
};

const customHTMLElementModels = {
  [MOODLE_MATH_INLINE_TAG]: HTMLElementModel.fromCustomModel({
    tagName: MOODLE_MATH_INLINE_TAG,
    contentModel: HTMLContentModel.textual,
  }),
  [MOODLE_MATH_BLOCK_TAG]: HTMLElementModel.fromCustomModel({
    tagName: MOODLE_MATH_BLOCK_TAG,
    contentModel: HTMLContentModel.block,
  }),
};

type LinkHandlerInput = {
  href: string;
  routerPush: (courseId: string, contentId: string) => void;
  scopeId?: string;
  siteOrigin?: string;
  session: MoodleSession | null;
};

export function MoodleHtml({
  html,
  baseUrl,
  contents,
  scopeId,
  variant = "primary",
}: MoodleHtmlProps) {
  const { width } = useWindowDimensions();
  const router = useRouter();
  const { activeAccount, accountSession } = useAppState();
  const session = activeAccount ? accountSession(activeAccount.id) : null;
  const textColor: ColorValue = variant === "secondary" ? platformColors.secondaryLabel : platformColors.label;
  const linkColor = platformColors.systemBlue;
  const mathTextColor = variant === "secondary" ? "rgba(60,60,67,0.6)" : "#000000";
  const contentWidth = Math.max(0, Math.min(width, MaxContentWidth) - 64);

  const source = useMemo(
    () => ({
      html: prepareMoodleHtml({
        html,
        baseUrl,
        contents,
        siteOrigin: activeAccount?.origin,
        accessKey: session?.accessKey,
      }),
    }),
    [activeAccount?.origin, baseUrl, contents, html, session?.accessKey],
  );
  const renderers = useMemo(
    () => ({
      a: createAnchorRenderer({
        routerPush: (courseId, contentId) =>
          router.push({
            pathname: "/courses/[courseId]/content/[contentId]",
            params: { courseId, contentId },
          }),
        scopeId,
        siteOrigin: activeAccount?.origin,
        session,
      }),
      img: ({ tnode }: { tnode: { attributes: Record<string, string> } }) => {
        const uri = tnode.attributes.src;
        const alt = tnode.attributes.alt;
        if (!uri) {
          return null;
        }

        return (
          <IMGElement
            source={{ uri }}
            alt={alt}
            contentWidth={contentWidth}
            computeMaxWidth={(availableWidth: number) => availableWidth}
            enableExperimentalPercentWidth
            initialDimensions={{ width: contentWidth, height: contentWidth * 0.56 }}
          />
        );
      },
      [MOODLE_MATH_INLINE_TAG]: ({ tnode }: { tnode: { attributes: Record<string, string> } }) => (
        <MoodleMath color={mathTextColor} fontSize={15} latex={tnode.attributes["data-latex"] ?? ""} />
      ),
      [MOODLE_MATH_BLOCK_TAG]: ({ tnode }: { tnode: { attributes: Record<string, string> } }) => (
        <MoodleMath color={mathTextColor} display fontSize={15} latex={tnode.attributes["data-latex"] ?? ""} />
      ),
      ...heuristicTableRenderers,
    }),
    [activeAccount?.origin, contentWidth, mathTextColor, router, scopeId, session],
  );

  if (!source.html) {
    return null;
  }

  return (
    <RenderHTML
      contentWidth={contentWidth}
      source={source}
      customHTMLElementModels={customHTMLElementModels}
      baseStyle={{
        color: textColor as string,
        fontSize: 15,
        lineHeight: 23,
      }}
      defaultTextProps={{ selectable: true }}
      enableExperimentalMarginCollapsing
      tagsStyles={{
        a: { color: linkColor as string, textDecorationLine: "none" },
        blockquote: {
          borderLeftWidth: 3,
          borderLeftColor: "rgba(120,120,128,0.3)",
          marginVertical: 6,
          paddingLeft: 12,
        },
        body: { color: textColor as string, fontSize: 15, lineHeight: 23 },
        code: {
          backgroundColor: "rgba(120,120,128,0.12)",
          borderRadius: 8,
          fontFamily: Platform.select({ ios: "ui-monospace", default: "monospace" }),
          paddingHorizontal: 4,
          paddingVertical: 2,
        },
        h1: { fontSize: 24, lineHeight: 30, fontWeight: "700", marginBottom: 8 },
        h2: { fontSize: 21, lineHeight: 27, fontWeight: "700", marginBottom: 8 },
        h3: { fontSize: 18, lineHeight: 24, fontWeight: "700", marginBottom: 6 },
        img: { marginVertical: 8 },
        li: { marginBottom: 4 },
        p: { marginTop: 0, marginBottom: 10 },
        pre: {
          backgroundColor: "rgba(120,120,128,0.12)",
          borderRadius: 12,
          padding: 12,
        },
        table: { marginVertical: 8 },
      }}
      renderersProps={{
        img: {
          enableExperimentalPercentWidth: true,
        },
        table: {
          forceStretch: true,
        },
      }}
      renderers={renderers}
    />
  );
}

function createAnchorRenderer(input: Omit<LinkHandlerInput, "href">): CustomMixedRenderer {
  return function AnchorRenderer({ TDefaultRenderer, tnode, textProps, ...props }) {
    const href = useNormalizedUrl(tnode.attributes.href);
    const canPreview = Platform.OS === "ios" && typeof href === "string" && !href.startsWith("#");

    return (
      <TDefaultRenderer
        {...props}
        tnode={tnode}
        textProps={{
          ...textProps,
          onLongPress: canPreview
            ? () => {
                void handleLinkLongPress({
                  ...input,
                  href,
                });
              }
            : undefined,
        }}
        onPress={() => {
          if (typeof href !== "string") {
            return;
          }

          void handleLinkPress({
            ...input,
            href,
          });
        }}
      />
    );
  };
}

async function handleLinkPress(input: LinkHandlerInput) {
  if (!input.href || input.href.startsWith("#")) {
    return;
  }

  const moduleId = extractMoodleActivityModuleId(input.href, input.siteOrigin);
  if (moduleId && input.scopeId) {
    input.routerPush(input.scopeId, moduleId);
    return;
  }

  const externalUrl = await resolveExternalLinkUrl(input);
  if (!externalUrl) {
    return;
  }

  await openExternalUrl(externalUrl);
}

async function handleLinkLongPress(input: LinkHandlerInput) {
  const externalUrl = await resolveExternalLinkUrl(input);
  if (!externalUrl) {
    return;
  }

  await presentSafariLinkPreview(externalUrl);
}

async function resolveExternalLinkUrl(input: LinkHandlerInput) {
  if (!input.href || input.href.startsWith("#")) {
    return null;
  }

  const moduleId = extractMoodleActivityModuleId(input.href, input.siteOrigin);
  if (moduleId && input.scopeId) {
    return null;
  }

  const handledUrl = handleMoodleFileUrl({
    url: input.href,
    accessKey: input.session?.accessKey,
    siteOrigin: input.siteOrigin,
  });

  if (!input.session || !input.siteOrigin) {
    return handledUrl;
  }

  try {
    const parsed = new URL(handledUrl, input.siteOrigin);
    if (parsed.origin === input.siteOrigin.replace(/\/$/, "") && !parsed.pathname.includes("/tokenpluginfile.php/")) {
      return await buildAutologinRedirectUrl({
        siteOrigin: input.siteOrigin,
        session: input.session,
        destinationUrl: handledUrl,
      });
    }
  } catch {
    // Fall through to the handled URL below.
  }

  return handledUrl;
}

export function MoodleHtmlFallback({ text }: { text: string }) {
  const label2Color = platformColors.secondaryLabel;

  return (
    <Text selectable style={{ fontSize: 15, lineHeight: 23, color: label2Color }}>
      {text}
    </Text>
  );
}
