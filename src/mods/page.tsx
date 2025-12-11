import { Action, ActionPanel, Detail, Icon } from "@raycast/api";
import { OpenInBrowserAction } from "../components/OpenInBrowserAction";
import { useRemoteHTMLResource } from "../hooks/useRemoteHTMLService";
import { Module } from "../types";
import DefaultListItem from "./default";

export function ViewPage({ module }: { module: Module }) {
  const { data: content, isLoading } = useRemoteHTMLResource(module.contents?.[0].fileurl || "");
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
  return (
    <DefaultListItem
      module={module}
      icon={Icon.Paragraph}
      actions={
        <ActionPanel>
          <Action.Push title="View Page" icon={Icon.Eye} target={<ViewPage module={module} />} />
          <OpenInBrowserAction url={module.url!} />
        </ActionPanel>
      }
    />
  );
}
