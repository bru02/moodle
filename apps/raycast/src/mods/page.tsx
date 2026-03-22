import { Action, ActionPanel, Detail, Icon } from "@raycast/api";
import { useContext } from "react";

import { OpenInBrowserAction } from "../components/OpenInBrowserAction";
import { HiddenItemActionsSection } from "../components/WithHiddenItems";
import CourseContext from "../course-context";
import { useRemoteHTMLResource } from "../hooks/useRemoteHTMLService";
import { Module } from "../types";
import DefaultListItem from "./default";

export function ViewPage({ module }: { module: Module }) {
  const { activeCourse } = useContext(CourseContext);
  const pageContent = module.contents?.find((content) => content.filename === "index.html") ?? module.contents?.[0];
  const { data: content, isLoading } = useRemoteHTMLResource(
    pageContent?.fileurl || "",
    module.contents,
    activeCourse.id,
  );
  return (
    <Detail
      navigationTitle={module.name}
      isLoading={isLoading}
      markdown={content}
      actions={
        <ActionPanel>
          <OpenInBrowserAction url={module.url!} />
        </ActionPanel>
      }
    />
  );
}

export default function PageListItem({ module }: { module: Module }) {
  const ctx = useContext(CourseContext);

  return (
    <DefaultListItem
      module={module}
      icon={Icon.Paragraph}
      actions={
        <ActionPanel>
          <Action.Push
            title="View Page"
            icon={Icon.Eye}
            target={
              <CourseContext.Provider value={ctx}>
                <ViewPage module={module} />
              </CourseContext.Provider>
            }
          />
          <OpenInBrowserAction url={module.url!} />
          <HiddenItemActionsSection item={module} />
        </ActionPanel>
      }
    />
  );
}
