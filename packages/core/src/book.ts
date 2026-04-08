import { cleanMoodleHtml } from "./utils";

export type BookTocChapter = {
  href: string;
  title: string;
};

type BookTocChapterRaw = {
  href?: string;
  title?: string;
};

type BookContentLike = {
  filename?: string;
  filepath?: string;
  fileurl?: string;
};

export function parseBookToc(content?: string): BookTocChapter[] {
  if (!content) {
    return [];
  }

  try {
    const parsed = JSON.parse(content) as BookTocChapterRaw[];
    return parsed
      .map((chapter) => ({
        href: chapter.href ?? "",
        title: cleanMoodleHtml(chapter.title ?? ""),
      }))
      .filter((chapter) => chapter.href && chapter.title);
  } catch {
    return [];
  }
}

export function resolveBookChapterContentFile<T extends BookContentLike>(contents: readonly T[] | undefined, chapterHref: string) {
  if (!contents || !chapterHref) {
    return undefined;
  }

  const candidates = contents.filter((content) => content.filename !== "structure");

  const directMatch = candidates.find((content) => content.fileurl?.endsWith(chapterHref));
  if (directMatch) {
    return directMatch;
  }

  const normalizedHref = normalizePath(chapterHref);
  const hrefBasename = normalizedHref.split("/").at(-1);

  const byPathMatch = candidates.find((content) => normalizePath(`${content.filepath ?? ""}${content.filename ?? ""}`) === normalizedHref);
  if (byPathMatch) {
    return byPathMatch;
  }

  const byFilenameMatch = hrefBasename ? candidates.find((content) => content.filename === hrefBasename) : undefined;
  if (byFilenameMatch) {
    return byFilenameMatch;
  }

  const chapterId = extractBookChapterId(chapterHref);
  if (!chapterId) {
    return undefined;
  }

  return candidates.find((content) => {
    const fileUrl = content.fileurl ?? "";
    return fileUrl.includes(`/mod_book/chapter/${chapterId}`) || (/[?&]chapterid=\d+/.test(fileUrl) && fileUrl.includes(`chapterid=${chapterId}`));
  });
}

export function extractBookChapterId(chapterHref: string) {
  const byParam = chapterHref.match(/[?&]chapterid=(\d+)/i)?.[1];
  if (byParam) {
    return byParam;
  }

  const bySegment = chapterHref.match(/\/chapter\/(\d+)/i)?.[1];
  if (bySegment) {
    return bySegment;
  }

  const firstNumber = chapterHref.match(/(\d+)/)?.[1];
  return firstNumber ?? undefined;
}

function normalizePath(path: string) {
  const [withoutQuery] = path.split(/[?#]/, 1);
  const normalized = decodeURIComponent(withoutQuery).replace(/\\/g, "/").replace(/\/+/g, "/");
  return normalized.startsWith("/") ? normalized : `/${normalized}`;
}
