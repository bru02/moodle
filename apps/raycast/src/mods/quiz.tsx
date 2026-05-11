import {
  Action,
  ActionPanel,
  Color,
  Form,
  Icon,
  List,
  Toast,
  showToast,
  useNavigation,
} from "@raycast/api";
import { memo, useContext, useMemo, useState } from "react";

import DatesDetail from "../components/DatesDetail";
import {
  OpenInBrowserAction,
  openInBrowserWithAuth,
} from "../components/OpenInBrowserAction";
import CourseContext from "../course-context";
import { formatDurationSeconds, formatRelativeTime } from "../helpers/format";
import { buildGradeAccessoryTextByModuleId } from "../helpers/grades";
import { turndown } from "../helpers/markdown";
import { requestWS, useWSBatchQuery, useWSQuery } from "../hooks/useWSQuery";
import { Module } from "../types";
import type {
  AddonModQuizAttemptWSData,
  AddonModQuizGetQuizAccessInformationWSResponse,
  AddonModQuizQuizWSData,
  AddonModQuizStartAttemptWSParams,
} from "../types/quiz";
import { ModuleListItemShell } from "./module-list-item-shell";

function QuizListItem({ module }: { module: Module }) {
  const ctx = useContext(CourseContext);
  const { scope, activeCourse } = ctx;
  const { data, isPending } = useWSQuery("mod_quiz_get_quizzes_by_courses", {
    courseids: scope.courseIds,
  });
  const { data: gradeTables } = useWSBatchQuery(
    "gradereport_user_get_grades_table",
    scope.courseIds.map((courseid) => ({ courseid, userid: 0 })),
  );
  const { data: attemptsData } = useWSQuery("mod_quiz_get_user_attempts", {
    quizid: module.instance,
    status: "all",
  });
  const gradeTextByModuleId = useMemo(
    () => buildGradeAccessoryTextByModuleId(gradeTables),
    [gradeTables],
  );
  const gradeText = gradeTextByModuleId.get(module.id);

  const currentQuiz = data?.quizzes.find(
    (quiz) => quiz.id === module.instance || quiz.coursemodule === module.id,
  );
  const { data: accessInfo } = useWSQuery(
    "mod_quiz_get_quiz_access_information",
    { quizid: module.instance },
  );

  if (!currentQuiz) {
    return <ModuleListItemShell module={module} course={activeCourse} />;
  }

  return (
    <ModuleListItemShell
      module={module}
      detail={
        <QuizListItemDetail
          quiz={currentQuiz}
          isLoading={isPending}
          module={module}
          attempts={attemptsData?.attempts}
          accessInfo={accessInfo}
        />
      }
      accessories={getQuizAccessories({
        gradeText,
        attempts: attemptsData?.attempts,
        quiz: currentQuiz,
        accessInfo,
      })}
      course={activeCourse}
      primaryAction={
        <StartQuizAction
          module={module}
          quiz={currentQuiz}
          attempts={attemptsData?.attempts}
          accessInfo={accessInfo}
        />
      }
      extraActions={[
        <Action.Push
          key="view-attempts"
          title="View Attempts"
          icon={Icon.List}
          target={
            <CourseContext value={ctx}>
              <QuizAttemptsList module={module} quiz={currentQuiz} />
            </CourseContext>
          }
        />,
      ]}
    />
  );
}

export default memo(QuizListItem);

function StartQuizAction({
  module,
  quiz,
  attempts,
  accessInfo,
}: {
  module: Module;
  quiz: AddonModQuizQuizWSData;
  attempts: AddonModQuizAttemptWSData[] | undefined;
  accessInfo: AddonModQuizGetQuizAccessInformationWSResponse | undefined;
}) {
  const { push } = useNavigation();
  const lastAttempt = useMemo(() => getLastAttempt(attempts), [attempts]);
  const shouldContinueAttempt = isAttemptInProgress(lastAttempt);

  return (
    <Action
      title={shouldContinueAttempt ? "Continue Attempt" : "Start Quiz"}
      icon={Icon.Play}
      onAction={async () => {
        if (shouldContinueAttempt && lastAttempt) {
          await openAttempt(
            module,
            lastAttempt,
            "Opening existing attempt",
            "Attempt opened",
            "Failed to continue attempt",
          );
          return;
        }

        if (!accessInfo) {
          await showToast({
            style: Toast.Style.Failure,
            title: "Quiz access not loaded",
          });
          return;
        }

        const toast = await showToast({
          style: Toast.Style.Animated,
          title: "Checking quiz access",
        });

        if (!accessInfo.canattempt && !accessInfo.canpreview) {
          toast.style = Toast.Style.Failure;
          toast.title = "Quiz not available";
          toast.message =
            accessInfo.preventaccessreasons?.[0] ||
            "You cannot start this quiz yet.";
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
  attempts,
  accessInfo,
}: {
  quiz: AddonModQuizQuizWSData;
  isLoading: boolean;
  module: Module;
  attempts: AddonModQuizAttemptWSData[] | undefined;
  accessInfo: AddonModQuizGetQuizAccessInformationWSResponse | undefined;
}) {
  const { data: bestGradeData } = useWSQuery("mod_quiz_get_user_best_grade", {
    quizid: quiz.id,
  });

  const lastAttempt = useMemo(() => getLastAttempt(attempts), [attempts]);
  const attemptsLimit = formatAttemptsLimit(quiz.attempts);
  const attemptCount = attempts?.length ?? 0;
  const attemptsSummary = attemptsLimit
    ? `${attemptCount} / ${attemptsLimit}`
    : String(attemptCount);

  return (
    <List.Item.Detail
      isLoading={isLoading}
      markdown={turndown(quiz.intro || "")}
      metadata={
        <List.Item.Detail.Metadata>
          <List.Item.Detail.Metadata.Label
            title="Attempts"
            text={attemptsSummary}
          />
          {lastAttempt && (
            <List.Item.Detail.Metadata.Label
              title="Last Attempt"
              text={getAttemptStatusLabelProps(lastAttempt.state)}
            />
          )}
          {lastAttempt?.timefinish ? (
            <List.Item.Detail.Metadata.Label
              title="Finished"
              text={formatRelativeTime(lastAttempt.timefinish)}
            />
          ) : null}
          {bestGradeData?.hasgrade &&
            typeof bestGradeData.grade === "number" && (
              <List.Item.Detail.Metadata.Label
                title="Best Grade"
                text={formatGradeWithTotal(
                  bestGradeData.grade,
                  quiz.grade,
                  quiz.decimalpoints,
                )}
              />
            )}
          {accessInfo && (
            <List.Item.Detail.Metadata.Label
              title="Can Attempt"
              text={accessInfo.canattempt ? "Yes" : "No"}
            />
          )}
          {!accessInfo?.canattempt && accessInfo?.preventaccessreasons?.[0] ? (
            <List.Item.Detail.Metadata.Label
              title="Restriction"
              text={accessInfo.preventaccessreasons[0]}
            />
          ) : null}
          {accessInfo?.activerulenames?.includes(
            "quizaccess_safeexambrowser",
          ) && (
            <List.Item.Detail.Metadata.Label
              title="Safe Exam Browser"
              text="Required"
            />
          )}
          {typeof bestGradeData?.gradetopass === "number" && (
            <List.Item.Detail.Metadata.Label
              title="Pass Grade"
              text={formatGrade(bestGradeData.gradetopass, quiz.decimalpoints)}
            />
          )}
          {typeof quiz.timelimit === "number" && quiz.timelimit > 0 ? (
            <List.Item.Detail.Metadata.Label
              title="Time Limit"
              text={formatTimeLimit(quiz.timelimit)}
            />
          ) : null}
          <DatesDetail module={module} />
        </List.Item.Detail.Metadata>
      }
    />
  );
}

function StartQuizForm({
  module,
  quiz,
}: {
  module: Module;
  quiz: AddonModQuizQuizWSData;
}) {
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
      <Form.PasswordField
        id="password"
        title="Password"
        value={password}
        onChange={setPassword}
      />
    </Form>
  );
}

function QuizAttemptsList({
  module,
  quiz,
}: {
  module: Module;
  quiz: AddonModQuizQuizWSData;
}) {
  const { data, isPending } = useWSQuery("mod_quiz_get_user_attempts", {
    quizid: quiz.id,
    status: "all",
  });

  const attempts = data?.attempts ?? [];

  return (
    <List
      navigationTitle={`${module.name} Attempts`}
      isLoading={isPending}
      isShowingDetail={true}
    >
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

function QuizAttemptDetail({
  attempt,
  quiz,
}: {
  attempt: AddonModQuizAttemptWSData;
  quiz: AddonModQuizQuizWSData;
}) {
  const detail = (
    <List.Item.Detail
      metadata={
        <List.Item.Detail.Metadata>
          <List.Item.Detail.Metadata.Label
            title="State"
            text={getAttemptStatusLabelProps(attempt.state)}
          />
          {typeof attempt.sumgrades === "number" && (
            <List.Item.Detail.Metadata.Label
              title="Score"
              text={formatGradeWithTotal(
                attempt.sumgrades,
                quiz.sumgrades ?? quiz.grade,
                quiz.decimalpoints,
              )}
            />
          )}
          {attempt.timestart ? (
            <List.Item.Detail.Metadata.Label
              title="Started"
              text={formatRelativeTime(attempt.timestart)}
            />
          ) : null}
          {attempt.timefinish ? (
            <List.Item.Detail.Metadata.Label
              title="Finished"
              text={formatRelativeTime(attempt.timefinish)}
            />
          ) : null}
        </List.Item.Detail.Metadata>
      }
    />
  );

  return detail;
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
      text: formatGradeWithTotal(
        attempt.sumgrades,
        quiz.sumgrades ?? quiz.grade,
        quiz.decimalpoints,
      ),
    });
  }
  if (attempt.state) {
    accessories.push({ text: formatAttemptState(attempt.state) });
  }
  return accessories;
}

function getQuizAccessories({
  gradeText,
  attempts,
  quiz,
  accessInfo,
}: {
  gradeText?: string;
  attempts: AddonModQuizAttemptWSData[] | undefined;
  quiz: AddonModQuizQuizWSData;
  accessInfo: AddonModQuizGetQuizAccessInformationWSResponse | undefined;
}): List.Item.Accessory[] {
  if (gradeText) {
    return [{ text: gradeText, tooltip: "Grade" }];
  }

  const lastAttempt = getLastAttempt(attempts);
  if (!lastAttempt?.state) {
    return [
      {
        text: getQuizAvailabilityAccessoryText(quiz, accessInfo),
        tooltip: "Availability",
      },
    ];
  }

  return [
    {
      text: getCompactAttemptState(lastAttempt.state),
      tooltip: "Attempt status",
    },
  ];
}

function getQuizAvailabilityState(
  quiz: Pick<AddonModQuizQuizWSData, "timeopen" | "timeclose">,
  accessInfo?: Pick<
    AddonModQuizGetQuizAccessInformationWSResponse,
    "canattempt" | "canpreview" | "preventaccessreasons"
  >,
  timestamp = Math.floor(Date.now() / 1000),
) {
  if (quiz.timeclose && timestamp > quiz.timeclose) {
    return "closed";
  }

  if (quiz.timeopen && timestamp < quiz.timeopen) {
    return "pending";
  }

  if (
    accessInfo &&
    !accessInfo.canattempt &&
    !accessInfo.canpreview &&
    hasPendingOpenDateRestriction(accessInfo)
  ) {
    return "pending";
  }

  return "open";
}

function getQuizAvailabilityAccessoryText(
  quiz: Pick<AddonModQuizQuizWSData, "timeopen" | "timeclose">,
  accessInfo?: Pick<
    AddonModQuizGetQuizAccessInformationWSResponse,
    "canattempt" | "canpreview" | "preventaccessreasons"
  >,
) {
  switch (getQuizAvailabilityState(quiz, accessInfo)) {
    case "closed":
      return { value: "Closed", color: Color.Red };
    case "pending":
      return { value: "Pending", color: Color.Orange };
    case "open":
    default:
      return { value: "Open", color: Color.Blue };
  }
}

function hasPendingOpenDateRestriction(
  accessInfo: Pick<
    AddonModQuizGetQuizAccessInformationWSResponse,
    "preventaccessreasons"
  >,
) {
  return accessInfo.preventaccessreasons.some((reason) =>
    /not open|not available yet|not available until|available from|opens?/i.test(
      reason,
    ),
  );
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

function formatGradeWithTotal(
  grade: number,
  total?: number | null,
  decimals?: number,
) {
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

function getLastAttempt(attempts: AddonModQuizAttemptWSData[] | undefined) {
  const list = attempts ?? [];
  if (list.length === 0) return undefined;

  return [...list].sort(
    (a, b) =>
      (b.timemodified ?? b.timestart ?? 0) -
      (a.timemodified ?? a.timestart ?? 0),
  )[0];
}

function isAttemptInProgress(attempt: AddonModQuizAttemptWSData | undefined) {
  return attempt?.state === "inprogress";
}

function getCompactAttemptState(state: string) {
  switch (state) {
    case "finished":
      return { value: "Done", color: Color.Green };
    case "inprogress":
      return { value: "Live", color: Color.Blue };
    case "overdue":
      return { value: "Late", color: Color.Orange };
    case "abandoned":
      return { value: "Drop", color: Color.Red };
    default:
      return { value: "Open" };
  }
}

async function startAttemptAndOpen(
  module: Module,
  quiz: AddonModQuizQuizWSData,
  password?: string,
) {
  try {
    const attempt = await startQuizAttempt(quiz.id, password);
    await openAttempt(
      module,
      attempt,
      "Starting quiz attempt",
      "Quiz started",
      "Failed to start quiz",
    );
  } catch (error) {
    await showToast({
      style: Toast.Style.Failure,
      title: "Failed to start quiz",
      message: getErrorMessage(error),
    });
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

async function openAttempt(
  module: Module,
  attempt: AddonModQuizAttemptWSData,
  loadingTitle: string,
  successTitle: string,
  failureTitle: string,
) {
  const toast = await showToast({
    style: Toast.Style.Animated,
    title: loadingTitle,
  });

  try {
    if (!module.url) {
      throw new Error("Quiz URL not available");
    }

    const attemptUrl = buildAttemptUrl(module.url, module.id, attempt.id);
    if (!attemptUrl) {
      throw new Error("Quiz URL not available");
    }

    await openInBrowserWithAuth(attemptUrl);
    toast.style = Toast.Style.Success;
    toast.title = successTitle;
  } catch (error) {
    toast.style = Toast.Style.Failure;
    toast.title = failureTitle;
    toast.message = getErrorMessage(error);
  }
}

function requiresPassword(
  accessInfo: AddonModQuizGetQuizAccessInformationWSResponse,
) {
  return (
    accessInfo.accessrules?.includes("quizaccess_password") ||
    accessInfo.activerulenames?.includes("quizaccess_password")
  );
}

function buildAttemptUrl(
  moduleUrl: string | undefined,
  cmid: number,
  attemptId: number,
) {
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
