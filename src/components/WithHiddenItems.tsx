import { Action, ActionPanel, Icon, Keyboard } from "@raycast/api";

import { createContext, ReactElement, ReactNode, useContext, useMemo } from "react";
import { shortcut } from "../helpers";
import { useHiddenItems } from "../hooks/useHiddenItems";
import { type HiddenItemKey } from "../store";

export type HiddenItemsContextValue<T> = {
  hiddenItems: readonly HiddenItemKey[];
  pinnedItems: readonly HiddenItemKey[];
  toggleItem: (item: T) => void;
  togglePinnedItem: (item: T) => void;
  showingHidden: boolean;
  toggleShowingHidden: () => void;
  isItemHidden: (item: T) => boolean;
  isItemPinned: (item: T) => boolean;
};

export type WithHiddenItemsRenderMeta = {
  isPinnedSection: boolean;
  hasPinnedItems: boolean;
  hasOtherItems: boolean;
};

type WithHiddenItemsBaseProps<T> = {
  data: readonly T[];
  children: (items: readonly T[], meta: WithHiddenItemsRenderMeta) => ReactNode;
  empty?: ReactNode;
  namespace: string;
};

type WithHiddenItemsPropsWithKey<T> = WithHiddenItemsBaseProps<T> & {
  getItemKey: (item: T) => HiddenItemKey;
};

type WithHiddenItemsPropsWithDefaultKey<T extends { id: HiddenItemKey }> = WithHiddenItemsBaseProps<T> & {
  getItemKey?: undefined;
};

type WithHiddenItemsProps<T> =
  | WithHiddenItemsPropsWithKey<T>
  | (T extends { id: HiddenItemKey } ? WithHiddenItemsPropsWithDefaultKey<T> : never);

const defaultGetItemKey = (x: { id: HiddenItemKey }) => x.id;

export const HiddenItemsContext = createContext<HiddenItemsContextValue<unknown> | null>(null);

export default function WithHiddenItems<T extends { id: HiddenItemKey }>(
  props: WithHiddenItemsPropsWithDefaultKey<T>,
): ReactElement;
export default function WithHiddenItems<T>(props: WithHiddenItemsPropsWithKey<T>): ReactElement;
export default function WithHiddenItems<T>({
  data,
  getItemKey,
  children,
  empty,
  namespace,
}: WithHiddenItemsProps<T>): ReactElement {
  const resolvedGetItemKey: (item: T) => HiddenItemKey = (getItemKey ?? defaultGetItemKey) as (
    item: T,
  ) => HiddenItemKey;
  const {
    hiddenItems,
    pinnedItems,
    pinnedVisibleData,
    regularVisibleData,
    hasVisibleData,
    showingHidden,
    toggleShowingHidden,
    toggleItem,
    togglePinnedItem,
    isItemHidden,
    isItemPinned,
  } = useHiddenItems({
    data,
    namespace,
    getItemKey: resolvedGetItemKey,
  });

  const hasPinnedItems = pinnedVisibleData.length > 0;
  const hasOtherItems = regularVisibleData.length > 0;

  const pinnedContent = hasPinnedItems
    ? children(pinnedVisibleData, {
        isPinnedSection: true,
        hasPinnedItems,
        hasOtherItems,
      })
    : null;
  const regularContent = children(regularVisibleData, {
    isPinnedSection: false,
    hasPinnedItems,
    hasOtherItems,
  });

  const ctx = useMemo<HiddenItemsContextValue<T>>(
    () => ({
      hiddenItems,
      pinnedItems,
      toggleItem,
      togglePinnedItem,
      showingHidden,
      toggleShowingHidden,
      isItemHidden,
      isItemPinned,
    }),
    [
      hiddenItems,
      pinnedItems,
      toggleItem,
      togglePinnedItem,
      showingHidden,
      toggleShowingHidden,
      isItemHidden,
      isItemPinned,
    ],
  );

  return (
    <HiddenItemsContext.Provider value={ctx as HiddenItemsContextValue<unknown>}>
      {!hasVisibleData && empty ? (
        empty
      ) : (
        <>
          {pinnedContent}
          {regularContent}
        </>
      )}
    </HiddenItemsContext.Provider>
  );
}

function useHiddenItemsContext<T = unknown>() {
  const ctx = useContext(HiddenItemsContext) as HiddenItemsContextValue<T> | null;
  if (!ctx) {
    throw new Error("Hidden item actions must be used within WithHiddenItems");
  }
  return ctx;
}

export function HiddenItemActionsSection<T>({ item }: { item: T }) {
  const ctx = useHiddenItemsContext<T>();
  const isItemHidden = ctx.isItemHidden(item);
  const isItemPinned = ctx.isItemPinned(item);

  return (
    <ActionPanel.Section>
      <Action
        title={isItemPinned ? "Unpin Item" : "Pin Item"}
        icon={isItemPinned ? Icon.TackDisabled : Icon.Tack}
        onAction={() => ctx.togglePinnedItem(item)}
        shortcut={Keyboard.Shortcut.Common.Pin}
      />
      <Action
        title={isItemHidden ? "Unhide Item" : "Hide Item"}
        icon={isItemHidden ? Icon.Eye : Icon.EyeDisabled}
        onAction={() => ctx.toggleItem(item)}
        shortcut={shortcut("h")}
      />
      <ToggleHiddenItemsAction />
    </ActionPanel.Section>
  );
}

export function ToggleHiddenItemsAction() {
  const ctx = useHiddenItemsContext();

  return (
    <Action
      title={ctx.showingHidden ? "Hide Hidden Items" : "Show Hidden Items"}
      icon={ctx.showingHidden ? Icon.Eye : Icon.EyeDisabled}
      onAction={() => ctx.toggleShowingHidden()}
      shortcut={shortcut("h", ["shift"])}
    />
  );
}
