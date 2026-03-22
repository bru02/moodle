import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import type { ScopedRenderedSection } from "@moodle/core";
import ExcelJS from "exceljs";
import { sanitize } from "sanitize-filename-ts";

import { Module } from "../types";
import {
  buildFallbackParsedSyllabus,
  extractGradingFocusedText,
  supplementParsedSyllabusWithObservedRows,
} from "./fallback";
import { hashAnalysisInputs, pickBestSyllabusCandidate } from "./logic";
import { matchSyllabusToGrades } from "./matching";
import { buildMoodleGradeRows } from "./pipeline";
import { getSyllabusArtifactScore } from "./scoring";
import { MoodleGradeRow, ParsedSyllabusDocument, WorkbookScoreEntry } from "./types";
import { parseWorkbookEntries } from "./workbook";

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

test("extractGradingFocusedText keeps the assessment block and drops unrelated tail sections", () => {
  const focused = extractGradingFocusedText(`
5. A tantárgy értékelési rendszere / Assessment system

Assessment method

Group assignment (3-4 people/group): 60%
- Topic description 10%
- Progress report 20%
- Final project paper 30%
Group presentation 40%.

7. Kötelező irodalom / Mandatory literature
Book chapter
  `);

  assert.match(focused, /Group assignment/);
  assert.match(focused, /Group presentation 40/);
  assert.doesNotMatch(focused, /Mandatory literature/);
});

test("extractGradingFocusedText prefers the real evaluation section over earlier ILO assessment tables", () => {
  const focused = extractGradingFocusedText(`
Intended Learning Outcomes:
Assessment ensuring ILOs
Case Analysis 20%
Mid-term & final exam 60%
Group Presentation 10%

VI. Evaluation system of the course
Assessment, grading:
The final grade will be based on the following:
(i) 20 % Case analysis
(ii) 25 % Mid-term exam
(iii) 10 % Group presentation
(iv) 20 % Classwork during the semester
(v) 25 % Final exam
(vi) maximum 5 % Extra points

Class attendance:
Attendance is mandatory.
  `);

  assert.match(focused, /VI\. Evaluation system of the course/);
  assert.match(focused, /\(ii\) 25 % Mid-term exam/);
  assert.match(focused, /\(vi\) maximum 5 % Extra points/);
  assert.doesNotMatch(focused, /Assessment ensuring ILOs/);
});

test("fallback syllabus builder extracts structured grading components from syllabus text", () => {
  const parsed = buildFallbackParsedSyllabus({
    documents: [
      {
        sourceLabel: "Text Mining syllabus",
        text: `
5. Assessment system

Group assignment (3-4 people/group): 60%:
- Topic description 10%
- Progress report 20%
- Final project paper 30%
Group presentation 40%.
        `,
      },
    ],
    moodleRows: [],
    workbookRows: [],
  });

  assert.equal(parsed.components.length, 2);
  assert.equal(parsed.components[0]?.name, "Group assignment");
  assert.equal(parsed.components[0]?.children?.length, 3);
  assert.equal(parsed.components[1]?.name, "Group presentation");
  assert.equal(parsed.normal_total_points, 100);
});

test("fallback syllabus builder groups concrete grade rows when no syllabus document is available", () => {
  const parsed = buildFallbackParsedSyllabus({
    documents: [],
    moodleRows: [
      {
        id: "1",
        courseId: 1,
        label: "Midterm Exam",
        normalizedLabel: "midterm exam",
        kind: "midterm",
        raw: 12.5,
        max: 15,
        pct: 83.3,
        posted: true,
        source: "moodle",
        row: {} as MoodleGradeRow["row"],
        rowIndex: 0,
      },
      {
        id: "2",
        courseId: 1,
        label: "Final Exam",
        normalizedLabel: "final exam",
        kind: "final_exam",
        raw: 30,
        max: 30,
        pct: 100,
        posted: true,
        source: "moodle",
        row: {} as MoodleGradeRow["row"],
        rowIndex: 1,
      },
    ],
    workbookRows: [],
  });

  assert.deepEqual(
    parsed.components.map((component) => component.name),
    ["Midterm exams", "Final exam"],
  );
  assert.equal(parsed.components[0]?.children?.[0]?.name, "Midterm Exam");
  assert.equal(parsed.normal_total_points, 45);
});

test("supplementParsedSyllabusWithObservedRows adds weekly tests when the syllabus text and moodle rows show a recurring requirement", () => {
  const parsed = supplementParsedSyllabusWithObservedRows({
    parsed: {
      normal_total_points: 100,
      components: [
        {
          name: "Weekly assignments",
          kind: "assignment",
          max_points: 30,
        },
      ],
    },
    documents: [
      {
        sourceLabel: "Syllabus",
        text: "A heti teszteket legalabb 9 alkalommal sikeresen kell teljesiteni.",
      },
    ],
    moodleRows: [
      moodleRow("t1", "2. heti teszt", 5, 5, "quiz", 1),
      moodleRow("t2", "3. heti teszt", 4, 5, "quiz", 2),
      moodleRow("t3", "4. heti teszt", 4, 5, "quiz", 3),
      moodleRow("t4", "5. heti teszt", 4, 5, "quiz", 4),
    ],
  });

  assert.equal(parsed.components[0]?.name, "Weekly tests");
  assert.equal(parsed.components[0]?.children?.length, 4);
});

test("matching prefers exact point-cap matches over broader exact-label rows", () => {
  const parsed: ParsedSyllabusDocument = {
    components: [
      {
        name: "Group assignment",
        kind: "assignment",
        children: [
          {
            name: "Research Plan (Topic description)",
            kind: "assignment",
            max_points: 10,
          },
        ],
      },
    ],
  };
  const moodleRows: MoodleGradeRow[] = [
    moodleRow("wide", "Research Plan", null, 100, "assignment", 1),
    moodleRow("milestone", "MILESTONE 1 - Research Plan (NEW DEADLINE: 15th MARCH)", 5, 10, "assignment", 2),
  ];

  const result = matchSyllabusToGrades(parsed, moodleRows, []);
  assert.equal(result.sections[0]?.rows[0]?.effective?.label, "MILESTONE 1 - Research Plan (NEW DEADLINE: 15th MARCH)");
});

test("generic final exam buckets do not absorb unrelated leftover rows", () => {
  const parsed: ParsedSyllabusDocument = {
    components: [
      {
        name: "Final Exam (Alternative path)",
        kind: "final_exam",
        max_points: 100,
      },
    ],
  };
  const moodleRows: MoodleGradeRow[] = [
    moodleRow("weekly-test", "2. heti teszt", 5, 5, "quiz", 1),
    moodleRow("weekly-task", "2. heti feladat", 3, 3, "assignment", 2),
  ];

  const result = matchSyllabusToGrades(parsed, moodleRows, []);
  assert.equal(result.sections[0]?.rows.length, 1);
  assert.equal(result.sections[0]?.rows[0]?.effective, null);
  assert.deepEqual(result.unassignedMoodleRows.map((row) => row.label).sort(), ["2. heti feladat", "2. heti teszt"]);
});

test("final exam buckets do not absorb homework rows just because assignment wrappers are allowed", () => {
  const parsed: ParsedSyllabusDocument = {
    components: [
      {
        name: "Comprehensive exam",
        kind: "final_exam",
        max_points: 100,
      },
      {
        name: "Homework",
        kind: "assignment",
        children: [{ name: "Homework_3_Green", kind: "assignment", max_points: 100 }],
      },
    ],
  };
  const moodleRows: MoodleGradeRow[] = [moodleRow("hw3", "Homework_3_Green", 69.7, 100, "assignment", 1)];

  const result = matchSyllabusToGrades(parsed, moodleRows, []);

  assert.equal(result.sections[0]?.rows[0]?.effective, null);
  assert.equal(result.sections[1]?.rows[0]?.effective?.label, "Homework_3_Green");
  assert.deepEqual(result.unassignedMoodleRows, []);
});

test("matching uses concise evidence labels from Gemini output when bucket titles are too generic", () => {
  const parsed: ParsedSyllabusDocument = {
    components: [
      {
        name: "Csoportmunka",
        kind: "project",
        max_points: 10,
        evidence: ["Csoportmunka prezentáció feltöltése"],
      },
      {
        name: "Szemináriumi munka",
        kind: "participation",
        max_points: 10,
        evidence: ["Szemináriumi pontok"],
      },
    ],
  };
  const moodleRows: MoodleGradeRow[] = [
    moodleRow("group", "Csoportmunka prezentáció feltöltése", 10, 10, "assignment", 1),
    moodleRow("seminar", "Szemináriumi pontok", 10, 10, "participation", 2),
  ];

  const result = matchSyllabusToGrades(parsed, moodleRows, []);
  assert.equal(result.sections[0]?.rows[0]?.effective?.label, "Csoportmunka prezentáció feltöltése");
  assert.equal(result.sections[1]?.rows[0]?.effective?.label, "Szemináriumi pontok");
});

test("matching tolerates Moodle assignment wrappers for Hungarian exam and seminar rows", () => {
  const parsed: ParsedSyllabusDocument = {
    components: [
      {
        name: "Csoportmunka",
        kind: "project",
        max_points: 10,
        evidence: ["Csoportmunka prezentáció feltöltése"],
      },
      {
        name: "Szemináriumi munka",
        kind: "participation",
        max_points: 10,
        evidence: ["Szemináriumi pontok"],
      },
      {
        name: "Osztott dolgozat 1. rész",
        kind: "midterm",
        max_points: 35,
        evidence: ["Osztott dolgozat 1. rész eredménye"],
      },
      {
        name: "Osztott dolgozat 2. rész",
        kind: "final_exam",
        max_points: 50,
        evidence: ["Osztott dolgozat 2. rész eredménye"],
      },
      {
        name: "Összevont dolgozat",
        kind: "final_exam",
        max_points: 80,
        evidence: ["Január 6-ai vizsga eredménye", "Január 13-ai vizsga eredménye", "Január 20-ai vizsga eredménye"],
      },
      {
        name: "Moodle tesztek bónusz",
        kind: "extra",
        max_points: 5,
        evidence: ["ÉLES 1. Moodle teszt (kedd 10:00 - péntek 20:00)"],
      },
    ],
  };
  const moodleRows: MoodleGradeRow[] = [
    moodleRow("group", "Csoportmunka prezentáció feltöltése", 10, 10, "presentation", 1),
    moodleRow("seminar", "Szemináriumi pontok", 10, 10, "assignment", 2),
    moodleRow("midterm", "Osztott dolgozat 1. rész eredménye", 28.75, 35, "assignment", 3),
    moodleRow("final-part", "Osztott dolgozat 2. rész eredménye", 41, 50, "assignment", 4),
    moodleRow("exam-1", "Január 6-ai vizsga eredménye", null, 80, "assignment", 5),
    moodleRow("bonus", "ÉLES 1. Moodle teszt (kedd 10:00 - péntek 20:00)", 16, 24, "quiz", 6),
  ];

  const result = matchSyllabusToGrades(parsed, moodleRows, []);

  assert.equal(result.sections[0]?.rows[0]?.effective?.label, "Csoportmunka prezentáció feltöltése");
  assert.equal(result.sections[1]?.rows[0]?.effective?.label, "Szemináriumi pontok");
  assert.equal(result.sections[2]?.rows[0]?.effective?.label, "Osztott dolgozat 1. rész eredménye");
  assert.equal(result.sections[3]?.rows[0]?.effective?.label, "Osztott dolgozat 2. rész eredménye");
  assert.match(result.sections[4]?.rows[0]?.effective?.label ?? "", /Január \d+-ai vizsga eredménye/);
  assert.equal(result.sections[5]?.rows[0]?.effective?.label, "ÉLES 1. Moodle teszt (kedd 10:00 - péntek 20:00)");
  assert.deepEqual(result.unassignedMoodleRows, []);
});

test("matching uses Hungarian aggregate aliases for split exams and bonus quiz buckets", () => {
  const parsed: ParsedSyllabusDocument = {
    components: [
      {
        name: "Írásbeli vizsga",
        kind: "other",
        children: [
          {
            name: "Osztott dolgozatok",
            kind: "other",
          },
          {
            name: "Összevont dolgozat",
            kind: "final_exam",
            max_points: 80,
          },
        ],
      },
      {
        name: "Bónusz pontok",
        kind: "extra",
        children: [
          {
            name: "Moodle teszt bónusz",
            kind: "extra",
            max_points: 5,
          },
        ],
      },
    ],
  };
  const moodleRows: MoodleGradeRow[] = [
    moodleRow("midterm", "Osztott dolgozat 1. rész eredménye", 28.75, 35, "assignment", 1),
    moodleRow("bonus", "ÉLES 1. Moodle teszt (kedd 10:00 - péntek 20:00)", 16, 24, "quiz", 2),
  ];

  const result = matchSyllabusToGrades(parsed, moodleRows, []);

  assert.equal(result.sections[0]?.rows[0]?.effective?.label, "Osztott dolgozat 1. rész eredménye");
  assert.equal(result.sections[1]?.rows[0]?.effective?.label, "ÉLES 1. Moodle teszt (kedd 10:00 - péntek 20:00)");
});

test("exact child labels still match when siblings are generic placeholders", () => {
  const parsed: ParsedSyllabusDocument = {
    components: [
      {
        name: "Homework",
        kind: "assignment",
        count: 4,
        best_of: 2,
        children: [
          { name: "HW1", kind: "assignment" },
          { name: "HW2", kind: "assignment" },
          { name: "Homework_3_Green", kind: "assignment", max_points: 100 },
          { name: "Homework 4. - Inventory - NRV", kind: "assignment", max_points: 10 },
        ],
      },
    ],
  };
  const moodleRows: MoodleGradeRow[] = [
    moodleRow("hw3", "Homework_3_Green", 69.7, 100, "assignment", 1),
    moodleRow("hw4", "Homework 4. - Inventory - NRV", 10, 10, "assignment", 2),
  ];

  const result = matchSyllabusToGrades(parsed, moodleRows, []);

  assert.equal(result.sections[0]?.rows[2]?.effective?.label, "Homework_3_Green");
  assert.equal(result.sections[0]?.rows[3]?.effective?.label, "Homework 4. - Inventory - NRV");
  assert.deepEqual(result.unassignedMoodleRows, []);
});

test("Hungarian aggregate quiz buckets expand into concrete quiz rows", () => {
  const parsed: ParsedSyllabusDocument = {
    components: [
      {
        name: "Félévközi tesztek",
        kind: "quiz",
        max_points: 20,
      },
    ],
  };
  const moodleRows: MoodleGradeRow[] = [
    moodleRow("q1", "Tankönyv_stratégia_igaz-hamis teszt", 8, 10, "quiz", 1),
    moodleRow("q2", "Tankönyv_marketing_igaz-hamis teszt_", 8, 10, "quiz", 2),
  ];

  const result = matchSyllabusToGrades(parsed, moodleRows, []);

  assert.deepEqual(
    result.sections[0]?.rows.map((row) => row.effective?.label ?? null).sort(),
    ["Tankönyv_marketing_igaz-hamis teszt_", "Tankönyv_stratégia_igaz-hamis teszt"].sort(),
  );
  assert.deepEqual(result.unassignedMoodleRows, []);
});

test("aggregate quiz buckets with numeric counts still expand into concrete rows", () => {
  const parsed: ParsedSyllabusDocument = {
    components: [
      {
        name: "2 quizzes: 10% each, worth",
        kind: "quiz",
        max_points: 20,
      },
    ],
  };
  const moodleRows: MoodleGradeRow[] = [
    moodleRow("q1", "Group B", 2, 10, "quiz", 1),
    moodleRow("q2", "Quiz no. 2 - Group B", 10, 10, "quiz", 2),
  ];

  const result = matchSyllabusToGrades(parsed, moodleRows, []);

  assert.deepEqual(
    result.sections[0]?.rows.map((row) => row.effective?.label ?? null),
    ["Group B", "Quiz no. 2 - Group B"],
  );
  assert.deepEqual(result.unassignedMoodleRows, []);
});

test("aggregate quiz buckets do not expand into final exam parts", () => {
  const parsed: ParsedSyllabusDocument = {
    components: [
      {
        name: "2 quizzes: 10% each, worth",
        kind: "quiz",
        max_points: 20,
      },
    ],
  };
  const moodleRows: MoodleGradeRow[] = [
    moodleRow("quiz-1", "Group B", 2, 10, "quiz", 1),
    moodleRow("exam-1", "Exam - Part I", 6, 6, "final_exam", 1),
    moodleRow("exam-2", "Submission of Exam - Part 2", 34, 34, "assignment", 2),
    moodleRow("quiz-2", "Quiz no. 2 - Group B", 10, 10, "quiz", 3),
  ];

  const result = matchSyllabusToGrades(parsed, moodleRows, []);

  assert.deepEqual(
    result.sections[0]?.rows.map((row) => row.effective?.label ?? null),
    ["Group B", "Quiz no. 2 - Group B"],
  );
  assert.deepEqual(
    result.unassignedMoodleRows.map((row) => row.label).sort(),
    ["Exam - Part I", "Submission of Exam - Part 2"].sort(),
  );
});

test("generic final exam buckets expand into concrete exam-part rows", () => {
  const parsed: ParsedSyllabusDocument = {
    components: [
      {
        name: "Exam (final test)",
        kind: "final_exam",
        max_points: 40,
      },
    ],
  };
  const moodleRows: MoodleGradeRow[] = [
    moodleRow("part-1", "Exam - Part I", 6, 6, "final_exam", 1),
    moodleRow("part-2", "Submission of Exam - Part 2", 34, 34, "assignment", 2),
  ];

  const result = matchSyllabusToGrades(parsed, moodleRows, []);

  assert.deepEqual(
    result.sections[0]?.rows.map((row) => row.effective?.label ?? null),
    ["Exam - Part I", "Submission of Exam - Part 2"],
  );
  assert.deepEqual(result.unassignedMoodleRows, []);
});

test("submission page rows are treated as administrative noise for project buckets", () => {
  const parsed: ParsedSyllabusDocument = {
    components: [
      {
        name: "project assignment",
        kind: "project",
        max_points: 25,
      },
    ],
  };
  const moodleRows: MoodleGradeRow[] = [
    moodleRow("submission-page", "Submission page for team projects", null, 25, "assignment", 1),
  ];

  const result = matchSyllabusToGrades(parsed, moodleRows, []);

  assert.equal(result.sections[0]?.rows[0]?.effective, null);
  assert.deepEqual(result.unassignedMoodleRows, []);
});

test("a syllabus resource outranks an assignment attachment in the same course", () => {
  const syllabus = getSyllabusArtifactScore(
    { id: 1, name: "Course syllabus", modname: "resource", description: "", purpose: "content" } as Module,
    "General",
    { filename: "PMiDS course syllabus 20250327.pdf" },
  );
  const assignmentAttachment = getSyllabusArtifactScore(
    {
      id: 2,
      name: "Wattpad DW extension with core requirements",
      modname: "resource",
      description: "",
      purpose: "content",
    } as Module,
    "Week 4",
    { filename: "Wattpad DW project extension 20250312.docx" },
  );

  assert.ok(syllabus.score > assignmentAttachment.score);
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

test("best-of assignment buckets materialize concrete rows and only count the top results", () => {
  const parsed: ParsedSyllabusDocument = {
    components: [
      {
        name: "Assignments",
        kind: "assignment",
        max_points: 10,
        best_of: 2,
        children: [
          { name: "Assignment 1", kind: "assignment", max_points: 5, group: "assignment", index: 1, count: 2 },
          { name: "Assignment 2", kind: "assignment", max_points: 5, group: "assignment", index: 2, count: 2 },
        ],
      },
    ],
  };

  const moodleRows: MoodleGradeRow[] = [
    moodleRow("task-a", "Navigation", 5, 5, "assignment", 1),
    moodleRow("task-b", "FI General Ledger", 4, 5, "assignment", 2),
    moodleRow("task-c", "Process Mining Challenge", 3, 5, "assignment", 3),
  ];

  const result = matchSyllabusToGrades(parsed, moodleRows, []);

  assert.deepEqual(
    result.sections[0]?.rows.map((row) => row.label),
    ["Navigation", "FI General Ledger", "Process Mining Challenge"],
  );
  assert.equal(result.sections[0]?.postedPoints, 9);
  assert.equal(result.unassignedMoodleRows.length, 0);
});

test("unassigned quiz group variants are suppressed when a sibling variant matched", () => {
  const parsed: ParsedSyllabusDocument = {
    components: [
      {
        name: "Quizzes",
        kind: "quiz",
        children: [
          { name: "Quiz 1", kind: "quiz", index: 1, count: 2, group: "quiz" },
          { name: "Quiz 2", kind: "quiz", index: 2, count: 2, group: "quiz" },
        ],
      },
    ],
  };

  const moodleRows: MoodleGradeRow[] = [
    moodleRow("q1-a", "Group A", null, 10, "quiz", 1, "17 March - 23 March"),
    moodleRow("q1-b", "Group B", 2, 10, "quiz", 2, "17 March - 23 March"),
    moodleRow("q2-a", "Quiz no. 2 - Group A", null, 10, "quiz", 3, "5 May - 11 May"),
    moodleRow("q2-b", "Quiz no. 2 - Group B", 10, 10, "quiz", 4, "5 May - 11 May"),
  ];

  const result = matchSyllabusToGrades(parsed, moodleRows, []);

  assert.deepEqual(
    new Set(result.sections[0]?.rows.map((row) => row.effective?.label)),
    new Set(["Group B", "Quiz no. 2 - Group B"]),
  );
  assert.equal(result.unassignedMoodleRows.length, 0);
});

test("group assignment aggregates materialize assignment and presentation rows", () => {
  const parsed: ParsedSyllabusDocument = {
    components: [
      {
        name: "Semester group assignment",
        kind: "group_assignment",
        max_points: 30,
      },
    ],
  };

  const moodleRows: MoodleGradeRow[] = [
    moodleRow(
      "written",
      "Semester Assignment Upload 1: Deliverables 1-2 (written document + Excel)",
      14,
      15,
      "assignment",
      1,
    ),
    moodleRow(
      "presentation",
      "Semester Assignment Upload 2: Deliverables 3-4 (presentation + template)",
      9,
      10,
      "presentation",
      2,
    ),
    moodleRow(
      "reflection",
      "Semester Assignment Upload 3: Individual Assessment and Self-reflection (Task 3)",
      5,
      5,
      "assignment",
      3,
    ),
  ];

  const result = matchSyllabusToGrades(parsed, moodleRows, []);

  assert.deepEqual(
    result.sections[0]?.rows.map((row) => row.label),
    [
      "Semester Assignment Upload 1: Deliverables 1-2 (written document + Excel)",
      "Semester Assignment Upload 2: Deliverables 3-4 (presentation + template)",
      "Semester Assignment Upload 3: Individual Assessment and Self-reflection (Task 3)",
    ],
  );
  assert.equal(result.unassignedMoodleRows.length, 0);
});

test("buildMoodleGradeRows filters auxiliary rows and respects explicit label point caps", () => {
  const sections: ScopedRenderedSection[] = [
    {
      id: "1:general",
      name: "Mock test (does not cover all domains)",
      subtitle: "",
      summary: "",
      summaryformat: 0,
      modules: [scopedModule(1, 100, "ERP and SAP", "quiz", "assessment", "Mock test (does not cover all domains)")],
    },
    {
      id: "1:week-10",
      name: "10 November - 16 November",
      subtitle: "",
      summary: "",
      summaryformat: 0,
      modules: [
        scopedModule(
          1,
          101,
          "BPM Homework Submission – EPC Model (Individual Task) (first max 5 points)",
          "assign",
          "assessment",
          "10 November - 16 November",
        ),
        scopedModule(1, 102, "Retake exam: SAP test", "quiz", "assessment", "15 December - 21 December"),
        scopedModule(1, 103, "Task 1 upload", "assign", "assessment", "Week 1"),
        scopedModule(1, 104, "Upload your home task", "assign", "assessment", "General"),
      ],
    },
  ];

  const rows = buildMoodleGradeRows(
    { id: "1", title: "EDA", courseIds: [1], semesters: [] } as never,
    [
      {
        tables: [
          {
            tabledata: [
              gradeTableRow(
                "https://moodle.uni-corvinus.hu/mod/quiz/view.php?id=100",
                "ERP and SAP",
                "2.00",
                "0&ndash;2",
              ),
              gradeTableRow(
                "https://moodle.uni-corvinus.hu/mod/assign/view.php?id=101",
                "BPM Homework Submission – EPC Model (Individual Task) (first max 5 points)",
                "5.00",
                "0&ndash;10",
              ),
              gradeTableRow(
                "https://moodle.uni-corvinus.hu/mod/quiz/view.php?id=102",
                "Retake exam: SAP test",
                "-",
                "0&ndash;5",
              ),
              gradeTableRow(
                "https://moodle.uni-corvinus.hu/mod/assign/view.php?id=103",
                "Task 1 upload",
                "-",
                "0&ndash;100",
              ),
              gradeTableRow(
                "https://moodle.uni-corvinus.hu/mod/assign/view.php?id=104",
                "Upload your home task",
                "-",
                "0&ndash;100",
              ),
            ],
          },
        ],
      } as never,
    ],
    "https://moodle.uni-corvinus.hu",
    sections,
  );

  assert.deepEqual(
    rows.map((row) => row.label),
    ["BPM Homework Submission – EPC Model (Individual Task) (first max 5 points)", "Task 1 upload"],
  );
  assert.equal(rows[0]?.max, 5);
  assert.equal(rows[0]?.raw, 5);
});

test("buildMoodleGradeRows filters FoA-style eligibility, h5p, and comprehensive exam noise", () => {
  const sections: ScopedRenderedSection[] = [
    {
      id: "1:course-info",
      name: "Course information",
      subtitle: "",
      summary: "",
      summaryformat: 0,
      modules: [
        scopedModule(1, 201, "Final Exam - 27th May 10am", "quiz", "assessment", "Course information"),
        scopedModule(1, 202, "Comprehensive Exam - 2:00 pm, 2nd June 2025", "quiz", "assessment", "Course information"),
        scopedModule(1, 203, "Fortuma_interactive_video", "h5pactivity", "assessment", "Course information"),
        scopedModule(1, 204, "Can take final?", "gradeitem", "assessment", "Course information"),
        scopedModule(1, 205, "HW_assignment2_week4", "assign", "assessment", "10 March - 16 March"),
      ],
    },
  ];

  const rows = buildMoodleGradeRows(
    { id: "1", title: "FOA", courseIds: [1], semesters: [] } as never,
    [
      {
        tables: [
          {
            tabledata: [
              gradeTableRow(
                "https://moodle.uni-corvinus.hu/mod/quiz/view.php?id=201",
                "Final Exam - 27th May 10am",
                "94.33",
                "0&ndash;100",
              ),
              gradeTableRow(
                "https://moodle.uni-corvinus.hu/mod/quiz/view.php?id=202",
                "Comprehensive Exam - 2:00 pm, 2nd June 2025",
                "-",
                "0&ndash;150",
              ),
              gradeTableRow(
                "https://moodle.uni-corvinus.hu/mod/h5pactivity/view.php?id=203",
                "Fortuma_interactive_video",
                "-",
                "0&ndash;10",
              ),
              gradeTableRow(
                "https://moodle.uni-corvinus.hu/grade/report/user/index.php?id=1&item=204",
                "Can take final?",
                "yes",
                "yes&ndash;no",
              ),
              gradeTableRow(
                "https://moodle.uni-corvinus.hu/mod/assign/view.php?id=205",
                "HW_assignment2_week4",
                "100.00",
                "0&ndash;100",
              ),
            ],
          },
        ],
      } as never,
    ],
    "https://moodle.uni-corvinus.hu",
    sections,
  );

  assert.deepEqual(
    rows.map((row) => row.label),
    ["Final Exam - 27th May 10am"],
  );
});

test("buildMoodleGradeRows prefers explicit homework labels over quiz module type", () => {
  const sections: ScopedRenderedSection[] = [
    {
      id: "1:week-7",
      name: "7 April - 13 April",
      subtitle: "",
      summary: "",
      summaryformat: 0,
      modules: [scopedModule(1, 301, "Homework_3_Green", "quiz", "assessment", "7 April - 13 April")],
    },
  ];

  const rows = buildMoodleGradeRows(
    { id: "1", title: "FOA", courseIds: [1], semesters: [] } as never,
    [
      {
        tables: [
          {
            tabledata: [
              gradeTableRow(
                "https://moodle.uni-corvinus.hu/mod/quiz/view.php?id=301",
                "Homework_3_Green",
                "69.70",
                "0&ndash;100",
              ),
            ],
          },
        ],
      } as never,
    ],
    "https://moodle.uni-corvinus.hu",
    sections,
  );

  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.label, "Homework_3_Green");
  assert.equal(rows[0]?.kind, "assignment");
});

test("buildMoodleGradeRows keeps bare group labels as quiz rows when the module is a quiz", () => {
  const sections: ScopedRenderedSection[] = [
    {
      id: "1:week-3",
      name: "17 March - 23 March",
      subtitle: "",
      summary: "",
      summaryformat: 0,
      modules: [scopedModule(1, 302, "Group B", "quiz", "assessment", "17 March - 23 March")],
    },
  ];

  const rows = buildMoodleGradeRows(
    { id: "1", title: "Advanced Programming", courseIds: [1], semesters: [] } as never,
    [
      {
        tables: [
          {
            tabledata: [
              gradeTableRow("https://moodle.uni-corvinus.hu/mod/quiz/view.php?id=302", "Group B", "2.00", "0&ndash;10"),
            ],
          },
        ],
      } as never,
    ],
    "https://moodle.uni-corvinus.hu",
    sections,
  );

  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.label, "Group B");
  assert.equal(rows[0]?.kind, "quiz");
});

test("bonus quiz rows count under quizzes but only top regular-count quizzes contribute", () => {
  const parsed: ParsedSyllabusDocument = {
    components: [{ name: "Quizzes", kind: "quiz", max_points: 15 }],
  };

  const moodleRows: MoodleGradeRow[] = [
    moodleRow("q1", "Quiz_1", 4, 5, "quiz", 1),
    moodleRow("q2", "Quiz_2", 3, 5, "quiz", 2),
    moodleRow("q3", "Quiz_3", 2, 5, "quiz", 3),
    moodleRow("q4", "Quiz_4", 1, 5, "quiz", 4),
    moodleRow("bonus", "Bonus_Quiz_(for completing all weekly check-ins)", 5, 5, "quiz", 5),
  ];

  const result = matchSyllabusToGrades(parsed, moodleRows, []);

  assert.equal(result.sections[0]?.rows.length, 5);
  assert.equal(result.sections[0]?.postedPoints, 14);
  assert.equal(result.unassignedMoodleRows.length, 0);
});

test("matching uses workbook context aliases instead of exact filename matches", () => {
  const parsed: ParsedSyllabusDocument = {
    components: [
      {
        name: "Lecture quizzes",
        max_points: 20,
        children: [
          { name: "Lecture quiz 1", kind: "quiz", max_points: 10, group: "lecture quiz", index: 1, count: 2 },
          { name: "Lecture quiz 2", kind: "quiz", max_points: 10, group: "lecture quiz", index: 2, count: 2 },
        ],
      },
    ],
  };

  const workbookRows: WorkbookScoreEntry[] = [
    workbookRow("quiz-1", "Socrative #1", 8, 10, ["Weekly Lecture Materials", "Lecture Quizz #1"], "quiz"),
    workbookRow("quiz-2", "Socrative #2", 7, 10, ["Weekly Lecture Materials", "Lecture Quizz #2"], "quiz"),
  ];

  const result = matchSyllabusToGrades(parsed, [], workbookRows);
  assert.equal(result.sections[0].rows[0].effective?.label, "Socrative #1");
  assert.equal(result.sections[0].rows[1].effective?.label, "Socrative #2");
});

test("generic sequential placeholders match topic-named assignment rows deterministically", () => {
  const parsed: ParsedSyllabusDocument = {
    components: [
      {
        name: "Assignments",
        kind: "assignment",
        max_points: 15,
        children: [
          { name: "Assignment 1", kind: "assignment", max_points: 5, group: "assignments", index: 1, count: 3 },
          { name: "Assignment 2", kind: "assignment", max_points: 5, group: "assignments", index: 2, count: 3 },
          { name: "Assignment 3", kind: "assignment", max_points: 5, group: "assignments", index: 3, count: 3 },
        ],
      },
    ],
  };

  const moodleRows: MoodleGradeRow[] = [
    moodleRow("a1", "Navigation", null, null),
    moodleRow("a2", "FI General Ledger", null, null),
    moodleRow("a3", "BPM Homework Submission", null, null),
  ];

  const result = matchSyllabusToGrades(parsed, moodleRows, []);
  assert.deepEqual(
    new Set(result.sections[0].rows.map((row) => row.effective?.label ?? null)),
    new Set(["BPM Homework Submission", "FI General Ledger", "Navigation"]),
  );
  assert.equal(result.unassignedMoodleRows.length, 0);
});

test("generic aggregate buckets expand into multiple matching rows", () => {
  const parsed: ParsedSyllabusDocument = {
    components: [
      {
        name: "Seminar assignments",
        kind: "assignment",
        max_points: 50,
      },
    ],
  };

  const moodleRows: MoodleGradeRow[] = [
    moodleRow("att", "Attendance sheet (seminar)", null, null),
    moodleRow("swot", "SWOT analysis and ideas for growth", null, null),
    moodleRow("sched", "Scheduling the Wattpad DW project", null, null),
    moodleRow("present", "Submit your in-class team presentation", null, null),
  ];
  moodleRows[1]!.kind = "assignment";
  moodleRows[2]!.kind = "project";
  moodleRows[3]!.kind = "presentation";
  moodleRows[0]!.kind = "attendance";

  const result = matchSyllabusToGrades(parsed, moodleRows, []);
  assert.deepEqual(
    new Set(result.sections[0].rows.map((row) => row.label)),
    new Set([
      "SWOT analysis and ideas for growth",
      "Scheduling the Wattpad DW project",
      "Submit your in-class team presentation",
    ]),
  );
  assert.equal(result.unassignedMoodleRows.length, 0);
});

test("parseWorkbookEntries ignores early data rows when detecting workbook headers", async (t) => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "moodle-workbook-"));
  t.after(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  const courseDir = path.join(tempDir, "Statistical Modelling (ADIN010NABB) Előadás (E01)");
  const workbookPath = path.join(courseDir, "ADIN010NABB_Scores_Public.xlsx");
  await mkdir(courseDir, { recursive: true });

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Scores");
  sheet.addRow(["Neptun", "Lecture Quizz #1"]);
  sheet.addRow(["acvsc1", 9]);
  sheet.addRow(["aekroe", 7.5]);
  sheet.addRow(["almm2m", 8]);
  sheet.addRow(["am3ibz", 9.5]);
  sheet.addRow(["hw2nij", 10]);
  await workbook.xlsx.writeFile(workbookPath);

  const sections: ScopedRenderedSection[] = [
    {
      id: "215593:general",
      name: "General Information",
      subtitle: "",
      summary: "",
      summaryformat: 0,
      modules: [
        {
          id: "215593:module",
          sectionName: "General Information",
          course: {
            id: 215593,
            displayname: "Statistical Modelling (ADIN010NABB) Előadás (E01)",
            courseimage: "",
            timemodified: 0,
          },
          module: {
            id: 1,
            name: "Scores (updated: 13/03/2026)",
            description: "",
            instance: 1,
            visible: 1,
            uservisible: true,
            visibleoncoursepage: 1,
            modicon: "",
            modname: "resource",
            modplural: "resources",
            indent: 0,
            contents: [
              {
                filename: "ADIN010NABB_Scores_Public.xlsx",
                filepath: "/",
                filesize: 0,
                timemodified: 0,
                timecreated: 0,
                sortorder: 1,
                type: "file",
                userid: 0,
                author: "",
                license: "",
                fileurl: "",
              },
            ],
          } as Module,
        },
      ],
    },
  ];

  const parsed = await parseWorkbookEntries(sections, ["hw2nij"], { syncFolder: tempDir });
  assert.equal(parsed.matchedWorkbookRows.length, 1);
  assert.equal(parsed.entries.length, 1);
  assert.equal(parsed.entries[0]?.label, "Lecture Quizz #1");
  assert.equal(parsed.entries[0]?.raw, 10);
  assert.equal(parsed.entries[0]?.max, 10);
});

test("parseWorkbookEntries prefers task-level maxima in multi-row headers and skips summary columns", async (t) => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "moodle-workbook-"));
  t.after(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  const courseDir = path.join(tempDir, "Management of Processes and Operations (OPDO002NABB) Gyakorlat (G01)");
  const workbookPath = path.join(courseDir, "MPO G01 Seminar points 1218.xlsx");
  await mkdir(courseDir, { recursive: true });

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Points");
  sheet.addRow([
    "Neptun ID",
    "Class participation (30)",
    "Course Assignment (30)",
    "Course Assignment (30)",
    "Exam (40)",
    "Exam (40)",
    "Exam (40)",
    "Grade",
  ]);
  sheet.addRow(["Neptun ID", "1", "30", "30", "30", "30", "40", ""]);
  sheet.addRow([
    "Neptun ID",
    "W1 Task 0 intro",
    "Written deliverables (Task 1 + Task 2) (15)",
    "Presentation (Task 1 + Task 2) (10)",
    "Mid term (20)",
    "Final (20)",
    "Total",
    "Grade",
  ]);
  sheet.addRow(["HW2NIJ", 1, 14, 9.5, 19, 18, 37, 5]);
  await workbook.xlsx.writeFile(workbookPath);

  const sections: ScopedRenderedSection[] = [
    {
      id: "300001:general",
      name: "General Information",
      subtitle: "",
      summary: "",
      summaryformat: 0,
      modules: [
        {
          id: "300001:module",
          sectionName: "General Information",
          course: {
            id: 300001,
            displayname: "Management of Processes and Operations (OPDO002NABB) Gyakorlat (G01)",
            courseimage: "",
            timemodified: 0,
          },
          module: {
            id: 1,
            name: "MPO G01 Seminar points 1218.xlsx",
            description: "",
            instance: 1,
            visible: 1,
            uservisible: true,
            visibleoncoursepage: 1,
            modicon: "",
            modname: "resource",
            modplural: "resources",
            indent: 0,
            contents: [
              {
                filename: "MPO G01 Seminar points 1218.xlsx",
                filepath: "/",
                filesize: 0,
                timemodified: 0,
                timecreated: 0,
                sortorder: 1,
                type: "file",
                userid: 0,
                author: "",
                license: "",
                fileurl: "",
              },
            ],
          } as Module,
        },
      ],
    },
  ];

  const parsed = await parseWorkbookEntries(sections, ["HW2NIJ"], { syncFolder: tempDir });

  assert.deepEqual(
    parsed.entries.map((entry) => entry.label),
    [
      "W1 Task 0 intro",
      "Written deliverables (Task 1 + Task 2) (15)",
      "Presentation (Task 1 + Task 2) (10)",
      "Mid term (20)",
      "Final (20)",
    ],
  );
  assert.deepEqual(
    parsed.entries.map((entry) => entry.max),
    [1, 15, 10, 20, 20],
  );
});

test("parseWorkbookEntries extracts matched scores from stacked docx result tables", async (t) => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "moodle-docx-results-"));
  t.after(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  const courseName = "Társasági jog (2JO11NAV01M) Előadás (E01)";
  const courseDir = path.join(tempDir, sanitize(courseName));
  const sourcePath = path.join(courseDir, "results-source.txt");
  const docxFilename = "Társasági jog_2025tavasz_zh eredmények_NEPTUNkóddal.docx";
  const docxPath = path.join(courseDir, sanitize(docxFilename));
  await mkdir(courseDir, { recursive: true });
  await writeFile(
    sourcePath,
    [
      "Társasági jog zh eredmények",
      "2024/25. tavaszi félév",
      "",
      "Ssz.",
      "Neptunkód",
      "zh eredmény",
      "•",
      "XZ6IVT",
      "közepes (3), 16 pont",
      "•",
      "HW2NIJ",
      "jeles (5), 23 pont",
      "",
    ].join("\n"),
    "utf8",
  );
  await execFileVoid("/usr/bin/textutil", ["-convert", "docx", sourcePath, "-output", docxPath]);

  const sections = [buildWorkbookSection(courseName, "Zh eredmények", docxFilename, 207341)];
  const parsed = await parseWorkbookEntries(sections, ["HW2NIJ"], { syncFolder: tempDir });

  assert.equal(parsed.matchedWorkbookRows.length, 1);
  assert.equal(parsed.entries.length, 1);
  assert.equal(parsed.entries[0]?.label, "zh eredmény");
  assert.equal(parsed.entries[0]?.raw, 23);
  assert.equal(parsed.entries[0]?.max, 25);
});

test("parseWorkbookEntries extracts matched scores from fixed-width pdf result tables", async (t) => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "moodle-pdf-results-"));
  t.after(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  const courseName = "Data Warehousing and Business Analytics (ADIN014NABB) Gyakorlat (G02)";
  const courseDir = path.join(tempDir, sanitize(courseName));
  const sourcePath = path.join(courseDir, "results-source.txt");
  const pdfPath = path.join(courseDir, "DWBI_G02_RESULTS.pdf");
  await mkdir(courseDir, { recursive: true });
  await writeFile(
    sourcePath,
    [
      "                   Class activity                                                                       Assignment",
      "                 Submission of at        Mid-term exam                 Final exam            Submission of a model/Power BI                         HUNGARIAN",
      "                   least 60% of     at least 50% score (20%)    at least 50% score (30%)   application that has a workable data                       GRADE",
      "                 classwork (20%)                                                           model and a basic functionality (30%)",
      "                                    Mid-term exam               Final exam                         Assignment",
      "   Neptun code        Weight                        Weight                     Weight                                    Weight",
      "                                    max 15 points              max 30 points                   max 35 points (+/- 5)",
      "18 hw2nij              0,2              12,5         0,17            30          0,3                    37               0,2775       0,94   94,42 Excellent (5)    A",
      "",
    ].join("\n"),
    "utf8",
  );
  const pdfBuffer = await execFileBuffer("/usr/sbin/cupsfilter", ["-m", "application/pdf", sourcePath]);
  await writeFile(pdfPath, pdfBuffer);

  const sections = [buildWorkbookSection(courseName, "G02_RESULTS", path.basename(pdfPath), 211540)];
  const parsed = await parseWorkbookEntries(sections, ["hw2nij"], { syncFolder: tempDir });

  assert.equal(parsed.matchedWorkbookRows.length, 1);
  assert.deepEqual(
    parsed.entries.map((entry) => [entry.label, entry.raw, entry.max]),
    [
      ["Class activity", 20, 20],
      ["Mid-term exam", 12.5, 15],
      ["Final exam", 30, 30],
      ["Assignment", 37, 40],
    ],
  );
});

function moodleRow(
  id: string,
  label: string,
  raw: number | null,
  max: number | null,
  kind = "assignment",
  rowIndex = 0,
  sectionName?: string,
): MoodleGradeRow {
  return {
    id,
    courseId: 1,
    label,
    normalizedLabel: label.toLowerCase(),
    kind,
    raw,
    max,
    pct: raw != null && max != null ? (raw / max) * 100 : null,
    posted: raw != null && max != null,
    source: "moodle",
    sectionName,
    row: {},
    rowIndex,
  };
}

function workbookRow(
  id: string,
  label: string,
  raw: number,
  max: number,
  contextLabels: string[] = [label],
  kind = "assignment",
): WorkbookScoreEntry {
  return {
    id,
    courseId: 1,
    label,
    headerLabel: contextLabels[0] ?? label,
    normalizedLabel: label.toLowerCase(),
    contextLabels,
    normalizedContextLabels: contextLabels.map((value) => value.toLowerCase()),
    kind,
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

function buildWorkbookSection(
  courseName: string,
  moduleName: string,
  filename: string,
  courseId: number,
): ScopedRenderedSection {
  return {
    id: `${courseId}:general`,
    name: "General Information",
    subtitle: "",
    summary: "",
    summaryformat: 0,
    modules: [
      {
        id: `${courseId}:module`,
        sectionName: "General Information",
        course: {
          id: courseId,
          displayname: courseName,
          courseimage: "",
          timemodified: 0,
        },
        module: {
          id: 1,
          name: moduleName,
          description: "",
          instance: 1,
          visible: 1,
          uservisible: true,
          visibleoncoursepage: 1,
          modicon: "",
          modname: "resource",
          modplural: "resources",
          indent: 0,
          contents: [
            {
              filename,
              filepath: "/",
              filesize: 0,
              timemodified: 0,
              timecreated: 0,
              sortorder: 1,
              type: "file",
              userid: 0,
              author: "",
              license: "",
              fileurl: "",
            },
          ],
        } as Module,
      },
    ],
  };
}

async function execFileVoid(command: string, args: readonly string[]) {
  await new Promise<void>((resolve, reject) => {
    execFile(command, args, { maxBuffer: 12 * 1024 * 1024 }, (error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

async function execFileBuffer(command: string, args: readonly string[]) {
  return await new Promise<Buffer>((resolve, reject) => {
    execFile(command, args, { encoding: "buffer", maxBuffer: 12 * 1024 * 1024 }, (error, stdout) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(Buffer.isBuffer(stdout) ? stdout : Buffer.from(stdout));
    });
  });
}

function scopedModule(
  courseId: number,
  moduleId: number,
  name: string,
  modname: string,
  purpose: string,
  sectionName: string,
) {
  return {
    id: `${courseId}:${moduleId}`,
    sectionName,
    course: {
      id: courseId,
      displayname: "Test course",
      courseimage: "",
      timemodified: 0,
    },
    module: {
      id: moduleId,
      name,
      description: "",
      instance: moduleId,
      visible: 1,
      uservisible: true,
      visibleoncoursepage: 1,
      modicon: "",
      modname,
      modplural: `${modname}s`,
      indent: 0,
      purpose,
      contents: [],
    } as Module,
  };
}

function gradeTableRow(href: string, label: string, grade: string, range: string) {
  return {
    itemname: {
      content: `<a class="gradeitemheader" href="${href}">${label}</a>`,
    },
    grade: { content: grade },
    range: { content: range },
  };
}
