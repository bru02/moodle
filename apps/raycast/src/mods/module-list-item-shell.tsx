import { ActionPanel, type List } from "@raycast/api";
import type { ReactNode } from "react";

import CompletionAction from "../components/CompletionAction";
import { OpenInBrowserAction } from "../components/OpenInBrowserAction";
import { HiddenItemActionsSection } from "../components/WithHiddenItems";
import type { Course, Module } from "../types";
import DefaultListItem from "./default";

type ModuleListItemShellProps = {
  module: Module;
  course: Course;
  detail?: ReactNode;
  accessories?: List.Item.Accessory[];
  primaryAction?: ReactNode;
  extraActions?: ReactNode[];
};

export function ModuleListItemShell({
  module,
  course,
  detail,
  accessories,
  primaryAction,
  extraActions = [],
}: ModuleListItemShellProps) {
  return (
    <DefaultListItem
      module={module}
      detail={detail}
      accessories={accessories}
      actions={
        <ActionPanel>
          {primaryAction ?? null}
          {extraActions}
          <OpenInBrowserAction url={module.url!} />
          <CompletionAction module={module} course={course} />
          <HiddenItemActionsSection item={module} />
        </ActionPanel>
      }
    />
  );
}
