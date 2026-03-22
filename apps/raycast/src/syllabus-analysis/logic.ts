import { createHash } from "crypto";

import { SyllabusAnalysisPayload, SyllabusArtifactIdentity, SyllabusCacheState } from "./types";

type RankedCandidate = {
  score: number;
  identity: {
    scopedModuleId: string;
    contentFilename?: string;
  };
};

export function pickBestSyllabusCandidate<T extends RankedCandidate>(candidates: readonly T[]) {
  return [...candidates]
    .filter((candidate) => candidate.score > 0)
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      return `${left.identity.scopedModuleId}:${left.identity.contentFilename ?? ""}`.localeCompare(
        `${right.identity.scopedModuleId}:${right.identity.contentFilename ?? ""}`,
      );
    })[0];
}

export function deriveSyllabusCacheState(
  payload: SyllabusAnalysisPayload | null,
  selectedArtifact: SyllabusArtifactIdentity | undefined,
  fingerprint?: string | null,
): SyllabusCacheState {
  if (!payload) return "missing";
  if (fingerprint && payload.fingerprint !== fingerprint) return "stale";
  if (payload.status === "failed") return "failed";
  if (!selectedArtifact) return "parsed";

  const isSameArtifact =
    payload.selectedArtifact.scopedModuleId === selectedArtifact.scopedModuleId &&
    payload.selectedArtifact.contentFilename === selectedArtifact.contentFilename;

  return isSameArtifact ? "parsed" : "stale";
}

export function hashAnalysisInputs(input: unknown) {
  return createHash("sha1").update(JSON.stringify(input)).digest("hex");
}
