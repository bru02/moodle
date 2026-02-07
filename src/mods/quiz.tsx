import { Action, ActionPanel, Color, Form, Icon, List, Toast, showToast, useNavigation } from "@raycast/api";
import { memo, useContext, useMemo, useState } from "react";
import CompletionAction from "../components/CompletionAction";
import DatesDetail from "../components/DatesDetail";
import { OpenInBrowserAction, openInBrowserWithAuth } from "../components/OpenInBrowserAction";
import { HiddenItemActionsSection } from "../components/WithHiddenItems";
import CourseContext from "../course-context";
import { formatDurationSeconds, formatRelativeTime } from "../helpers/format";
import { turndown } from "../helpers/markdown";
import { requestWS, useWSQuery } from "../hooks/useWSQuery";
import { Module } from "../types";
import type {
  AddonModQuizAttemptWSData,
  AddonModQuizGetQuizAccessInformationWSResponse,
  AddonModQuizQuizWSData,
  AddonModQuizStartAttemptWSParams,
} from "../types/quiz";
import DefaultListItem from "./default";

function QuizListItem({ module }: { module: Module }) {
  const course = useContext(CourseContext);
  const { data, isPending } = useWSQuery("mod_quiz_get_quizzes_by_courses", { "courseids[0]": Number(course.id) });

  const currentQuiz = data?.quizzes.find((quiz) => quiz.id === module.instance || quiz.coursemodule === module.id);

  if (!currentQuiz) {
    return <DefaultListItem module={module} />;
  }

  return (
    <DefaultListItem
      module={module}
      detail={<QuizListItemDetail quiz={currentQuiz} isLoading={isPending} module={module} />}
      actions={
        <ActionPanel>
          <StartQuizAction module={module} quiz={currentQuiz} />
          <Action.Push
            title="View Attempts"
            target={
              <CourseContext value={course}>
                <QuizAttemptsList module={module} quiz={currentQuiz} />
              </CourseContext>
            }
          />
          <OpenInBrowserAction url={module.url!} />
          <CompletionAction module={module} course={course} />
          <HiddenItemActionsSection item={module} />
        </ActionPanel>
      }
    />
  );
}

export default memo(QuizListItem);

function StartQuizAction({ module, quiz }: { module: Module; quiz: AddonModQuizQuizWSData }) {
  const { push } = useNavigation();
  const { data: accessInfo } = useWSQuery("mod_quiz_get_quiz_access_information", { quizid: quiz.id });

  return (
    <Action
      title="Start Quiz"
      icon={Icon.Play}
      onAction={async () => {
        if (!accessInfo) {
          await showToast({ style: Toast.Style.Failure, title: "Quiz access not loaded" });
          return;
        }
        const toast = await showToast({ style: Toast.Style.Animated, title: "Checking quiz access" });

        if (!accessInfo.canattempt && !accessInfo.canpreview) {
          toast.style = Toast.Style.Failure;
          toast.title = "Quiz not available";
          toast.message = accessInfo.preventaccessreasons?.[0] || "You cannot start this quiz yet.";
          return;
        }

        const needsPassword = requiresPassword(accessInfo);
        if (needsPassword) {
          await toast.hide();
          push(<StartQuizForm module={module} quiz={quiz} />);
          return;
        }

        await toast.hide();
        await startAttemptAndOpen(module, quiz);
      }}
    />
  );
}

function QuizListItemDetail({
  quiz,
  isLoading,
  module,
}: {
  quiz: AddonModQuizQuizWSData;
  isLoading: boolean;
  module: Module;
}) {
  const { data: bestGradeData } = useWSQuery("mod_quiz_get_user_best_grade", { quizid: quiz.id });

  const { data: accessInfo } = useWSQuery("mod_quiz_get_quiz_access_information", { quizid: quiz.id });

  const { data: attemptsData } = useWSQuery("mod_quiz_get_user_attempts", {
    quizid: quiz.id,
    status: "all",
  });

  const attempts = attemptsData?.attempts;
  const lastAttempt = useMemo(() => pickLastAttempt(attempts ?? []), [attempts]);

  const attemptsLimit = formatAttemptsLimit(quiz.attempts);
  const attemptCount = attempts?.length ?? 0;
  const attemptsSummary = attemptsLimit ? `${attemptCount} / ${attemptsLimit}` : String(attemptCount);

  const detail = (
    <List.Item.Detail
      isLoading={isLoading}
      markdown={turndown(quiz.intro || "")}
      metadata={
        <List.Item.Detail.Metadata>
          <List.Item.Detail.Metadata.Label title="Attempts" text={attemptsSummary} />
          {lastAttempt && (
            <List.Item.Detail.Metadata.Label
              title="Last Attempt"
              text={getAttemptStatusLabelProps(lastAttempt.state)}
            />
          )}
          {lastAttempt?.timefinish ? (
            <List.Item.Detail.Metadata.Label title="Finished" text={formatRelativeTime(lastAttempt.timefinish)} />
          ) : null}
          {bestGradeData?.hasgrade && typeof bestGradeData.grade === "number" && (
            <List.Item.Detail.Metadata.Label
              title="Best Grade"
              text={formatGradeWithTotal(bestGradeData.grade, quiz.grade, quiz.decimalpoints)}
            />
          )}
          {accessInfo && (
            <List.Item.Detail.Metadata.Label title="Can Attempt" text={accessInfo.canattempt ? "Yes" : "No"} />
          )}
          {!accessInfo?.canattempt && accessInfo?.preventaccessreasons?.[0] && (
            <List.Item.Detail.Metadata.Label title="Restriction" text={accessInfo.preventaccessreasons[0]} />
          )}
          {accessInfo?.activerulenames?.includes("quizaccess_safeexambrowser") && (
            <List.Item.Detail.Metadata.Label title="Safe Exam Browser" text="Required" />
          )}
          {typeof bestGradeData?.gradetopass === "number" && (
            <List.Item.Detail.Metadata.Label
              title="Pass Grade"
              text={formatGrade(bestGradeData.gradetopass, quiz.decimalpoints)}
            />
          )}
          {quiz.timelimit && quiz.timelimit > 0 && (
            <List.Item.Detail.Metadata.Label title="Time Limit" text={formatTimeLimit(quiz.timelimit)} />
          )}
          <DatesDetail module={module} />
        </List.Item.Detail.Metadata>
      }
    />
  );

  return detail;
}

function StartQuizForm({ module, quiz }: { module: Module; quiz: AddonModQuizQuizWSData }) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [password, setPassword] = useState("");
  const { pop } = useNavigation();

  return (
    <Form
      isLoading={isSubmitting}
      navigationTitle={`Start ${module.name}`}
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title="Start Attempt"
            onSubmit={async () => {
              setIsSubmitting(true);
              try {
                await startAttemptAndOpen(module, quiz, password);
                pop();
              } finally {
                setIsSubmitting(false);
              }
            }}
          />
        </ActionPanel>
      }
    >
      <Form.PasswordField id="password" title="Password" value={password} onChange={setPassword} />
    </Form>
  );
}

function QuizAttemptsList({ module, quiz }: { module: Module; quiz: AddonModQuizQuizWSData }) {
  const { data, isPending } = useWSQuery("mod_quiz_get_user_attempts", {
    quizid: quiz.id,
    status: "all",
  });

  const attempts = data?.attempts ?? [];

  return (
    <List navigationTitle={`${module.name} Attempts`} isLoading={isPending} isShowingDetail={true}>
      {attempts.map((attempt, index) => (
        <List.Item
          key={attempt.id}
          title={formatAttemptTitle(attempt, index)}
          subtitle={formatAttemptState(attempt.state)}
          accessories={getAttemptAccessories(attempt, quiz)}
          detail={<QuizAttemptDetail attempt={attempt} quiz={quiz} />}
          actions={
            <ActionPanel>
              <OpenInBrowserAction url={module.url!} />
            </ActionPanel>
          }
        />
      ))}
    </List>
  );
}

function QuizAttemptDetail({ attempt, quiz }: { attempt: AddonModQuizAttemptWSData; quiz: AddonModQuizQuizWSData }) {
  const detail = (
    <List.Item.Detail
      metadata={
        <List.Item.Detail.Metadata>
          <List.Item.Detail.Metadata.Label title="State" text={getAttemptStatusLabelProps(attempt.state)} />
          {typeof attempt.sumgrades === "number" && (
            <List.Item.Detail.Metadata.Label
              title="Score"
              text={formatGradeWithTotal(attempt.sumgrades, quiz.sumgrades ?? quiz.grade, quiz.decimalpoints)}
            />
          )}
          {attempt.timestart ? (
            <List.Item.Detail.Metadata.Label title="Started" text={formatRelativeTime(attempt.timestart)} />
          ) : null}
          {attempt.timefinish ? (
            <List.Item.Detail.Metadata.Label title="Finished" text={formatRelativeTime(attempt.timefinish)} />
          ) : null}
        </List.Item.Detail.Metadata>
      }
    />
  );

  return detail;
}

function formatTimeLimit(seconds: number) {
  return formatDurationSeconds(seconds);
}

function formatAttemptsLimit(limit?: number) {
  if (limit === undefined || limit === null) {
    return undefined;
  }
  if (limit === 0 || limit === -1) {
    return "∞";
  }
  return String(limit);
}

function formatAttemptTitle(attempt: AddonModQuizAttemptWSData, index: number) {
  const attemptNumber = attempt.attempt ?? index + 1;
  return `Attempt ${attemptNumber}`;
}

function formatAttemptState(state?: string) {
  return getAttemptStatusLabelProps(state).value;
}

function getAttemptStatusLabelProps(state?: string) {
  switch (state) {
    case "finished":
      return { value: "Finished", color: Color.Green };
    case "inprogress":
      return { value: "In progress", color: Color.Blue };
    case "overdue":
      return { value: "Overdue", color: Color.Orange };
    case "abandoned":
      return { value: "Abandoned", color: Color.Red };
    default:
      return { value: state ?? "Unknown" };
  }
}

function getAttemptAccessories(
  attempt: AddonModQuizAttemptWSData,
  quiz: AddonModQuizQuizWSData,
): List.Item.Accessory[] {
  const accessories: List.Item.Accessory[] = [];
  if (typeof attempt.sumgrades === "number") {
    accessories.push({
      text: formatGradeWithTotal(attempt.sumgrades, quiz.sumgrades ?? quiz.grade, quiz.decimalpoints),
    });
  }
  if (attempt.state) {
    accessories.push({ text: formatAttemptState(attempt.state) });
  }
  return accessories;
}

function formatGradeWithTotal(grade: number, total?: number | null, decimals?: number) {
  const formattedGrade = formatGrade(grade, decimals);
  if (typeof total !== "number") {
    return formattedGrade;
  }
  return `${formattedGrade} / ${formatGrade(total, decimals)}`;
}

function formatGrade(grade: number, decimals?: number) {
  if (!Number.isFinite(grade)) {
    return "-";
  }
  if (typeof decimals === "number" && decimals >= 0) {
    return grade.toFixed(decimals);
  }
  return grade.toString();
}

function pickLastAttempt(attempts: AddonModQuizAttemptWSData[]) {
  if (!attempts.length) return undefined;
  return [...attempts].sort((a, b) => (b.timemodified ?? b.timestart ?? 0) - (a.timemodified ?? a.timestart ?? 0))[0];
}

async function startAttemptAndOpen(module: Module, quiz: AddonModQuizQuizWSData, password?: string) {
  const toast = await showToast({ style: Toast.Style.Animated, title: "Starting quiz attempt" });

  try {
    if (!module.url) {
      throw new Error("Quiz URL not available");
    }
    const attempt = await startQuizAttempt(quiz.id, password);
    const attemptUrl = buildAttemptUrl(module.url, module.id, attempt.id);
    if (!attemptUrl) {
      throw new Error("Quiz URL not available");
    }
    await openInBrowserWithAuth(attemptUrl);
    toast.style = Toast.Style.Success;
    toast.title = "Quiz started";
  } catch (error) {
    toast.style = Toast.Style.Failure;
    toast.title = "Failed to start quiz";
    toast.message = getErrorMessage(error);
  }
}

async function startQuizAttempt(quizId: number, password?: string) {
  const params: AddonModQuizStartAttemptWSParams = { quizid: quizId };
  if (password) {
    params["preflightdata[0][name]"] = "quizpassword";
    params["preflightdata[0][value]"] = password;
  }

  const response = await requestWS("mod_quiz_start_attempt", params);
  return response.attempt;
}

function requiresPassword(accessInfo: AddonModQuizGetQuizAccessInformationWSResponse) {
  return (
    accessInfo.accessrules?.includes("quizaccess_password") ||
    accessInfo.activerulenames?.includes("quizaccess_password")
  );
}

function buildAttemptUrl(moduleUrl: string | undefined, cmid: number, attemptId: number) {
  if (!moduleUrl) return null;
  const url = new URL(moduleUrl);
  url.pathname = url.pathname.replace(/view\.php$/, "attempt.php");
  url.searchParams.delete("id");
  url.searchParams.set("attempt", String(attemptId));
  url.searchParams.set("cmid", String(cmid));
  url.searchParams.set("page", "0");
  return url.toString();
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "string") {
    return error;
  }
  return "Unexpected error";
}
