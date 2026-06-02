import { describe, expect, it } from "bun:test";
import { buildAnalysisBundle } from "./discovery";
import type { CourseGradesSyncResult } from "./types";

describe("buildAnalysisBundle", () => {
  it("matches the Moodle username as Neptune code case-insensitively", () => {
    const sync: CourseGradesSyncResult = {
      syncedAt: "2026-05-31T00:00:00.000Z",
      siteOrigin: "https://moodle.example.test",
      userId: 7,
      username: "AbC123",
      courses: [
        {
          course: {
            id: 42,
            displayname: "Algorithms",
            courseimage: "",
            timemodified: 0,
          },
          files: [],
          contents: [
            {
              id: 1,
              name: "General",
              summary: "",
              modules: [
                {
                  id: 9,
                  name: "Scores",
                  instance: 9,
                  description: "abc123 got 12 points in the spreadsheet.",
                  visible: 1,
                  uservisible: true,
                  visibleoncoursepage: 1,
                  modicon: "",
                  modname: "page",
                  modplural: "pages",
                  indent: 0,
                },
              ],
            },
          ],
        },
      ],
    };

    const bundle = buildAnalysisBundle({
      sync,
      neptuneCode: sync.username,
    });

    expect(bundle.evidence).toContainEqual(
      expect.objectContaining({
        kind: "neptune-code",
        moduleId: 9,
      }),
    );
  });
});
