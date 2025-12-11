import { Action, ActionPanel, Icon, LocalStorage } from "@raycast/api";

import {
  createContext,
  ReactElement,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useState,
} from "react";
import { shortcut } from "../helpers";

type HiddenItemKey = string | number;

type HiddenItemsContextValue<T> = {
  hiddenItems: Set<HiddenItemKey>;
  toggleItem: (item: T) => void;
  showingHidden: boolean;
  toggleShowingHidden: () => void;
  key: (item: T) => HiddenItemKey;
};

export const HiddenItemsContext = createContext<HiddenItemsContextValue<unknown> | null>(null);

type WithHiddenItemsBaseProps<T> = {
  data: readonly T[];
  children: (items: readonly T[]) => ReactNode;
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

  const [hiddenItems, setHiddenItems] = useState<Set<HiddenItemKey>>(() => new Set());
  const [showingHidden, setShowingHidden] = useReducer((s) => !s, false);

  useEffect(() => {
    let cancelled = false;

    const loadHiddenItems = async () => {
      try {
        const serialized = await LocalStorage.getItem<string>(namespace);
        if (cancelled) {
          return;
        }
        const parsed = serialized ? JSON.parse(serialized) : [];
        if (!Array.isArray(parsed)) {
          return;
        }
        setHiddenItems((prev) => {
          const next = new Set(prev);
          parsed.forEach((value) => {
            if (typeof value === "string" || typeof value === "number") {
              next.add(value);
            }
          });
          return next;
        });
      } catch {
        // ignore invalid storage payloads
      }
    };

    loadHiddenItems();

    return () => {
      cancelled = true;
    };
  }, [namespace]);

  const toggleItem = useCallback(
    (item: T) => {
      const itemKey = resolvedGetItemKey(item);
      setHiddenItems((prev) => {
        const newHiddenItems = new Set(prev);
        if (newHiddenItems.has(itemKey)) {
          newHiddenItems.delete(itemKey);
        } else {
          newHiddenItems.add(itemKey);
        }
        LocalStorage.setItem(namespace, JSON.stringify(Array.from(newHiddenItems))).catch(() => {
          // ignore persistence errors
        });
        return newHiddenItems;
      });
    },
    [namespace, resolvedGetItemKey],
  );

  const filteredData = useMemo<readonly T[]>(() => {
    if (showingHidden) {
      return data;
    }
    return data.filter((item) => !hiddenItems.has(resolvedGetItemKey(item)));
  }, [data, hiddenItems, showingHidden, resolvedGetItemKey]);

  const ctx = useMemo<HiddenItemsContextValue<T>>(
    () => ({
      hiddenItems,
      toggleItem,
      showingHidden,
      toggleShowingHidden: setShowingHidden,
      key: resolvedGetItemKey,
    }),
    [hiddenItems, toggleItem, resolvedGetItemKey, showingHidden],
  );

  return (
    <HiddenItemsContext.Provider value={ctx as HiddenItemsContextValue<unknown>}>
      {hiddenItems.size === data.length && !showingHidden && empty ? empty : children(filteredData)}
    </HiddenItemsContext.Provider>
  );
}

function useHiddenItemsContext<T = unknown>() {
  const ctx = useContext(HiddenItemsContext);
  if (!ctx) {
    throw new Error("Hidden item actions must be used within WithHiddenItems");
  }
  return ctx as HiddenItemsContextValue<T>;
}

export function HiddenItemActionsSection<T>({ item }: { item: T }) {
  const ctx = useHiddenItemsContext<T>();

  const isItemHidden = ctx.hiddenItems.has(ctx.key(item));

  return (
    <ActionPanel.Section>
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
