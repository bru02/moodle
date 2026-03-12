import { LocalStorage } from "@raycast/api";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { FilePath } from "./types";

export type HiddenItemKey = string | number;
export type HiddenItemsEntry = {
  hidden: HiddenItemKey[];
  pinned: HiddenItemKey[];
};

export const EMPTY_HIDDEN_ITEMS: HiddenItemsEntry = {
  hidden: [],
  pinned: [],
};

type FileSyncProgressState = {
  progress: Map<
    FilePath,
    {
      progress: number;
      convertProgress?: number;
    }
  >;
  setDownloadProgress: (fileId: string, progress: number) => void;
  setConvertProgress: (fileId: string, progress: number) => void;
};

type FileSyncExceptionsState = {
  exceptions: string[];
  addException: (fileId: string) => void;
};

type HiddenItemsState = {
  itemsByNamespace: Record<string, HiddenItemsEntry>;
  toggleItem: (namespace: string, itemKey: HiddenItemKey, pinned: boolean) => void;
  setItems: (namespace: string, itemKeys: readonly HiddenItemKey[], pinned: boolean, value: boolean) => void;
};

const persistedStorage = createJSONStorage(() => ({
  getItem: (name: string) => LocalStorage.getItem(name).then((v) => v?.toString() ?? null),
  setItem: (name: string, value: string) => LocalStorage.setItem(name, value),
  removeItem: (name: string) => LocalStorage.removeItem(name),
}));

export const useFileSyncProgressStore = create<FileSyncProgressState>((set) => ({
  progress: new Map(),
  setDownloadProgress: (fileId, progress) => {
    set((state) => {
      const existing = state.progress.get(fileId);
      if (existing?.progress === progress) {
        return state;
      }
      state.progress.set(fileId, {
        progress,
        convertProgress: existing?.convertProgress,
      });
      return { progress: state.progress };
    });
  },
  setConvertProgress: (fileId, progress) => {
    set((state) => {
      const existing = state.progress.get(fileId);
      if (existing?.convertProgress === progress) {
        return state;
      }
      state.progress.set(fileId, {
        progress: existing?.progress ?? 0,
        convertProgress: progress,
      });
      return { progress: state.progress };
    });
  },
}));

export const useFileSyncExceptionsStore = create<FileSyncExceptionsState>()(
  persist(
    (set) => ({
      exceptions: [],
      addException: (fileId) =>
        set((state) => ({
          exceptions: Array.from(new Set([...state.exceptions, fileId])),
        })),
    }),
    {
      name: "filesync-exceptions",
      storage: persistedStorage,
    },
  ),
);

export const useHiddenItemsStore = create<HiddenItemsState>()(
  persist(
    (set) => ({
      itemsByNamespace: {},
      toggleItem: (namespace, itemKey, pinned) =>
        set((state) => {
          const existing = state.itemsByNamespace[namespace] ?? EMPTY_HIDDEN_ITEMS;
          const nextValues = toggleItemInList(pinned ? existing.pinned : existing.hidden, itemKey);
          const nextItems = pinned
            ? {
                hidden: existing.hidden,
                pinned: nextValues,
              }
            : {
                hidden: nextValues,
                pinned: existing.pinned,
              };
          const isEmptyPayload = nextItems.hidden.length === 0 && nextItems.pinned.length === 0;
          if (isEmptyPayload) {
            if (!(namespace in state.itemsByNamespace)) {
              return state;
            }

            const itemsByNamespace = { ...state.itemsByNamespace };
            delete itemsByNamespace[namespace];
            return { itemsByNamespace };
          }

          return {
            itemsByNamespace: {
              ...state.itemsByNamespace,
              [namespace]: nextItems,
            },
          };
        }),
      setItems: (namespace, itemKeys, pinned, value) =>
        set((state) => {
          if (itemKeys.length === 0) {
            return state;
          }

          const existing = state.itemsByNamespace[namespace] ?? EMPTY_HIDDEN_ITEMS;
          const nextValues = setItemsInList(pinned ? existing.pinned : existing.hidden, itemKeys, value);
          const nextItems = pinned
            ? {
                hidden: existing.hidden,
                pinned: nextValues,
              }
            : {
                hidden: nextValues,
                pinned: existing.pinned,
              };
          const isEmptyPayload = nextItems.hidden.length === 0 && nextItems.pinned.length === 0;
          if (isEmptyPayload) {
            if (!(namespace in state.itemsByNamespace)) {
              return state;
            }

            const itemsByNamespace = { ...state.itemsByNamespace };
            delete itemsByNamespace[namespace];
            return { itemsByNamespace };
          }

          return {
            itemsByNamespace: {
              ...state.itemsByNamespace,
              [namespace]: nextItems,
            },
          };
        }),
    }),
    {
      name: "hidden-items",
      storage: persistedStorage,
    },
  ),
);

function toggleItemInList(list: readonly HiddenItemKey[], itemKey: HiddenItemKey): HiddenItemKey[] {
  return list.includes(itemKey) ? list.filter((item) => item !== itemKey) : [...list, itemKey];
}

function setItemsInList(
  list: readonly HiddenItemKey[],
  itemKeys: readonly HiddenItemKey[],
  value: boolean,
): HiddenItemKey[] {
  const itemKeySet = new Set(itemKeys);
  if (!value) {
    return list.filter((item) => !itemKeySet.has(item));
  }

  const res = [...list];
  for (const itemKey of itemKeys) {
    if (!res.includes(itemKey)) {
      res.push(itemKey);
    }
  }
  return res;
}
