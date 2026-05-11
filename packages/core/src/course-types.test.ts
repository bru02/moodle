import { describe, expect, it } from "bun:test";

import {
  extractCourseCode,
  stripCourseCodeFromTitle,
  toSimpleCourse,
} from "./course-types";

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
    expect(course.seminarGroup).toBe("E01-P");
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
    const title =
      "Business economics / Business Essentials METACOURSE (2024/25/1)";

    expect(
      extractCourseCode({
        fullname: title,
        displayname: title,
        shortname: title,
      }),
    ).toBeUndefined();
    expect(stripCourseCodeFromTitle(title)).toBe(title);
  });

  it("extracts Pannon course code and seminar group from combined tokens", () => {
    const course = toSimpleCourse({
      id: 1,
      fullname:
        "Általános pszichológia 1. [ONVH_GYAK_05] (VETKPMB245GP/2025/26/2)",
      displayname:
        "Általános pszichológia 1. [ONVH_GYAK_05] (VETKPMB245GP/2025/26/2)",
      shortname: "VETKPMB245GP_ONVH_GYAK_05/2025/26/2",
      courseimage: "",
      timemodified: 1,
    });

    expect(course.courseCode).toBe("VETKPMB245GP");
    expect(course.displayname).toBe("Általános pszichológia 1. [ONVH_GYAK_05]");
    expect(course.seminarGroup).toBe("ONVH_GYAK_05");
    expect(course.semester).toBe("2025/26/2");
  });

  it("extracts Pannon course code without inventing a seminar group", () => {
    const course = toSimpleCourse({
      id: 1,
      fullname:
        "Mesterséges intelligencia eszközök alkalmazása az oktatásban, kutatásban és kreatív munkában (VEMISAS313MI/2025/26/2)",
      displayname:
        "Mesterséges intelligencia eszközök alkalmazása az oktatásban, kutatásban és kreatív munkában (VEMISAS313MI/2025/26/2)",
      shortname: "VEMISAS313MI/2025/26/2",
      courseimage: "",
      timemodified: 1,
    });

    expect(course.courseCode).toBe("VEMISAS313MI");
    expect(course.displayname).toBe(
      "Mesterséges intelligencia eszközök alkalmazása az oktatásban, kutatásban és kreatív munkában",
    );
    expect(course.seminarGroup).toBeUndefined();
    expect(course.semester).toBe("2025/26/2");
  });

  it("does not treat bracketed semesters as seminar groups", () => {
    const course = toSimpleCourse({
      id: 1,
      fullname: "Tanulásmódszertan [2025/26/1]",
      displayname: "Tanulásmódszertan [2025/26/1]",
      shortname: "Tanulásmódszertan [2025/26/1]",
      courseimage: "",
      timemodified: 1,
    });

    expect(course.courseCode).toBeUndefined();
    expect(course.seminarGroup).toBeUndefined();
    expect(course.semester).toBe("2025/26/1");
  });

  it("extracts lecture section codes like E01", () => {
    const course = toSimpleCourse({
      id: 1,
      fullname: "Software Engineering (ADIN011NABB) Előadás (E01)",
      displayname: "Software Engineering (ADIN011NABB) Előadás (E01)",
      shortname: "ADIN011NABB_Előadás:E01 (2025/26/2)",
      courseimage: "",
      timemodified: 1,
    });

    expect(course.courseCode).toBe("ADIN011NABB");
    expect(course.seminarGroup).toBe("E01");
    expect(course.semester).toBe("2025/26/2");
  });
});
