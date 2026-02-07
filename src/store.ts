import { LocalStorage } from "@raycast/api";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { FilePath } from "./types";

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
      storage: createJSONStorage(() => ({
        getItem: (name) => LocalStorage.getItem(name).then((v) => v?.toString() ?? null),
        setItem: (name, value) => LocalStorage.setItem(name, value),
        removeItem: (name) => LocalStorage.removeItem(name),
      })),
    },
  ),
);
