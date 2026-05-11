import { describe, expect, it } from "bun:test";

import {
  buildGradeAccessoryTextByModuleIdFromTables,
  toGradeRowSummaries,
} from "./grade-core";
import type { CoreGradesGetUserGradesTableWSResponse } from "./grade-types";

const siteUrl = "https://moodle.example.com";

describe("grade-core", () => {
  it("strips Moodle grade analysis helper text from accessory labels and row summaries", () => {
    const tables: CoreGradesGetUserGradesTableWSResponse[] = [
      {
        tables: [
          {
            tabledata: [
              {
                itemname: {
                  content:
                    '<a class="gradeitemheader" href="/mod/quiz/view.php?id=42">Quiz 1</a>',
                },
                grade: {
                  content: "85.00",
                },
                range: {
                  content: "0.00\u2013100.00",
                },
                percentage: {
                  content:
                    '<a href="/grade/report/user/index.php?id=7">Grade analysis</a> 85.00 %',
                },
              },
            ],
          },
        ],
      },
    ];

    const accessoryText = buildGradeAccessoryTextByModuleIdFromTables(tables, {
      siteUrl,
    });
    expect(accessoryText.get(42)).toBe("85 / 100.00");

    const summaries = toGradeRowSummaries(tables[0]?.tables?.[0]?.tabledata, {
      siteUrl,
    });
    expect(summaries).toEqual([
      {
        label: "Quiz 1",
        grade: "85.00",
        range: "0.00\u2013100.00",
        percentage: "85.00 %",
        moduleId: 42,
      },
    ]);
  });
});
