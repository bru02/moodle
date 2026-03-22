import { createContext, useContext } from "react";

export type DismissibleItemsContextValue<T> = {
  dismissItem: (item: T) => void;
  isItemDismissible: (item: T) => boolean;
};

export const DismissibleItemsContext = createContext<DismissibleItemsContextValue<unknown> | null>(null);

export function useOptionalDismissibleItemsContext<T = unknown>() {
  return useContext(DismissibleItemsContext) as DismissibleItemsContextValue<T> | null;
}
