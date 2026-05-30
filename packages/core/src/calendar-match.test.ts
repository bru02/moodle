import { describe, expect, it } from "bun:test";

import {
  matchCalendarEventsToCourseScopes,
  toCalendarEvent,
} from "./calendar-match";
import type { MoodleCourseLike } from "./course-types";

const courses: MoodleCourseLike[] = [
  {
    id: 207306,
    fullname: "Foundations of Accounting (SZAM010NABB) Előadás (E01-FOA)",
    displayname: "Foundations of Accounting (SZAM010NABB) Előadás (E01-FOA)",
    shortname: "SZAM010NABB_Előadás:E01-FOA (2024/25/2)",
    courseimage: "",
    timemodified: 1,
  },
  {
    id: 212333,
    fullname: "Managerial Accounting (SZAM011NABB) Előadás (E01-UZAD)",
    displayname: "Managerial Accounting (SZAM011NABB) Előadás (E01-UZAD)",
    shortname: "SZAM011NABB_Előadás:E01-UZAD-MA (2025/26/1)",
    courseimage: "",
    timemodified: 1,
  },
  {
    id: 212335,
    fullname: "Managerial Accounting (SZAM011NABB) Gyakorlat (G01-UZAD)",
    displayname: "Managerial Accounting (SZAM011NABB) Gyakorlat (G01-UZAD)",
    shortname: "SZAM011NABB_Gyakorlat:G01-UZAD-MA (2025/26/1)",
    courseimage: "",
    timemodified: 1,
  },
  {
    id: 215603,
    fullname: "Data Wrangling - Project Course (ADIN015NABB) Gyakorlat (G02)",
    displayname:
      "Data Wrangling - Project Course (ADIN015NABB) Gyakorlat (G02)",
    shortname: "ADIN015NABB_Gyakorlat:G02 (2025/26/2)",
    courseimage: "",
    timemodified: 1,
  },
];

describe("calendar course matching", () => {
  it("maps lecture events to the merged scope via the description section code", () => {
    const event = toCalendarEvent({
      title: "Foundations of Accounting",
      notes: "E01-FOA\n\nJánny Marianna\n\n",
    });

    const { matches } = matchCalendarEventsToCourseScopes(courses, [event]);

    expect(matches).toHaveLength(1);
    expect(matches[0]?.scope.title).toBe("Foundations of Accounting");
    expect(matches[0]?.matchedBy.section).toBe(true);
  });

  it("maps exam events by base title when the calendar event has no section code", () => {
    const event = toCalendarEvent({
      title: "Managerial Accounting (Írásbeli) - Someone - Vizsga",
    });

    const { matches } = matchCalendarEventsToCourseScopes(courses, [event]);

    expect(matches).toHaveLength(1);
    expect(matches[0]?.scope.title).toBe("Managerial Accounting");
    expect(matches[0]?.matchedBy.title).toBe(true);
  });

  it("keeps hyphenated course titles intact instead of treating them like exam suffixes", () => {
    const event = toCalendarEvent({
      title: "Data Wrangling – Project Course",
      notes: "G02\n\nTeacher\n\n",
    });

    const { matches } = matchCalendarEventsToCourseScopes(courses, [event]);

    expect(matches).toHaveLength(1);
    expect(matches[0]?.scope.title).toBe("Data Wrangling - Project Course");
  });

  it("can match unmerged scopes when course merging is disabled", () => {
    const event = toCalendarEvent({
      title: "Managerial Accounting",
      notes: "G01-UZAD-MA\n\nTeacher\n\n",
    });

    const { matches } = matchCalendarEventsToCourseScopes(courses, [event], {
      merge: false,
    });

    expect(matches).toHaveLength(1);
    expect(matches[0]?.scope.id).toBe("212335");
    expect(matches[0]?.matchedBy.section).toBe(true);
  });
});
