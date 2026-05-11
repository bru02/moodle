import { createContext, type ReactNode, useContext } from "react";

export type ModuleListContextValue = {
  selectedItemId?: string;
  isShowingDetail?: boolean;
};

const ModuleListContext = createContext<ModuleListContextValue | null>(null);

export function ModuleListContextProvider({
  value,
  children,
}: {
  value: ModuleListContextValue;
  children: ReactNode;
}) {
  return (
    <ModuleListContext.Provider value={value}>
      {children}
    </ModuleListContext.Provider>
  );
}

export function useModuleListContext(): ModuleListContextValue | null {
  return useContext(ModuleListContext);
}
