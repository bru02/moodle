import { Text, View } from "react-native";

import { MoodleHtml } from "@/components/moodle-html";
import { StatPill } from "@/components/native-ui";
import { platformColors } from "@/constants/platform-colors";
import { useWSQuery } from "@/lib/useWSQuery";

import {
  compactFactRows,
  formatAttemptsSummary,
  formatDuration,
  formatFactDate,
  formatStatusLabel,
  getFactRow,
  trimNumber,
  useModuleDetailAdapter,
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
  const { adapter } = useModuleDetailAdapter();
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
  const secondaryFacts = compactFactRows(
    getFactRow("Pass grade", typeof bestGradeData?.gradetopass === "number" ? trimNumber(bestGradeData.gradetopass) : undefined),
    getFactRow("Can attempt", accessData ? (accessData.canattempt ? "Yes" : "No") : undefined),
    getFactRow("Restriction", accessData?.preventaccessreasons?.[0]),
    getFactRow("Opens", formatFactDate(quiz?.timeopen)),
    getFactRow("Closes", formatFactDate(quiz?.timeclose)),
    getFactRow(
      "Time limit",
      typeof quiz?.timelimit === "number" && quiz.timelimit > 0 ? formatDuration(quiz.timelimit) : undefined,
    ),
  );

  return (
    <View style={{ gap: 14 }}>
      {(quizzesQuery.isLoading || attemptsQuery.isLoading || accessQuery.isLoading || bestGradeQuery.isLoading) && !quiz && !attemptsData ? (
        <Text selectable style={{ fontSize: 14, lineHeight: 21, color: platformColors.secondaryLabel }}>
          Loading…
        </Text>
      ) : (
        <>
          <View style={{ flexDirection: "row", gap: 12, flexWrap: "wrap" }}>
            {bestGradeData?.hasgrade && typeof bestGradeData.grade === "number" ? (
              <StatPill
                label="Best grade"
                value={trimNumber(bestGradeData.grade)}
                tint={typeof bestGradeData.gradetopass === "number" && bestGradeData.grade >= bestGradeData.gradetopass ? "#34C759" : undefined}
              />
            ) : attemptsData ? (
              <StatPill label="Best grade" value="No grade" />
            ) : null}
            {typeof quiz?.attempts === "number" ? (
              <StatPill label="Attempts" value={formatAttemptsSummary(attemptsData?.attempts.length ?? 0, quiz.attempts)} />
            ) : attemptsData ? (
              <StatPill label="Attempts" value={String(attemptsData.attempts.length)} />
            ) : null}
            {lastAttempt?.state ? (
              <StatPill label="Last attempt" value={formatStatusLabel(lastAttempt.state)} />
            ) : null}
          </View>

          {secondaryFacts.length > 0 ? (
            <View style={{ gap: 6 }}>
              {secondaryFacts.map((fact) => (
                <Text key={fact.label} selectable style={{ fontSize: 14, lineHeight: 20, color: platformColors.secondaryLabel }}>
                  <Text style={{ fontWeight: "600" }}>{fact.label}</Text>
                  {"  "}
                  {fact.value}
                </Text>
              ))}
            </View>
          ) : null}
        </>
      )}

      {quiz?.intro ? (
        <MoodleHtml html={quiz.intro} baseUrl={module.module.url} contents={module.module.contents} variant="secondary" />
      ) : !quiz && !quizzesQuery.isLoading ? (
        <Text selectable style={{ fontSize: 14, lineHeight: 21, color: platformColors.secondaryLabel }}>
          Quiz details are only available in Moodle.
        </Text>
      ) : null}
    </View>
  );
}
