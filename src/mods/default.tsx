import { ActionPanel, Color, Icon, List } from "@raycast/api";
import { getFavicon } from "@raycast/utils";
import { decode } from "html-entities";
import { useContext } from "react";
import CompletionAction from "../components/CompletionAction";
import { OpenInBrowserAction } from "../components/OpenInBrowserAction";
import CourseContext from "../course-context";
import { turndown } from "../helpers/markdown";
import { getModuleListItemId } from "../helpers/modules";
import { useRenderTimer } from "../hooks/useRenderTimer";
import { Module } from "../types";
import { CoreCourseModuleCompletionStatus } from "../types/contents";
import { useModuleListContext } from "./module-list-context";

type DefaultListItemProps = {
  module: Module;
  contentFilename?: string;
} & Partial<List.Item.Props>;

export default function DefaultListItem({
  module,
  detail: customDetail,
  contentFilename,
  ...props
}: DefaultListItemProps) {
  useRenderTimer(`DefaultListItem:${module.id}`);
  const moduleListCtx = useModuleListContext();
  const itemId = getModuleListItemId(module, {
    suffix: contentFilename,
    hasDetail: customDetail != null ? true : undefined,
  });
  const shouldRenderDetail = moduleListCtx
    ? moduleListCtx.isShowingDetail && moduleListCtx.selectedItemId === itemId
    : true;
  const fallbackDetail =
    shouldRenderDetail && module.description ? <List.Item.Detail markdown={turndown(module.description)} /> : undefined;
  const detail = shouldRenderDetail ? (customDetail ?? fallbackDetail) : undefined;
  const course = useContext(CourseContext);

  return (
    <List.Item
      id={itemId}
      title={decode(module.name)}
      icon={getIcon(module)}
      actions={
        <ActionPanel>
          {module.url && (
            <OpenInBrowserAction
              url={module.modname === "url" && module.contents?.[0] ? module.contents[0].fileurl : module.url}
            />
          )}
          <CompletionAction module={module} course={course} />
        </ActionPanel>
      }
      detail={detail}
      {...props}
    />
  );
}

function getIcon(module: Module) {
  let icon: Icon | undefined;
  switch (module.modname) {
    case "url":
      return module.contents?.[0] ? getFavicon(module.contents[0].fileurl) : Icon.Link;
    case "folder":
      icon = Icon.Folder;
      break;
    case "quiz":
    case "questionnaire":
    case "assign":
      icon = module.completiondata?.state
        ? module.completiondata.state === CoreCourseModuleCompletionStatus.COMPLETION_COMPLETE_FAIL
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
  }

  return {
    source: icon || module.modicon,
    tintColor: Color.PrimaryText,
  };
}
