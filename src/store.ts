import { LocalStorage } from "@raycast/api";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { FilePath } from "./types";

type FileSyncProgressState = {
  progress: Record<
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

export const useFileSyncProgressStore = create<FileSyncProgressState>((set) => ({
  progress: {},
  setDownloadProgress: (fileId, progress) => {
    set((state) => ({
      progress: {
        ...state.progress,
        [fileId]: {
          progress,
        },
      },
    }));
  },
  setConvertProgress: (fileId, progress) => {
    set((state) => ({
      progress: {
        ...state.progress,
        [fileId]: {
          ...state.progress[fileId],
          convertProgress: progress,
        },
      },
    }));
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
      storage: createJSONStorage(() => ({
        getItem: (name) => LocalStorage.getItem(name).then((v) => v?.toString() ?? null),
        setItem: (name, value) => LocalStorage.setItem(name, value),
        removeItem: (name) => LocalStorage.removeItem(name),
      })),
    },
  ),
);
