import { describe, expect, it } from "bun:test";

import { extractCourseCode, stripCourseCodeFromTitle, toSimpleCourse } from "./course-types";

describe("course title parsing", () => {
  it("extracts course code from fullname and strips it from displayname", () => {
    const course = toSimpleCourse({
      id: 1,
      fullname: "Adójog alapjai (2JO11NAV03B) Előadás (E01-P)",
      displayname: "Adójog alapjai (2JO11NAV03B) Előadás (E01-P)",
      shortname: "2JO11NAV03B_Előadás:E01-P (2024/25/1)",
      courseimage: "",
      timemodified: 1,
    });

    expect(course.courseCode).toBe("2JO11NAV03B");
    expect(course.displayname).toBe("Adójog alapjai Előadás (E01-P)");
    expect(course.seminarGroup).toBeUndefined();
    expect(course.semester).toBe("2024/25/1");
  });

  it("extracts course code from shortname when fullname token is not code-shaped", () => {
    expect(
      extractCourseCode({
        fullname: "Testnevelés Gyakorlat (FM 04 - falmászás)",
        displayname: "Testnevelés Gyakorlat (FM 04 - falmászás)",
        shortname: "TES_TESTNEVB_Gyakorlat:FM 04 - falmászás (2024/25/2)",
      }),
    ).toBe("TES_TESTNEVB");
  });

  it("keeps titles unchanged when they do not carry a course code", () => {
    const title = "Business economics / Business Essentials METACOURSE (2024/25/1)";

    expect(
      extractCourseCode({
        fullname: title,
        displayname: title,
        shortname: title,
      }),
    ).toBeUndefined();
    expect(stripCourseCodeFromTitle(title)).toBe(title);
  });
});
