import { ActionPanel, type List } from "@raycast/api";
import type { ReactNode } from "react";

import CompletionAction from "../components/CompletionAction";
import { OpenInBrowserAction } from "../components/OpenInBrowserAction";
import { HiddenItemActionsSection } from "../components/WithHiddenItems";
import type { Module } from "../types";
import DefaultListItem from "./default";

type ModuleListItemShellProps = {
  module: Module;
  detail?: ReactNode;
  accessories?: List.Item.Accessory[];
  primaryAction?: ReactNode;
  extraActions?: ReactNode[];
};

export function ModuleListItemShell({
  module,
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
          <CompletionAction module={module} />
          <HiddenItemActionsSection item={module} />
        </ActionPanel>
      }
    />
  );
}
