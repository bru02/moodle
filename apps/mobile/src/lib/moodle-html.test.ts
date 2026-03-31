import { readFileSync } from "node:fs";

import { describe, expect, it } from "bun:test";

import {
  extractMoodleActivityModuleId,
  MOODLE_MATH_BLOCK_TAG,
  MOODLE_MATH_INLINE_TAG,
  prepareMoodleHtml,
} from "./moodle-html";

describe("prepareMoodleHtml", () => {
  const syllabusFixture = readFileSync(new URL("../../../../sna.html", import.meta.url), "utf8");

  it("selects the current multilang2 block", () => {
    const html = prepareMoodleHtml({
      html: '{mlang en}Hello{mlang}{mlang de}Hallo{mlang}',
    });

    expect(html).toContain("Hello");
    expect(html).not.toContain("Hallo");
  });

  it("falls back to the other multilang2 block", () => {
    const html = prepareMoodleHtml({
      html: '{mlang fr}Bonjour{mlang}{mlang other}Hello{mlang}',
    });

    expect(html).toContain("Hello");
    expect(html).not.toContain("Bonjour");
  });

  it("strips inline data images", () => {
    const html = prepareMoodleHtml({
      html: '<p>Before</p><img src="data:image/png;base64,abc" alt="Inline" /><p>After</p>',
    });

    expect(html).toContain("Before");
    expect(html).toContain("After");
    expect(html).not.toContain("data:image/png");
  });

  it("rewrites relative links and images using module contents", () => {
    const html = prepareMoodleHtml({
      html: '<p><a href="chapter2.html">Next</a><img src="media/pic.png" alt="Pic" /></p>',
      baseUrl: "https://moodle.example/mod/page/view.php?id=42",
      siteOrigin: "https://moodle.example",
      accessKey: "abc123",
      contents: [
        {
          filename: "chapter2.html",
          filepath: "/",
          fileurl: "https://moodle.example/pluginfile.php/10/mod_page/content/0/chapter2.html",
        },
        {
          filename: "pic.png",
          filepath: "/media/",
          fileurl: "https://moodle.example/pluginfile.php/10/mod_page/content/0/media/pic.png",
        },
      ],
    });

    expect(html).toContain('/tokenpluginfile.php/abc123/10/mod_page/content/0/chapter2.html');
    expect(html).toContain('/tokenpluginfile.php/abc123/10/mod_page/content/0/media/pic.png');
  });

  it("converts youtube iframes into image and link fallbacks", () => {
    const html = prepareMoodleHtml({
      html: '<iframe src="https://www.youtube.com/embed/dQw4w9WgXcQ" title="Intro"></iframe>',
    });

    expect(html).toContain("i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg");
    expect(html).toContain(">Intro<");
  });

  it("unwraps mathjax helper spans and converts inline math to render tags", () => {
    const html = prepareMoodleHtml({
      html: '<span class="filter_mathjaxloader_equation"><span class="nolink">\\(x^2 + y^2\\)</span></span>',
    });

    expect(html).toContain(`<${MOODLE_MATH_INLINE_TAG}`);
    expect(html).toContain('\\(x^2 + y^2\\)');
    expect(html).not.toContain("filter_mathjaxloader_equation");
    expect(html).not.toContain('class="nolink"');
  });

  it("converts bracket display math to block render tags", () => {
    const html = prepareMoodleHtml({
      html: "<p>Before</p>\\[x^2 + y^2\\]<p>After</p>",
    });

    expect(html).toContain(`<${MOODLE_MATH_BLOCK_TAG}`);
    expect(html).toContain("\\[x^2 + y^2\\]");
  });

  it("converts dollar display math to block render tags", () => {
    const html = prepareMoodleHtml({
      html: "<p>Before</p>$$x^2 + y^2$$<p>After</p>",
    });

    expect(html).toContain(`<${MOODLE_MATH_BLOCK_TAG}`);
    expect(html).toContain("$$x^2 + y^2$$");
  });

  it("normalizes presentational syllabus html into renderable mobile blocks", () => {
    const html = prepareMoodleHtml({
      html: syllabusFixture,
    });

    expect(html).toContain("font-weight: bold");
    expect(html).toContain("<table");
    expect(html).toContain("Points</span>");
    expect(html).toContain("Week");
    expect(html).toContain("Task description of Simulation HW is available");
  });
});

describe("extractMoodleActivityModuleId", () => {
  it("extracts same-site Moodle activity ids", () => {
    expect(
      extractMoodleActivityModuleId("https://moodle.example/mod/forum/view.php?id=99", "https://moodle.example"),
    ).toBe("99");
  });

  it("ignores non-activity urls", () => {
    expect(
      extractMoodleActivityModuleId("https://moodle.example/course/view.php?id=99", "https://moodle.example"),
    ).toBeNull();
  });
});
