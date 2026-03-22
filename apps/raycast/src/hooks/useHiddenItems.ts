import { useCallback, useMemo, useReducer } from "react";

import { EMPTY_HIDDEN_ITEMS, type HiddenItemKey, useHiddenItemsStore } from "../store";

export type UseHiddenItemsOptions<T> = {
  data: readonly T[];
  namespace: string;
  getItemKey: (item: T) => HiddenItemKey;
};

export type UseHiddenItemsResult<T> = {
  hiddenItems: readonly HiddenItemKey[];
  pinnedItems: readonly HiddenItemKey[];
  visibleData: readonly T[];
  pinnedVisibleData: readonly T[];
  regularVisibleData: readonly T[];
  hasVisibleData: boolean;
  showingHidden: boolean;
  toggleShowingHidden: () => void;
  toggleItem: (item: T) => void;
  togglePinnedItem: (item: T) => void;
  isItemHidden: (item: T) => boolean;
  isItemPinned: (item: T) => boolean;
};

export type HiddenItemsStateResult = {
  hiddenItems: readonly HiddenItemKey[];
  pinnedItems: readonly HiddenItemKey[];
  hiddenItemSet: ReadonlySet<HiddenItemKey>;
  pinnedItemSet: ReadonlySet<HiddenItemKey>;
  showingHidden: boolean;
  toggleShowingHidden: () => void;
  isHiddenKey: (itemKey: HiddenItemKey) => boolean;
  isPinnedKey: (itemKey: HiddenItemKey) => boolean;
  toggleHiddenKey: (itemKey: HiddenItemKey) => void;
  togglePinnedKey: (itemKey: HiddenItemKey) => void;
  setHiddenKeys: (itemKeys: readonly HiddenItemKey[], value: boolean) => void;
  setPinnedKeys: (itemKeys: readonly HiddenItemKey[], value: boolean) => void;
};

export function useHiddenItemsState(namespace: string): HiddenItemsStateResult {
  const storedItems = useHiddenItemsStore((state) => state.itemsByNamespace[namespace] ?? EMPTY_HIDDEN_ITEMS);
  const toggleStoredItem = useHiddenItemsStore((state) => state.toggleItem);
  const setStoredItems = useHiddenItemsStore((state) => state.setItems);
  const [showingHidden, toggleShowingHidden] = useReducer((state) => !state, false);
  const hiddenItems = storedItems.hidden;
  const pinnedItems = storedItems.pinned;
  const hiddenItemSet = useMemo(() => new Set(hiddenItems), [hiddenItems]);
  const pinnedItemSet = useMemo(() => new Set(pinnedItems), [pinnedItems]);

  const isHiddenKey = useCallback((itemKey: HiddenItemKey) => hiddenItemSet.has(itemKey), [hiddenItemSet]);
  const isPinnedKey = useCallback((itemKey: HiddenItemKey) => pinnedItemSet.has(itemKey), [pinnedItemSet]);

  const toggleHiddenKey = useCallback(
    (itemKey: HiddenItemKey) => toggleStoredItem(namespace, itemKey, false),
    [namespace, toggleStoredItem],
  );
  const togglePinnedKey = useCallback(
    (itemKey: HiddenItemKey) => toggleStoredItem(namespace, itemKey, true),
    [namespace, toggleStoredItem],
  );
  const setHiddenKeys = useCallback(
    (itemKeys: readonly HiddenItemKey[], value: boolean) => setStoredItems(namespace, itemKeys, false, value),
    [namespace, setStoredItems],
  );
  const setPinnedKeys = useCallback(
    (itemKeys: readonly HiddenItemKey[], value: boolean) => setStoredItems(namespace, itemKeys, true, value),
    [namespace, setStoredItems],
  );

  return {
    hiddenItems,
    pinnedItems,
    hiddenItemSet,
    pinnedItemSet,
    showingHidden,
    toggleShowingHidden,
    isHiddenKey,
    isPinnedKey,
    toggleHiddenKey,
    togglePinnedKey,
    setHiddenKeys,
    setPinnedKeys,
  };
}

export function useHiddenItems<T>({ data, namespace, getItemKey }: UseHiddenItemsOptions<T>): UseHiddenItemsResult<T> {
  const {
    hiddenItems,
    pinnedItems,
    hiddenItemSet,
    pinnedItemSet,
    showingHidden,
    toggleShowingHidden,
    toggleHiddenKey,
    togglePinnedKey,
  } = useHiddenItemsState(namespace);

  const isItemHidden = useCallback((item: T) => hiddenItemSet.has(getItemKey(item)), [getItemKey, hiddenItemSet]);
  const isItemPinned = useCallback((item: T) => pinnedItemSet.has(getItemKey(item)), [getItemKey, pinnedItemSet]);

  const toggleItem = useCallback((item: T) => toggleHiddenKey(getItemKey(item)), [getItemKey, toggleHiddenKey]);
  const togglePinnedItem = useCallback((item: T) => togglePinnedKey(getItemKey(item)), [getItemKey, togglePinnedKey]);

  const { visibleData, pinnedVisibleData, regularVisibleData, hasVisibleData } = useMemo(() => {
    const nextVisible: T[] = [];
    const nextPinned: T[] = [];
    const nextRegular: T[] = [];

    for (const item of data) {
      const itemKey = getItemKey(item);
      const isHidden = hiddenItemSet.has(itemKey);
      if (!showingHidden && isHidden) {
        continue;
      }

      nextVisible.push(item);
      if (pinnedItemSet.has(itemKey)) {
        nextPinned.push(item);
      } else {
        nextRegular.push(item);
      }
    }

    return {
      visibleData: nextVisible as readonly T[],
      pinnedVisibleData: nextPinned as readonly T[],
      regularVisibleData: nextRegular as readonly T[],
      hasVisibleData: nextVisible.length > 0,
    };
  }, [data, getItemKey, hiddenItemSet, pinnedItemSet, showingHidden]);

  return {
    hiddenItems,
    pinnedItems,
    visibleData,
    pinnedVisibleData,
    regularVisibleData,
    hasVisibleData,
    showingHidden,
    toggleShowingHidden,
    toggleItem,
    togglePinnedItem,
    isItemHidden,
    isItemPinned,
  };
}
