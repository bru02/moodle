import { LocalStorage } from "@raycast/api";
import { create } from "zustand";
import { combine, createJSONStorage, persist } from "zustand/middleware";
import { FilePath } from "./types";

export const useFileSyncStore = create(
  persist(
    combine(
      {
        progress: {} as Record<
          FilePath,
          {
            progress: number;
            convertProgress?: number;
          }
        >,
        exceptions: [] as string[],
      },
      (set) => ({
        setDownloadProgress: (fileId: string, progress: number) => {
          set((state) => ({
            progress: {
              ...state.progress,
              [fileId]: {
                progress,
              },
            },
          }));
        },
        setConvertProgress: (fileId: string, progress: number) => {
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
        addException: (fileId: string) =>
          set((state) => ({
            exceptions: Array.from(new Set([...state.exceptions, fileId])),
          })),
      }),
    ),
    {
      name: "filesync",
      storage: createJSONStorage(() => ({
        getItem: (name) => LocalStorage.getItem(name).then((v) => v?.toString() ?? null),
        setItem: (name, value) => LocalStorage.setItem(name, value),
        removeItem: (name) => LocalStorage.removeItem(name),
      })),
    },
  ),
);
