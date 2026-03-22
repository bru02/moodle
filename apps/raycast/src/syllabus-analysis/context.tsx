import { createContext, useContext } from "react";

import { SyllabusArtifactIdentity, SyllabusCacheState } from "./types";

type SyllabusContextValue = {
  selectedArtifact?: SyllabusArtifactIdentity;
  cacheState: SyllabusCacheState;
  onRefresh?: () => void;
};

const SyllabusAnalysisContext = createContext<SyllabusContextValue>({
  cacheState: "missing",
});

export function useSyllabusAnalysisContext() {
  return useContext(SyllabusAnalysisContext);
}

export default SyllabusAnalysisContext;
