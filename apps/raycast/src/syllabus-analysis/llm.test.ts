import assert from "node:assert/strict";
import test from "node:test";

import { MockLanguageModelV3 } from "ai/test";

import { buildSyllabusPrompt, parseSyllabusWithGemini } from "./llm";

test("buildSyllabusPrompt includes Moodle row names and workbook column headers for alignment", () => {
  const prompt = buildSyllabusPrompt(
    [
      {
        sourceLabel: "Syllabus.pdf",
        sectionName: "General",
        text: "Assignments 30%. Exam 70%.",
        localPath: "/tmp/Syllabus.pdf",
        isPdf: true,
      },
    ],
    [
      {
        label: "BPM Homework Submission - EPC Model",
        kind: "assignment",
        max: 5,
        moduleName: "Homework 1",
        sectionName: "Week 4",
      },
    ],
    [
      {
        label: "Written deliverables",
        headerLabel: "Course Assignment (30) / Written deliverables (Task 1 + Task 2) (15)",
        kind: "assignment",
        max: 15,
        sheetName: "Points",
        workbookPath: "/tmp/MPO G01 Seminar points 1218.xlsx",
        contextLabels: ["Written deliverables", "Points", "MPO G01 Seminar points 1218.xlsx"],
      },
    ],
    1,
  );

  assert.match(prompt, /Use the Moodle assignment names and workbook column headers as naming hints/);
  assert.match(prompt, /Preserve the original course language/);
  assert.match(prompt, /Prefer concrete Moodle child labels/);
  assert.match(prompt, /BPM Homework Submission - EPC Model/);
  assert.match(prompt, /module=Homework 1/);
  assert.match(prompt, /header=Course Assignment \(30\) \/ Written deliverables \(Task 1 \+ Task 2\) \(15\)/);
  assert.match(prompt, /workbook=MPO G01 Seminar points 1218\.xlsx/);
  assert.match(prompt, /# Workbook Columns/);
});

test("parseSyllabusWithGemini repairs malformed JSONish output end to end", async () => {
  const parsed = await parseSyllabusWithGemini({
    documents: [
      {
        sourceLabel: "Syllabus page",
        sectionName: "General",
        text: "Assignments 30 points total.",
      },
    ],
    moodleRows: [],
    workbookRows: [],
    _internal: {
      model: new MockLanguageModelV3({
        doGenerate: async () => ({
          content: [
            {
              type: "text",
              text: [
                "Here is the parsed grading structure:",
                "```json",
                "{",
                "  normal_total_points: 100,",
                "  components: [",
                "    {",
                "      name: 'Assignments',",
                "      max_points: 30,",
                "      children: ['Assignment 1',],",
                "    },",
                "  ],",
                "}",
                "```",
              ].join("\n"),
            },
          ],
          finishReason: { unified: "stop", raw: undefined },
          usage: {
            inputTokens: {
              total: 10,
              noCache: 10,
              cacheRead: undefined,
              cacheWrite: undefined,
            },
            outputTokens: {
              total: 20,
              text: 20,
              reasoning: undefined,
            },
          },
          warnings: [],
        }),
      }),
    },
  });

  assert.equal(parsed.normal_total_points, 100);
  assert.equal(parsed.components.length, 1);
  assert.equal(parsed.components[0]?.name, "Assignments");
  assert.equal(parsed.components[0]?.kind, "assignment");
  assert.equal(parsed.components[0]?.children?.[0]?.name, "Assignment 1");
  assert.equal(parsed.components[0]?.children?.[0]?.kind, "assignment");
});

test("parseSyllabusWithGemini drops administrative component labels", async () => {
  const parsed = await parseSyllabusWithGemini({
    documents: [
      {
        sourceLabel: "Syllabus page",
        sectionName: "General",
        text: "Project 25 points. Exam 40 points.",
      },
    ],
    moodleRows: [],
    workbookRows: [],
    _internal: {
      model: new MockLanguageModelV3({
        doGenerate: async () => ({
          content: [
            {
              type: "text",
              text: JSON.stringify({
                normal_total_points: 65,
                components: [
                  { name: "Submission page for team projects", kind: "project", max_points: 25 },
                  { name: "Exam", kind: "final_exam", max_points: 40 },
                  { name: "MARKETING LECKE", kind: "other", max_points: 10 },
                ],
              }),
            },
          ],
          finishReason: { unified: "stop", raw: undefined },
          usage: {
            inputTokens: { total: 10, noCache: 10, cacheRead: undefined, cacheWrite: undefined },
            outputTokens: { total: 20, text: 20, reasoning: undefined },
          },
          warnings: [],
        }),
      }),
    },
  });

  assert.deepEqual(
    parsed.components.map((component) => component.name),
    ["Exam"],
  );
});
