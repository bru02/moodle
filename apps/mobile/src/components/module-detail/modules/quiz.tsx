import { MoodleHtml } from "@/components/moodle-html";
import { useWSQuery } from "@/lib/useWSQuery";
import { useAppState } from "@/providers/app-provider";

import {
  FactSection,
  formatAttemptsSummary,
  formatDuration,
  formatFactDate,
  formatStatusLabel,
  getFactRow,
  trimNumber,
} from "../shared";
import type { ModuleDetailProps } from "../types";

type QuizSummary = {
  id: number;
  coursemodule?: number;
  name: string;
  intro?: string;
  grade?: number;
  attempts?: number;
  decimalpoints?: number;
  timelimit?: number;
  timeopen?: number;
  timeclose?: number;
};

type QuizAttempts = {
  attempts: {
    id: number;
    state?: string;
    timestart?: number;
    timefinish?: number;
  }[];
};

type QuizAccessInfo = {
  canattempt?: boolean;
  canpreview?: boolean;
  preventaccessreasons?: string[];
};

type QuizBestGrade = {
  hasgrade?: boolean;
  grade?: number;
  gradetopass?: number;
};

export function QuizDetail({ scope, module }: ModuleDetailProps) {
  const { activeAccount, accountSession, refreshAccountSession } = useAppState();
  const session = activeAccount ? accountSession(activeAccount.id) : null;
  const adapter = activeAccount && session
    ? {
        siteOrigin: activeAccount.origin,
        session,
        refreshSession: async () => await refreshAccountSession(activeAccount.id),
      }
    : null;
  const quizzesQuery = useWSQuery<{ quizzes: QuizSummary[] }>(
    adapter,
    "mod_quiz_get_quizzes_by_courses",
    { courseids: scope.courseIds },
    { enabled: Boolean(adapter) },
  );
  const attemptsQuery = useWSQuery<QuizAttempts>(
    adapter,
    "mod_quiz_get_user_attempts",
    { quizid: module.module.instance, status: "all" },
    { enabled: Boolean(adapter) },
  );
  const accessQuery = useWSQuery<QuizAccessInfo>(
    adapter,
    "mod_quiz_get_quiz_access_information",
    { quizid: module.module.instance },
    { enabled: Boolean(adapter) },
  );
  const bestGradeQuery = useWSQuery<QuizBestGrade>(
    adapter,
    "mod_quiz_get_user_best_grade",
    { quizid: module.module.instance },
    { enabled: Boolean(adapter) },
  );
  const quizzesData = quizzesQuery.data as { quizzes: QuizSummary[] } | undefined;
  const attemptsData = attemptsQuery.data as QuizAttempts | undefined;
  const accessData = accessQuery.data as QuizAccessInfo | undefined;
  const bestGradeData = bestGradeQuery.data as QuizBestGrade | undefined;
  const quiz = quizzesData?.quizzes.find(
    (item: QuizSummary) => item.id === module.module.instance || item.coursemodule === module.module.id,
  );
  const lastAttempt = attemptsData?.attempts.at(-1);
  const rows = [
    getFactRow(
      "Attempts",
      typeof quiz?.attempts === "number"
        ? formatAttemptsSummary(attemptsData?.attempts.length ?? 0, quiz.attempts)
        : String(attemptsData?.attempts.length ?? 0),
    ),
    getFactRow("Last attempt", lastAttempt?.state ? formatStatusLabel(lastAttempt.state) : undefined),
    getFactRow(
      "Best grade",
      bestGradeData?.hasgrade && typeof bestGradeData.grade === "number" ? trimNumber(bestGradeData.grade) : undefined,
    ),
    getFactRow("Pass grade", typeof bestGradeData?.gradetopass === "number" ? trimNumber(bestGradeData.gradetopass) : undefined),
    getFactRow("Can attempt", accessData ? (accessData.canattempt ? "Yes" : "No") : undefined),
    getFactRow("Restriction", accessData?.preventaccessreasons?.[0]),
    getFactRow("Opens", formatFactDate(quiz?.timeopen)),
    getFactRow("Closes", formatFactDate(quiz?.timeclose)),
    getFactRow(
      "Time limit",
      typeof quiz?.timelimit === "number" && quiz.timelimit > 0 ? formatDuration(quiz.timelimit) : undefined,
    ),
  ].filter((item): item is { label: string; value: string } => Boolean(item));

  return (
    <FactSection
      title="Quiz"
      rows={rows}
      description={
        quiz?.intro ? (
          <MoodleHtml html={quiz.intro} baseUrl={module.module.url} contents={module.module.contents} variant="secondary" />
        ) : undefined
      }
      isLoading={quizzesQuery.isLoading || attemptsQuery.isLoading || accessQuery.isLoading || bestGradeQuery.isLoading}
      emptyCopy="Quiz details are only available in Moodle."
    />
  );
}
