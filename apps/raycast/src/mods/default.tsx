import { Action, ActionPanel, Color, Detail, Icon, List } from "@raycast/api";
import { getFavicon } from "@raycast/utils";
import { memo, useContext, useMemo } from "react";

import CompletionAction from "../components/CompletionAction";
import { OpenInBrowserAction } from "../components/OpenInBrowserAction";
import { HiddenItemActionsSection } from "../components/WithHiddenItems";
import CourseContext from "../course-context";
import { turndown } from "../helpers/markdown";
import { getModuleListItemId } from "../helpers/modules";
import { siteOrigin } from "../helpers/preferences";
import { Module } from "../types";
import { CoreCourseModuleCompletionStatus } from "../types/contents";

type DefaultListItemProps = {
  module: Module;
  contentFilename?: string;
} & Partial<List.Item.Props>;

function DefaultListItem({
  module,
  detail: customDetail,
  contentFilename,
  accessories,
  keywords,
  ...props
}: DefaultListItemProps) {
  const itemId = getModuleListItemId(module, {
    suffix: contentFilename,
    hasDetail: customDetail != null ? true : undefined,
  });
  const title = turndown(module.name).trim() || module.name;
  const hasDedicatedModuleDetail =
    module.modname === "assign" ||
    module.modname === "forum" ||
    module.modname === "quiz";
  const needsDescriptionMarkdown =
    (customDetail == null && !hasDedicatedModuleDetail) ||
    (module.modname === "label" && module.id < 0);
  const descriptionMarkdown = useMemo(
    () =>
      needsDescriptionMarkdown && module.description
        ? turndown(module.description)
        : "",
    [needsDescriptionMarkdown, module.description],
  );
  const detail =
    customDetail ??
    (descriptionMarkdown ? (
      <List.Item.Detail markdown={descriptionMarkdown} />
    ) : undefined);
  const { activeCourse } = useContext(CourseContext);
  const mergedKeywords = useMemo(() => {
    const values = new Set<string>();

    for (const keyword of keywords ?? []) {
      const normalized = keyword.trim().toLowerCase();
      if (normalized) values.add(normalized);
    }

    if (module.modname.trim()) {
      values.add(module.modname.trim().toLowerCase());
    }

    for (const content of module.contents ?? []) {
      const parts = content.filename.split(".");
      if (parts.length < 2) continue;
      const extension = parts.at(-1)?.trim().toLowerCase();
      if (extension) values.add(extension);
    }

    return values.size > 0 ? [...values] : undefined;
  }, [keywords, module.modname, module.contents]);
  const canViewGeneratedSectionDescription =
    module.modname === "label" && module.id < 0 && Boolean(descriptionMarkdown);
  const existingAccessories = accessories ?? [];
  const fallbackUrl =
    canViewGeneratedSectionDescription && typeof module.section === "number"
      ? `${siteOrigin}/course/view.php?id=${activeCourse.id}&expandsection=${module.section}#section-${module.section}`
      : `${siteOrigin}/course/view.php?id=${activeCourse.id}#module-${module.id}`;

  return (
    <List.Item
      id={itemId}
      title={title}
      icon={getIcon(module)}
      accessories={existingAccessories}
      keywords={mergedKeywords}
      actions={
        <ActionPanel>
          {canViewGeneratedSectionDescription && (
            <Action.Push
              title="View Description"
              icon={Icon.Eye}
              target={
                <Detail
                  navigationTitle={title}
                  markdown={descriptionMarkdown}
                />
              }
            />
          )}
          <OpenInBrowserAction
            url={
              module.modname === "url" && module.contents?.[0]
                ? module.contents[0].fileurl
                : module.url || fallbackUrl
            }
          />
          <CompletionAction module={module} course={activeCourse} />
          <HiddenItemActionsSection item={module} />
        </ActionPanel>
      }
      detail={detail}
      {...props}
    />
  );
}

export default memo(DefaultListItem);

function getIcon(module: Module) {
  let icon: Icon | undefined;
  switch (module.modname) {
    case "url":
      return module.contents?.[0]
        ? getFavicon(module.contents[0].fileurl)
        : Icon.Link;
    case "folder":
      icon = Icon.Folder;
      break;
    case "quiz":
    case "questionnaire":
    case "assign":
      icon = module.completiondata?.state
        ? module.completiondata.state ===
          CoreCourseModuleCompletionStatus.COMPLETION_COMPLETE_FAIL
          ? Icon.XMarkCircle
          : Icon.CheckCircle
        : Icon.Circle;
      break;
    case "label":
      icon = Icon.Megaphone;
      break;
    case "attendance":
      icon = Icon.PersonLines;
      break;
    case "forum":
      icon = Icon.SpeechBubbleActive;
      break;
  }

  return {
    source: icon || module.modicon,
    tintColor: Color.PrimaryText,
  };
}
