import type { CoreCourseGetContentsWSResponse } from "./course-content-types";
import { buildScopedSections } from "./course-content";
import type { CourseScope } from "./course-types";
import type { ScopedModule } from "./course-content-types";
import type { SimpleCourse } from "./course-types";
import type {
  MoodleTaskProjection,
  TaskAssignmentSource,
  TaskAttendanceSource,
  TaskItem,
  TaskQuizSource,
} from "./moodle-types";
import { cleanMoodleText } from "./utils";

const DEFAULT_REVIEW_WINDOW_SECONDS = 7 * 24 * 60 * 60;

export type TaskProjectionInput = {
  now?: number;
  reviewWindowSeconds?: number;
  coursesById?: ReadonlyMap<number, SimpleCourse>;
  assignments?: readonly TaskAssignmentSource[];
  quizzes?: readonly TaskQuizSource[];
  attendance?: readonly TaskAttendanceSource[];
  modules?: readonly ScopedModule[];
};

export function buildTaskProjection(input: TaskProjectionInput): MoodleTaskProjection {
  const now = input.now ?? Math.floor(Date.now() / 1000);
  const reviewWindowSeconds = input.reviewWindowSeconds ?? DEFAULT_REVIEW_WINDOW_SECONDS;
  const actionable: TaskItem[] = [];
  const recentReview: TaskItem[] = [];

  for (const assignment of input.assignments ?? []) {
    const projected = projectAssignmentTask(assignment, input.coursesById, now);
    pushProjectedTask(projected, now, reviewWindowSeconds, actionable, recentReview);
  }

  for (const quiz of input.quizzes ?? []) {
    const projected = projectQuizTask(quiz, input.coursesById, now);
    pushProjectedTask(projected, now, reviewWindowSeconds, actionable, recentReview);
  }

  for (const attendance of input.attendance ?? []) {
    const projected = projectAttendanceTask(attendance, input.coursesById, now);
    pushProjectedTask(projected, now, reviewWindowSeconds, actionable, recentReview);
  }

  for (const module of input.modules ?? []) {
    const projected = projectModuleTask(module, input.coursesById, now);
    pushProjectedTask(projected, now, reviewWindowSeconds, actionable, recentReview);
  }

  actionable.sort((left, right) => compareActionableTasks(left, right, now));
  recentReview.sort(compareRecentReviewTasks);

  return { actionable, recentReview };
}

export const listTasks = buildTaskProjection;

type MoodleWSRequester = <T>(service: string, requestParams?: Record<string, unknown>) => Promise<T>;

export type MoodleAssignmentsResponse = {
  courses: Array<{
    id: number;
    assignments: Array<{
      id: number;
      cmid: number;
      course: number;
      name: string;
      duedate: number;
      allowsubmissionsfromdate: number;
      cutoffdate: number;
      gradingduedate?: number;
      timemodified: number;
    }>;
  }>;
};

export type MoodleAssignmentStatusResponse = {
  lastattempt?: {
    submission?: {
      status?: string;
      timecreated?: number;
      timemodified?: number;
    };
    teamsubmission?: {
      status?: string;
      timecreated?: number;
      timemodified?: number;
    };
  };
  feedback?: {
    gradeddate?: number;
    gradefordisplay?: string;
  };
};

export type MoodleQuizzesResponse = {
  quizzes: Array<{
    id: number;
    coursemodule: number;
    course: number;
    name: string;
    timeopen?: number;
    timeclose?: number;
    timemodified?: number;
  }>;
};

export type MoodleQuizAttemptResponse = {
  attempts: Array<{
    id: number;
    state?: string;
    timestart?: number;
    timefinish?: number;
    timemodified?: number;
  }>;
};

export type MoodleAttendanceTodayResponse = Array<{
  shortname: string;
  fullname: string;
  attendance_instances:
    | Array<{
        name: string;
        today_sessions: Array<{
          id: number;
          attendanceid: number;
          sessdate: number;
          duration: number;
        }>;
      }>
    | Record<
        string,
        {
          name: string;
          today_sessions: Array<{
            id: number;
            attendanceid: number;
            sessdate: number;
            duration: number;
          }>;
        }
      >;
}>;

export async function fetchTaskProjectionData(input: {
  requestWS: MoodleWSRequester;
  siteOrigin: string;
  courses: readonly SimpleCourse[];
  scopes: readonly CourseScope[];
  scopeContentRowsByScope: ReadonlyMap<string, readonly (CoreCourseGetContentsWSResponse | undefined)[]>;
}) {
  const courseIds = input.scopes.flatMap((scope) => scope.courseIds);
  const [assignmentsResponse, quizzesResponse, attendanceResponse] = await Promise.all([
    input.requestWS<MoodleAssignmentsResponse>("mod_assign_get_assignments", {
      courseids: courseIds,
    }),
    input.requestWS<MoodleQuizzesResponse>("mod_quiz_get_quizzes_by_courses", {
      courseids: courseIds,
    }),
    input
      .requestWS<MoodleAttendanceTodayResponse>("mod_attendance_get_courses_with_today_sessions", {
        userid: 0,
      })
      .catch(() => []),
  ]);

  const assignmentStatuses = new Map<number, MoodleAssignmentStatusResponse>();
  await Promise.all(
    assignmentsResponse.courses
      .flatMap((course) => course.assignments)
      .map(async (assignment) => {
        const response = await input
          .requestWS<MoodleAssignmentStatusResponse>("mod_assign_get_submission_status", {
            assignid: assignment.id,
          })
          .catch(() => null);

        if (response) {
          assignmentStatuses.set(assignment.id, response);
        }
      }),
  );

  const quizAttempts = new Map<number, MoodleQuizAttemptResponse>();
  await Promise.all(
    quizzesResponse.quizzes.map(async (quiz) => {
      const response = await input
        .requestWS<MoodleQuizAttemptResponse>("mod_quiz_get_user_attempts", {
          quizid: quiz.id,
          status: "all",
        })
        .catch(() => null);

      if (response) {
        quizAttempts.set(quiz.id, response);
      }
    }),
  );

  const coursesById = new Map<number, SimpleCourse>();
  for (const scope of input.scopes) {
    for (const courseId of scope.courseIds) {
      coursesById.set(courseId, { ...scope.mergedCourse, id: courseId });
    }
  }

  return buildTaskProjection({
    coursesById,
    assignments: assignmentsResponse.courses.flatMap((course) =>
      course.assignments.map((assignment) => {
        const submissionStatus = assignmentStatuses.get(assignment.id);
        const submission = submissionStatus?.lastattempt?.teamsubmission ?? submissionStatus?.lastattempt?.submission;

        return {
          id: assignment.id,
          courseId: assignment.course,
          name: assignment.name,
          openAt: positiveTimestamp(assignment.allowsubmissionsfromdate),
          dueAt: positiveTimestamp(assignment.duedate),
          closeAt: positiveTimestamp(assignment.cutoffdate),
          gradingDueAt: positiveTimestamp(assignment.gradingduedate),
          submittedAt:
            submission?.status === "submitted"
              ? maxDefined(submission.timecreated, submission.timemodified)
              : undefined,
          gradedAt: positiveTimestamp(submissionStatus?.feedback?.gradeddate),
          updatedAt: positiveTimestamp(assignment.timemodified),
          url: `${input.siteOrigin}/mod/assign/view.php?id=${assignment.cmid}`,
        };
      }),
    ),
    quizzes: quizzesResponse.quizzes.map((quiz) => {
      const attempts = quizAttempts.get(quiz.id)?.attempts ?? [];
      const completedAttempt = attempts.find((attempt) => attempt.timefinish);

      return {
        id: quiz.id,
        courseId: quiz.course,
        name: quiz.name,
        openAt: positiveTimestamp(quiz.timeopen),
        closeAt: positiveTimestamp(quiz.timeclose),
        submittedAt: positiveTimestamp(completedAttempt?.timefinish),
        gradedAt: undefined,
        updatedAt: positiveTimestamp(quiz.timemodified),
        url: `${input.siteOrigin}/mod/quiz/view.php?id=${quiz.coursemodule}`,
      };
    }),
    attendance: attendanceResponse.flatMap((course) =>
      normalizeAttendanceInstances(course.attendance_instances).flatMap((instance) =>
        instance.today_sessions.map((session) => {
          const matchedCourse = matchAttendanceCourse(input.courses, course.fullname, course.shortname);

          return {
            id: session.id,
            courseId: matchedCourse?.id ?? input.courses[0]?.id ?? 0,
            name: instance.name,
            sessionAt: session.sessdate,
            closeAt: session.duration ? session.sessdate + session.duration : undefined,
          };
        }),
      ),
    ),
    modules: input.scopes.flatMap((scope) =>
      buildScopedSections(scope, input.scopeContentRowsByScope.get(scope.id) ?? []).flatMap((section) => section.modules),
    ),
  });
}

function positiveTimestamp(value?: number) {
  return typeof value === "number" && value > 0 ? value : undefined;
}

function normalizeAttendanceInstances(input: MoodleAttendanceTodayResponse[number]["attendance_instances"]) {
  return Array.isArray(input) ? input : Object.values(input);
}

function matchAttendanceCourse(courses: readonly SimpleCourse[], fullname?: string, shortname?: string) {
  const values = [fullname, shortname]
    .filter((value): value is string => Boolean(value))
    .map((value) => value.toLowerCase().replace(/\s+/g, " ").trim());

  return courses.find((course) => values.some((value) => course.displayname.toLowerCase().includes(value)));
}

function projectAssignmentTask(
  source: TaskAssignmentSource,
  coursesById: ReadonlyMap<number, SimpleCourse> | undefined,
  now: number,
): TaskItem | null {
  const course = resolveCourse(coursesById, source.courseId);
  const completionAt = maxDefined(source.submittedAt, source.gradedAt);
  const deadline = earliestDefined(source.openAt, source.dueAt, source.closeAt, source.gradingDueAt);
  const sortTimestamp = nextRelevantTimestamp([source.openAt, source.dueAt, source.closeAt, source.gradingDueAt], now);

  if (!deadline && !completionAt) {
    return null;
  }

  return {
    id: `assignment:${source.id}`,
    kind: "assignment",
    title: cleanMoodleText(source.name),
    courseId: source.courseId,
    courseTitle: cleanMoodleText(course.displayname),
    semester: course.semester,
    url: source.url,
    openAt: source.openAt,
    dueAt: source.dueAt ?? source.gradingDueAt,
    closeAt: source.closeAt,
    reviewAt: completionAt,
    updatedAt: source.updatedAt,
    sortTimestamp: sortTimestamp ?? completionAt ?? source.updatedAt ?? now,
    completed: completionAt != null,
    actionLabel: completionAt ? "Review submission" : "Submit assignment",
  };
}

function projectQuizTask(
  source: TaskQuizSource,
  coursesById: ReadonlyMap<number, SimpleCourse> | undefined,
  now: number,
): TaskItem | null {
  const course = resolveCourse(coursesById, source.courseId);
  const completionAt = maxDefined(source.submittedAt, source.gradedAt);
  const hasWindow = source.openAt != null || source.closeAt != null;
  if (!hasWindow && !completionAt) {
    return null;
  }

  return {
    id: `quiz:${source.id}`,
    kind: "quiz",
    title: cleanMoodleText(source.name),
    courseId: source.courseId,
    courseTitle: cleanMoodleText(course.displayname),
    semester: course.semester,
    url: source.url,
    openAt: source.openAt,
    closeAt: source.closeAt,
    reviewAt: completionAt,
    updatedAt: source.updatedAt,
    sortTimestamp: nextRelevantTimestamp([source.openAt, source.closeAt], now) ?? completionAt ?? source.updatedAt ?? now,
    completed: completionAt != null,
    actionLabel: completionAt ? "Review attempt" : "Take quiz",
  };
}

function projectAttendanceTask(
  source: TaskAttendanceSource,
  coursesById: ReadonlyMap<number, SimpleCourse> | undefined,
  now: number,
): TaskItem | null {
  const course = resolveCourse(coursesById, source.courseId);
  const completionAt = source.attendedAt;
  const closeAt = source.closeAt ?? source.sessionAt;
  const hasActionWindow = closeAt >= now || source.sessionAt >= now;

  if (!hasActionWindow && !completionAt) {
    return null;
  }

  return {
    id: `attendance:${source.id}`,
    kind: "attendance",
    title: cleanMoodleText(source.name),
    courseId: source.courseId,
    courseTitle: cleanMoodleText(course.displayname),
    semester: course.semester,
    url: source.url,
    openAt: source.sessionAt,
    closeAt,
    reviewAt: completionAt,
    updatedAt: source.updatedAt,
    sortTimestamp: nextRelevantTimestamp([source.sessionAt, closeAt], now) ?? completionAt ?? source.updatedAt ?? now,
    completed: completionAt != null,
    actionLabel: completionAt ? "Review attendance" : "Mark attendance",
  };
}

function projectModuleTask(
  source: ScopedModule,
  coursesById: ReadonlyMap<number, SimpleCourse> | undefined,
  now: number,
): TaskItem | null {
  const course = coursesById?.get(source.course.id) ?? source.course;
  const closeAt = source.module.dates?.find((date) => date.dataid === "timeclose")?.timestamp;
  const completionAt = source.module.completiondata?.timecompleted;
  const incomplete = source.module.completiondata?.state == null || source.module.completiondata.state === 0;
  const hasAction = closeAt != null && incomplete;

  if (!hasAction && completionAt == null) {
    return null;
  }

  return {
    id: `module:${source.id}`,
    kind: "module",
    title: cleanMoodleText(source.module.name),
    courseId: course.id,
    courseTitle: cleanMoodleText(course.displayname),
    semester: course.semester,
    url: source.module.url,
    subtitle: cleanMoodleText(source.sectionName),
    closeAt,
    reviewAt: completionAt,
    updatedAt: source.module.contentsinfo?.lastmodified ?? completionAt,
    sortTimestamp: nextRelevantTimestamp([closeAt], now) ?? completionAt ?? source.module.contentsinfo?.lastmodified ?? now,
    completed: completionAt != null && !incomplete,
    actionLabel: completionAt ? "Review material" : "Open module",
  };
}

function pushProjectedTask(task: TaskItem | null, now: number, reviewWindowSeconds: number, actionable: TaskItem[], recentReview: TaskItem[]) {
  if (!task) return;

  const shouldReview = task.reviewAt != null && now - task.reviewAt <= reviewWindowSeconds;
  const actionableTask = task.completed ? null : task;

  if (actionableTask) {
    actionable.push(actionableTask);
  }

  if (shouldReview) {
    recentReview.push(task);
  }
}

function compareActionableTasks(left: TaskItem, right: TaskItem, now: number) {
  const leftFuture = left.sortTimestamp >= now;
  const rightFuture = right.sortTimestamp >= now;

  if (leftFuture !== rightFuture) {
    return leftFuture ? 1 : -1;
  }

  if (!leftFuture && !rightFuture && left.sortTimestamp !== right.sortTimestamp) {
    return right.sortTimestamp - left.sortTimestamp;
  }

  if (left.sortTimestamp !== right.sortTimestamp) {
    return left.sortTimestamp - right.sortTimestamp;
  }

  if (left.courseTitle !== right.courseTitle) {
    return left.courseTitle.localeCompare(right.courseTitle);
  }

  return left.title.localeCompare(right.title);
}

function compareRecentReviewTasks(left: TaskItem, right: TaskItem) {
  if (left.reviewAt !== right.reviewAt) {
    return (right.reviewAt ?? 0) - (left.reviewAt ?? 0);
  }

  return left.title.localeCompare(right.title);
}

function nextRelevantTimestamp(values: readonly (number | undefined)[], now: number) {
  const future = values.filter((value): value is number => typeof value === "number" && value >= now);
  if (future.length > 0) {
    return Math.min(...future);
  }

  const past = values.filter((value): value is number => typeof value === "number" && value > 0);
  if (past.length > 0) {
    return Math.max(...past);
  }

  return undefined;
}

function earliestDefined(...values: readonly (number | undefined)[]) {
  const defined = values.filter((value): value is number => typeof value === "number" && value > 0);
  return defined.length > 0 ? Math.min(...defined) : undefined;
}

function maxDefined(...values: readonly (number | undefined)[]) {
  const defined = values.filter((value): value is number => typeof value === "number" && value > 0);
  return defined.length > 0 ? Math.max(...defined) : undefined;
}

function resolveCourse(coursesById: ReadonlyMap<number, SimpleCourse> | undefined, courseId: number) {
  return coursesById?.get(courseId) ?? {
    id: courseId,
    displayname: `Course ${courseId}`,
    courseimage: "",
    timemodified: 0,
  };
}

export type { TaskItem };
