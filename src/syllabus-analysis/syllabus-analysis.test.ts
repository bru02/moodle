import assert from "node:assert/strict";
import test from "node:test";
import { Module } from "../types";
import { hashAnalysisInputs, pickBestSyllabusCandidate } from "./logic";
import { matchSyllabusToGrades } from "./matching";
import { getSyllabusArtifactScore } from "./scoring";
import { MoodleGradeRow, ParsedSyllabusDocument, WorkbookScoreEntry } from "./types";

test("pickBestSyllabusCandidate returns exactly one deterministic winner", () => {
  const selected = pickBestSyllabusCandidate([
    {
      score: 42,
      identity: { scopedModuleId: "1:100", contentFilename: "outline.pdf" },
    },
    {
      score: 80,
      identity: { scopedModuleId: "1:200", contentFilename: "syllabus.pdf" },
    },
    {
      score: 80,
      identity: { scopedModuleId: "2:100", contentFilename: "syllabus.pdf" },
    },
  ]);

  assert.ok(selected);
  assert.equal(selected.identity.scopedModuleId, "1:200");
});

test("introductory syllabus material outranks a generic resource when explicit syllabus terms are absent", () => {
  const generic = getSyllabusArtifactScore(
    { id: 10, name: "Useful reading", modname: "resource", description: "" } as Module,
    "General",
    { filename: "Data Wrangling with Python Tips and Tools to Make Your Life Easier.pdf" },
  );
  const introductory = getSyllabusArtifactScore(
    { id: 20, name: "Class 1", modname: "resource", description: "" } as Module,
    "Class 1",
    { filename: "Part_I_Data_wrangling_introduction_2026.pdf" },
  );

  assert.ok(introductory.score > generic.score);
});

test("an explicit syllabus page outranks an introductory resource", () => {
  const introductory = getSyllabusArtifactScore(
    { id: 20, name: "Class 1", modname: "resource", description: "" } as Module,
    "Class 1",
    { filename: "Part_I_Data_wrangling_introduction_2026.pdf" },
  );
  const syllabusPage = getSyllabusArtifactScore(
    { id: 30, name: "Syllabus", modname: "page", description: "" } as Module,
    "General",
  );

  assert.ok(syllabusPage.score > introductory.score);
});

test("an explicit syllabus pdf outranks an introductory pdf", () => {
  const introductory = getSyllabusArtifactScore(
    { id: 20, name: "Class 1", modname: "resource", description: "" } as Module,
    "Class 1",
    { filename: "Part_I_Data_wrangling_introduction_2026.pdf" },
  );
  const syllabusPdf = getSyllabusArtifactScore(
    { id: 40, name: "Course files", modname: "resource", description: "" } as Module,
    "General",
    { filename: "Syllabus.pdf" },
  );

  assert.ok(syllabusPdf.score > introductory.score);
});

test("hashAnalysisInputs invalidates on syllabus, grade, and workbook changes", () => {
  const baseline = {
    courseIds: [1, 2],
    syllabus: { moduleId: 10, signal: "a" },
    grades: [{ label: "Homework 1", raw: 8, max: 10 }],
    workbooks: [{ path: "/tmp/scores.xlsx", mtimeMs: 1000, size: 128 }],
  };

  const same = hashAnalysisInputs(baseline);
  const syllabusChanged = hashAnalysisInputs({ ...baseline, syllabus: { moduleId: 10, signal: "b" } });
  const gradesChanged = hashAnalysisInputs({ ...baseline, grades: [{ label: "Homework 1", raw: 9, max: 10 }] });
  const workbookChanged = hashAnalysisInputs({
    ...baseline,
    workbooks: [{ path: "/tmp/scores.xlsx", mtimeMs: 2000, size: 128 }],
  });

  assert.equal(same, hashAnalysisInputs(baseline));
  assert.notEqual(same, syllabusChanged);
  assert.notEqual(same, gradesChanged);
  assert.notEqual(same, workbookChanged);
});

test("sequential matching uses ordinal fallback, avoids row reuse, and leaves unmatched Moodle rows", () => {
  const parsed: ParsedSyllabusDocument = {
    components: [
      {
        name: "Assignments",
        max_points: 30,
        children: [
          { name: "Assignment 1", kind: "assignment", max_points: 10, group: "assignment", index: 1, count: 3 },
          { name: "Assignment 2", kind: "assignment", max_points: 10, group: "assignment", index: 2, count: 3 },
          { name: "Assignment 3", kind: "assignment", max_points: 10, group: "assignment", index: 3, count: 3 },
        ],
      },
    ],
  };

  const moodleRows: MoodleGradeRow[] = [
    moodleRow("a1", "Assignment 1", 9, 10),
    moodleRow("a2", "Assignment 2", 8, 10),
    moodleRow("a3", "Assignment 3", 10, 10),
    moodleRow("bonus", "Bonus Quiz", 5, 5),
  ];

  const result = matchSyllabusToGrades(parsed, moodleRows, []);
  const matched = result.sections[0].rows;

  assert.equal(matched[0].effective?.label, "Assignment 1");
  assert.equal(matched[1].effective?.label, "Assignment 2");
  assert.equal(matched[2].effective?.label, "Assignment 3");
  assert.equal(new Set(matched.map((row) => row.effective?.id)).size, 3);
  assert.deepEqual(
    result.unassignedMoodleRows.map((row) => row.label),
    ["Bonus Quiz"],
  );
});

test("deadline hints override ordinal fallback and workbook rows fill missing detail", () => {
  const parsed: ParsedSyllabusDocument = {
    components: [
      {
        name: "Project",
        max_points: 25,
        children: [
          { name: "Milestone 1", kind: "assignment", max_points: 10, group: "milestone", index: 1, week_hint: "4" },
          { name: "Milestone 2", kind: "assignment", max_points: 15, group: "milestone", index: 2, week_hint: "8" },
        ],
      },
    ],
  };

  const moodleRows: MoodleGradeRow[] = [moodleRow("project", "Project Total", 20, 25)];
  const workbookRows: WorkbookScoreEntry[] = [
    workbookRow("m2", "Milestone 2 Week 8", 12, 15),
    workbookRow("m1", "Milestone 1 Week 4", 8, 10),
  ];

  const result = matchSyllabusToGrades(parsed, moodleRows, workbookRows);
  const matched = result.sections[0].rows;

  assert.equal(matched[0].effective?.label, "Milestone 1 Week 4");
  assert.equal(matched[1].effective?.label, "Milestone 2 Week 8");
  assert.equal(matched[0].source, "xlsx");
  assert.equal(matched[1].source, "xlsx");
  assert.deepEqual(
    result.unassignedMoodleRows.map((row) => row.label),
    ["Project Total"],
  );
});

test("workbook scores become effective when Moodle has an unposted placeholder row", () => {
  const parsed: ParsedSyllabusDocument = {
    components: [
      {
        name: "Homework",
        max_points: 10,
        children: [{ name: "Homework 1", kind: "assignment", max_points: 10, group: "homework", index: 1, count: 1 }],
      },
    ],
  };

  const moodleRows: MoodleGradeRow[] = [moodleRow("hw1", "Homework 1", null, null)];
  const workbookRows: WorkbookScoreEntry[] = [workbookRow("hw1-sheet", "Homework 1", 8, 10)];

  const result = matchSyllabusToGrades(parsed, moodleRows, workbookRows);
  const matched = result.sections[0].rows[0];

  assert.equal(matched.source, "both");
  assert.equal(matched.effective?.source, "xlsx");
  assert.equal(matched.effective?.raw, 8);
  assert.equal(result.sections[0].postedPoints, 8);
});

function moodleRow(id: string, label: string, raw: number | null, max: number | null): MoodleGradeRow {
  return {
    id,
    courseId: 1,
    label,
    normalizedLabel: label.toLowerCase(),
    kind: "assignment",
    raw,
    max,
    pct: raw != null && max != null ? (raw / max) * 100 : null,
    posted: raw != null && max != null,
    source: "moodle",
    row: {},
    rowIndex: 0,
  };
}

function workbookRow(id: string, label: string, raw: number, max: number): WorkbookScoreEntry {
  return {
    id,
    courseId: 1,
    label,
    normalizedLabel: label.toLowerCase(),
    kind: "assignment",
    raw,
    max,
    pct: (raw / max) * 100,
    posted: true,
    source: "xlsx",
    workbookPath: `/tmp/${id}.xlsx`,
    sheetName: "Scores",
    rowIndex: 1,
    columnIndex: 2,
  };
}
