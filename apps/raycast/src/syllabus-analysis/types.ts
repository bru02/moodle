import type { SimpleCourse } from "@moodle/core";

import { CoreWSExternalFile, Module } from "../types";
import { CoreGradesTableRow } from "../types/grade";

export type SourceKind = "moodle" | "xlsx";

export type SyllabusArtifactIdentity = {
  scopedModuleId: string;
  courseId: number;
  moduleId: number;
  moduleName: string;
  modname: string;
  contentFilename?: string;
  localPath?: string;
};

export type SelectedSyllabusArtifact = {
  identity: SyllabusArtifactIdentity;
  score: number;
  reasons: string[];
  module: Module;
  course: SimpleCourse;
  sectionName: string;
  file?: CoreWSExternalFile;
  localPath?: string;
  inlineText: string;
  modificationSignal: string;
  sourceLabel: string;
  isPdf: boolean;
};

export type ParsedSyllabusComponent = {
  name: string;
  kind?: string;
  max_points?: number | null;
  group?: string | null;
  index?: number | null;
  count?: number | null;
  best_of?: number | null;
  deadline_hint?: string | null;
  week_hint?: string | null;
  evidence?: string[] | null;
  children?: ParsedSyllabusComponent[] | null;
};

export type ParsedSyllabusDocument = {
  normal_total_points?: number | null;
  components: ParsedSyllabusComponent[];
};

export type MoodleGradeRow = {
  id: string;
  courseId: number;
  label: string;
  normalizedLabel: string;
  kind: string;
  raw: number | null;
  max: number | null;
  pct: number | null;
  posted: boolean;
  source: "moodle";
  moduleId?: number;
  moduleName?: string;
  sectionName?: string;
  modulePurpose?: string;
  row: CoreGradesTableRow;
  rowIndex: number;
};

export type WorkbookScoreEntry = {
  id: string;
  courseId: number;
  label: string;
  headerLabel: string;
  normalizedLabel: string;
  contextLabels: string[];
  normalizedContextLabels: string[];
  kind: string;
  raw: number | null;
  max: number | null;
  pct: number | null;
  posted: boolean;
  source: "xlsx";
  workbookPath: string;
  sheetName: string;
  rowIndex: number;
  columnIndex: number;
};

export type GradeCandidate = MoodleGradeRow | WorkbookScoreEntry;

export type MatchedCandidateRef = {
  id: string;
  source: SourceKind;
  label: string;
  raw: number | null;
  max: number | null;
  pct: number | null;
  courseId: number;
  workbookPath?: string;
  sheetName?: string;
};

export type MatchedLeafRow = {
  id: string;
  label: string;
  parentLabel: string;
  kind: string;
  group?: string | null;
  index?: number | null;
  count?: number | null;
  deadlineHint?: string | null;
  weekHint?: string | null;
  maxPoints: number | null;
  effective: MatchedCandidateRef | null;
  moodle: MatchedCandidateRef | null;
  xlsx: MatchedCandidateRef | null;
  source: "moodle" | "xlsx" | "both" | "unposted";
  evidence: string[];
};

export type MatchedSection = {
  id: string;
  label: string;
  maxPoints: number | null;
  rows: MatchedLeafRow[];
  postedPoints: number | null;
  totalPoints: number | null;
  effectivePercent: number | null;
};

export type WorkbookFingerprintEntry = {
  path: string;
  mtimeMs: number;
  size: number;
};

export type WorkbookParseResult = {
  entries: WorkbookScoreEntry[];
  fingerprintEntries: WorkbookFingerprintEntry[];
  matchedWorkbookRows: {
    path: string;
    sheetName: string;
    rowIndex: number;
  }[];
};

export type SyllabusAnalysisPayload = {
  selectedArtifact: SyllabusArtifactIdentity;
  parsedSyllabus: ParsedSyllabusDocument;
  sections: MatchedSection[];
  unassignedMoodleRows: MatchedCandidateRef[];
  workbookRowsUsed: MatchedCandidateRef[];
  fingerprint: string;
  status: "ok" | "failed";
  error?: string;
  createdAt: string;
  updatedAt: string;
};

export type SyllabusCacheState = "missing" | "parsed" | "stale" | "failed";
