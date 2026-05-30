import { buildCourseScopes } from "./course-scope";
import type { CourseScope, MoodleCourseLike } from "./course-types";
import { toSimpleCourse } from "./course-types";
import { cleanMoodleText } from "./utils";

export type CalendarEvent = {
  uid?: string;
  summary: string;
  description?: string;
  location?: string;
  dtstart?: string;
  dtend?: string;
};

export type CalendarScopeMatch = {
  event: CalendarEvent;
  scope: CourseScope;
  score: number;
  matchedBy: {
    title: boolean;
    section: boolean;
  };
};

export type DeviceCalendarEventLike = {
  id?: string;
  title: string;
  notes?: string | null;
  location?: string | null;
  startDate?: string | Date;
  endDate?: string | Date;
};

export type CalendarScopeMatcher = {
  scopes: CourseScope[];
  matchEvent(event: CalendarEvent): CalendarScopeMatch | undefined;
  matchEvents(events: readonly CalendarEvent[]): {
    scopes: CourseScope[];
    matches: CalendarScopeMatch[];
    unmatchedEvents: CalendarEvent[];
  };
};

export function matchCalendarEventsToCourseScopes(
  courseRows: readonly MoodleCourseLike[],
  events: readonly CalendarEvent[],
  options?: {
    merge?: boolean;
  },
) {
  return buildCalendarScopeMatcher(courseRows, options).matchEvents(events);
}

export function buildCalendarScopeMatcher(
  courseRows: readonly MoodleCourseLike[],
  options?: {
    merge?: boolean;
  },
): CalendarScopeMatcher {
  const scopes = buildCourseScopes(courseRows.map(toSimpleCourse), options?.merge);
  const rowsByCourseId = new Map(
    courseRows.map((row) => [Number(row.id), row] as const),
  );
  return buildCalendarScopeMatcherForScopes(scopes, rowsByCourseId);
}

export function buildCalendarScopeMatcherForScopes(
  scopes: readonly CourseScope[],
  rowsByCourseId: ReadonlyMap<number, MoodleCourseLike> = new Map(),
): CalendarScopeMatcher {
  const titleIndex = new Map<string, ScopeIndexEntry[]>();

  for (const scope of scopes) {
    const entry = indexScope(scope, rowsByCourseId);
    for (const title of entry.normalizedTitles) {
      const bucket = titleIndex.get(title);
      if (bucket) {
        bucket.push(entry);
      } else {
        titleIndex.set(title, [entry]);
      }
    }
  }

  return {
    scopes: [...scopes],
    matchEvent(event) {
      return matchEventToScope(event, titleIndex);
    },
    matchEvents(events) {
      const matches: CalendarScopeMatch[] = [];
      const unmatchedEvents: CalendarEvent[] = [];

      for (const event of events) {
        const match = matchEventToScope(event, titleIndex);
        if (match) {
          matches.push(match);
        } else {
          unmatchedEvents.push(event);
        }
      }

      return {
        scopes: [...scopes],
        matches,
        unmatchedEvents,
      };
    },
  };
}

export function toCalendarEvent(input: DeviceCalendarEventLike): CalendarEvent {
  return {
    uid: input.id,
    summary: input.title,
    description: input.notes ?? "",
    location: input.location ?? "",
    dtstart: toIsoString(input.startDate),
    dtend: toIsoString(input.endDate),
  };
}

function matchEventToScope(
  event: CalendarEvent,
  titleIndex: ReadonlyMap<string, readonly ScopeIndexEntry[]>,
): CalendarScopeMatch | undefined {
  const eventTitle = extractEventBaseTitle(event.summary);
  const normalizedEventTitle = normalize(eventTitle);
  const eventSection = extractEventSection(event.description);
  const normalizedEventSection = eventSection
    ? normalizeSectionCode(eventSection)
    : undefined;
  const candidates = titleIndex.get(normalizedEventTitle);

  if (!candidates || candidates.length === 0) {
    return undefined;
  }

  let bestMatch: CalendarScopeMatch | undefined;

  for (const entry of candidates) {
    const sectionMatches =
      normalizedEventSection != null &&
      entry.sectionCodes.some(
        (sectionCode) => sectionCode === normalizedEventSection,
      );
    const score = sectionMatches ? 3 : 2;
    if (!bestMatch || score > bestMatch.score) {
      bestMatch = {
        event,
        scope: entry.scope,
        score,
        matchedBy: {
          title: true,
          section: sectionMatches,
        },
      };
    }
  }

  return bestMatch;
}

type ScopeIndexEntry = {
  scope: CourseScope;
  normalizedTitles: string[];
  sectionCodes: string[];
};

function indexScope(
  scope: CourseScope,
  rowsByCourseId: ReadonlyMap<number, MoodleCourseLike>,
): ScopeIndexEntry {
  const sectionCodes = [
    ...new Set(
      scope.courses.flatMap((course) => [
        ...listSimpleCourseSectionCodes(course),
        ...listCourseSectionCodes(rowsByCourseId.get(course.id)),
      ]),
    ),
  ];
  const rawTitles = scope.courseIds.flatMap((courseId) => {
    const row = rowsByCourseId.get(courseId);
    if (!row) return [];
    return [row.displayname, row.fullname].filter(Boolean);
  });
  const normalizedTitles = [
    ...new Set(
      [
        scope.title,
        extractCourseBaseTitle(scope.title),
        ...rawTitles.map(extractCourseBaseTitle),
      ]
        .map(normalize)
        .filter(Boolean),
    ),
  ];

  return {
    scope,
    normalizedTitles,
    sectionCodes: sectionCodes.map(normalizeSectionCode),
  };
}

function listCourseSectionCodes(course?: MoodleCourseLike) {
  if (!course) return [];

  const sectionCodes = new Set<string>();
  const shortnameMatch = cleanMoodleText(course.shortname)
    .trim()
    .match(
      /_(?:Előadás|Gyakorlat|Lecture):(.+?)(?:\s+\(\d{4}\/\d{2}\/\d\)|\s*$)/i,
    );
  if (shortnameMatch?.[1]) {
    sectionCodes.add(shortnameMatch[1].trim());
  }

  const titleMatch = cleanMoodleText(
    course.displayname || course.fullname,
  ).match(/\b(?:Előadás|Gyakorlat|Lecture)\s*\(([^)]+)\)\s*$/i);
  if (titleMatch?.[1]) {
    sectionCodes.add(titleMatch[1].trim());
  }

  return [...sectionCodes];
}

function listSimpleCourseSectionCodes(course: CourseScope["courses"][number]) {
  return [course.seminarGroup].filter(
    (sectionCode): sectionCode is string => Boolean(sectionCode),
  );
}

function extractEventBaseTitle(summary: string) {
  const cleanedSummary = cleanMoodleText(summary);

  const examMatch = cleanedSummary.match(
    /^(.*?)\s+\((?:Írásbeli|Szóbeli)\)\s+-\s+.+\s+-\s+Vizsga$/i,
  );
  if (examMatch?.[1]) {
    return examMatch[1].trim();
  }

  const deadlineMatch = cleanedSummary.match(
    /^(.*?)\s+-\s+Feladat\s+-\s+Határidő:.*$/i,
  );
  if (deadlineMatch?.[1]) {
    return deadlineMatch[1].trim();
  }

  return cleanedSummary;
}

function extractCourseBaseTitle(title: string) {
  const cleanedTitle = cleanMoodleText(title).replace(
    /\s*\(([A-Z0-9_]{6,})\)/g,
    "",
  );
  const match = cleanedTitle.match(
    /^(.*?)\s+(?:Előadás|Gyakorlat|Lecture)\s*\([^)]+\)\s*$/i,
  );
  return match?.[1]?.trim() || cleanedTitle;
}

function extractEventSection(description?: string) {
  if (!description) return undefined;

  const firstLine = description
    .split(/\n|\\n/)
    .map((part) => cleanMoodleText(part))
    .find(Boolean);

  return firstLine || undefined;
}

function normalize(value: string) {
  return cleanMoodleText(value)
    .replace(/[\u2010-\u2015\u2212]/g, "-")
    .toLocaleLowerCase("hu-HU")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeSectionCode(value: string) {
  return normalize(value).replace(/\s*[-_]\s*/g, "-");
}

function toIsoString(value?: string | Date) {
  if (!value) return undefined;
  if (typeof value === "string") return value;
  return value.toISOString();
}
