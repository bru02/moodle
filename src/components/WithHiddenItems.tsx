import { Action, ActionPanel, Icon, Keyboard } from "@raycast/api";

import {
  createContext,
  ReactElement,
  ReactNode,
  useCallback,
  useContext,
  useMemo,
  useReducer,
} from "react";
import { shortcut } from "../helpers";
import { EMPTY_HIDDEN_ITEMS, type HiddenItemKey, useHiddenItemsStore } from "../store";

type HiddenItemsContextValue<T> = {
  hiddenItems: readonly HiddenItemKey[];
  pinnedItems: readonly HiddenItemKey[];
  toggleItem: (item: T) => void;
  togglePinnedItem: (item: T) => void;
  showingHidden: boolean;
  toggleShowingHidden: () => void;
  key: (item: T) => HiddenItemKey;
};

export const HiddenItemsContext = createContext<HiddenItemsContextValue<unknown> | null>(null);

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
type WithHiddenItemsRenderMeta = {
  isPinnedSection: boolean;
  hasPinnedItems: boolean;
  hasOtherItems: boolean;
};

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

  const storedItems = useHiddenItemsStore((state) => state.itemsByNamespace[namespace] ?? EMPTY_HIDDEN_ITEMS);
  const toggleStoredItem = useHiddenItemsStore((state) => state.toggleItem);
  const [showingHidden, setShowingHidden] = useReducer((s) => !s, false);
  const hiddenItems = storedItems.hidden;
  const pinnedItems = storedItems.pinned;

  const toggleItem = useCallback(
    (item: T) => toggleStoredItem(namespace, resolvedGetItemKey(item), false),
    [namespace, resolvedGetItemKey, toggleStoredItem],
  );
  const togglePinnedItem = useCallback(
    (item: T) => toggleStoredItem(namespace, resolvedGetItemKey(item), true),
    [namespace, resolvedGetItemKey, toggleStoredItem],
  );

  const { pinnedVisibleData, regularVisibleData, hasVisibleData } = useMemo(() => {
    const nextPinned: T[] = [];
    const nextRegular: T[] = [];

    for (const item of data) {
      const itemKey = resolvedGetItemKey(item);
      const isHidden = hiddenItems.includes(itemKey);
      if (!showingHidden && isHidden) {
        continue;
      }

      if (pinnedItems.includes(itemKey)) {
        nextPinned.push(item);
      } else {
        nextRegular.push(item);
      }
    }

    return {
      pinnedVisibleData: nextPinned as readonly T[],
      regularVisibleData: nextRegular as readonly T[],
      hasVisibleData: nextPinned.length + nextRegular.length > 0,
    };
  }, [data, hiddenItems, pinnedItems, showingHidden, resolvedGetItemKey]);

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
      toggleShowingHidden: setShowingHidden,
      key: resolvedGetItemKey,
    }),
    [hiddenItems, pinnedItems, toggleItem, togglePinnedItem, resolvedGetItemKey, showingHidden],
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
  const ctx = useContext(HiddenItemsContext) as HiddenItemsContextValue<T> | null;
  if (!ctx) {
    return null;
  }

  const itemKey = ctx.key(item);
  const isItemHidden = ctx.hiddenItems.includes(itemKey);
  const isItemPinned = ctx.pinnedItems.includes(itemKey);

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
