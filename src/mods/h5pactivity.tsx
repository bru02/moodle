import { Action, ActionPanel, Color, Icon, List } from "@raycast/api";
import { memo, useContext, useMemo } from "react";
import { useUser } from "../client";
import CompletionAction from "../components/CompletionAction";
import DatesDetail from "../components/DatesDetail";
import { OpenInBrowserAction } from "../components/OpenInBrowserAction";
import { HiddenItemActionsSection } from "../components/WithHiddenItems";
import CourseContext from "../course-context";
import { formatDurationSeconds, formatRelativeTime } from "../helpers/format";
import { buildGradeAccessoryTextByModuleId } from "../helpers/grades";
import { turndown } from "../helpers/markdown";
import { useWSBatchQuery, useWSQuery } from "../hooks/useWSQuery";
import { Module } from "../types";
import type {
  AddonModH5PActivityGradeMethod,
  AddonModH5PActivityWSAttempt,
  AddonModH5PActivityWSData,
  AddonModH5pactivityGetAttemptsWSResponse,
  AddonModH5pactivityGetH5pactivityAccessInformationWSResponse,
  AddonModH5pactivityGlobalSettings,
} from "../types/h5pactivity";
import DefaultListItem from "./default";

function H5PActivityListItem({ module }: { module: Module }) {
  const ctx = useContext(CourseContext);
  const { scope, activeCourse } = ctx;
  const user = useUser();
  const { data, isPending } = useWSQuery("mod_h5pactivity_get_h5pactivities_by_courses", {
    courseids: scope.courseIds,
  });
  const { data: accessInfo } = useWSQuery("mod_h5pactivity_get_h5pactivity_access_information", {
    h5pactivityid: module.instance,
  });
  const { data: attemptsData } = useWSQuery("mod_h5pactivity_get_attempts", {
    h5pactivityid: module.instance,
    userids: [user.id],
  });
  const { data: gradeTables } = useWSBatchQuery(
    "gradereport_user_get_grades_table",
    scope.courseIds.map((courseid) => ({ courseid, userid: 0 })),
  );

  const currentActivity = data?.h5pactivities.find(
    (activity) => activity.id === module.instance || activity.coursemodule === module.id,
  );
  const gradeTextByModuleId = useMemo(() => buildGradeAccessoryTextByModuleId(gradeTables), [gradeTables]);
  const gradeText = gradeTextByModuleId.get(module.id);

  if (!currentActivity) {
    return <DefaultListItem module={module} />;
  }

  return (
    <DefaultListItem
      module={module}
      detail={
        <H5PActivityListItemDetail
          activity={currentActivity}
          accessInfo={accessInfo}
          attemptsData={attemptsData}
          globalSettings={data?.h5pglobalsettings}
          isLoading={isPending}
          module={module}
        />
      }
      accessories={getH5PAccessories({ accessInfo, attemptsData, gradeText })}
      actions={
        <ActionPanel>
          {module.url && (
            <OpenInBrowserAction
              url={module.url}
              title={accessInfo?.cansubmit === false ? "Preview Activity" : "Open Activity"}
              icon={Icon.Play}
            />
          )}
          {currentActivity.enabletracking ? (
            <Action.Push
              title="View Attempts"
              icon={Icon.List}
              target={
                <CourseContext value={ctx}>
                  <H5PAttemptsList activity={currentActivity} module={module} />
                </CourseContext>
              }
            />
          ) : null}
          {module.url && <OpenInBrowserAction url={module.url} />}
          <CompletionAction module={module} course={activeCourse} />
          <HiddenItemActionsSection item={module} />
        </ActionPanel>
      }
    />
  );
}

export default memo(H5PActivityListItem);

function H5PActivityListItemDetail({
  activity,
  accessInfo,
  attemptsData,
  globalSettings,
  isLoading,
  module,
}: {
  activity: AddonModH5PActivityWSData;
  accessInfo: AddonModH5pactivityGetH5pactivityAccessInformationWSResponse | undefined;
  attemptsData: AddonModH5pactivityGetAttemptsWSResponse | undefined;
  globalSettings: AddonModH5pactivityGlobalSettings | undefined;
  isLoading: boolean;
  module: Module;
}) {
  const attempts = getAttempts(attemptsData);
  const latestAttempt = getLatestAttempt(attempts);

  return (
    <List.Item.Detail
      isLoading={isLoading}
      markdown={turndown(activity.intro || "")}
      metadata={
        <List.Item.Detail.Metadata>
          <List.Item.Detail.Metadata.Label title="Attempts" text={String(attempts.length)} />
          {latestAttempt && (
            <List.Item.Detail.Metadata.Label title="Latest Score" text={formatAttemptScore(latestAttempt)} />
          )}
          {latestAttempt && (
            <List.Item.Detail.Metadata.Label title="Latest Outcome" text={getAttemptOutcomeLabel(latestAttempt)} />
          )}
          {latestAttempt?.timemodified ? (
            <List.Item.Detail.Metadata.Label
              title="Last Attempt"
              text={formatRelativeTime(latestAttempt.timemodified)}
            />
          ) : null}
          {latestAttempt?.duration ? (
            <List.Item.Detail.Metadata.Label
              title="Latest Duration"
              text={formatDurationSeconds(latestAttempt.duration)}
            />
          ) : null}
          {typeof activity.grade === "number" && activity.grade > 0 && (
            <List.Item.Detail.Metadata.Label title="Max Grade" text={String(activity.grade)} />
          )}
          <List.Item.Detail.Metadata.Label title="Grading" text={formatGradeMethod(activity.grademethod)} />
          <List.Item.Detail.Metadata.Label title="Tracking" text={activity.enabletracking ? "Enabled" : "Disabled"} />
          {globalSettings && (
            <List.Item.Detail.Metadata.Label
              title="Save State"
              text={globalSettings.enablesavestate ? "Enabled" : "Disabled"}
            />
          )}
          {accessInfo && (
            <List.Item.Detail.Metadata.Label title="Mode" text={accessInfo.cansubmit ? "Attempt" : "Preview"} />
          )}
          {accessInfo && (
            <List.Item.Detail.Metadata.Label
              title="Review Attempts"
              text={accessInfo.canreviewattempts ? "Yes" : "No"}
            />
          )}
          <DatesDetail module={module} />
        </List.Item.Detail.Metadata>
      }
    />
  );
}

function H5PAttemptsList({ activity, module }: { activity: AddonModH5PActivityWSData; module: Module }) {
  const user = useUser();
  const { data, isPending } = useWSQuery("mod_h5pactivity_get_attempts", {
    h5pactivityid: activity.id,
    userids: [user.id],
  });

  const attempts = getAttempts(data).toSorted(
    (a, b) => (b.timemodified ?? b.timecreated ?? 0) - (a.timemodified ?? a.timecreated ?? 0),
  );

  return (
    <List navigationTitle={`${module.name} Attempts`} isLoading={isPending} isShowingDetail={true}>
      {attempts.map((attempt) => (
        <List.Item
          key={attempt.id}
          title={`Attempt ${attempt.attempt}`}
          subtitle={formatRelativeTime(attempt.timemodified)}
          accessories={getAttemptAccessories(attempt)}
          detail={<H5PAttemptDetail attempt={attempt} />}
          actions={
            <ActionPanel>
              {module.url && <OpenInBrowserAction url={module.url} title="Open Activity" icon={Icon.Play} />}
            </ActionPanel>
          }
        />
      ))}
    </List>
  );
}

function H5PAttemptDetail({ attempt }: { attempt: AddonModH5PActivityWSAttempt }) {
  return (
    <List.Item.Detail
      metadata={
        <List.Item.Detail.Metadata>
          <List.Item.Detail.Metadata.Label title="Outcome" text={getAttemptOutcomeLabel(attempt)} />
          <List.Item.Detail.Metadata.Label title="Score" text={formatAttemptScore(attempt)} />
          <List.Item.Detail.Metadata.Label title="Duration" text={formatDurationSeconds(attempt.duration)} />
          <List.Item.Detail.Metadata.Label title="Updated" text={formatRelativeTime(attempt.timemodified)} />
          <List.Item.Detail.Metadata.Label title="Started" text={formatRelativeTime(attempt.timecreated)} />
        </List.Item.Detail.Metadata>
      }
    />
  );
}

function getAttempts(attemptsData: AddonModH5pactivityGetAttemptsWSResponse | undefined) {
  return attemptsData?.usersattempts[0]?.attempts ?? [];
}

function getLatestAttempt(attempts: AddonModH5PActivityWSAttempt[]) {
  return [...attempts].sort(
    (a, b) => (b.timemodified ?? b.timecreated ?? 0) - (a.timemodified ?? a.timecreated ?? 0),
  )[0];
}

function getAttemptAccessories(attempt: AddonModH5PActivityWSAttempt): List.Item.Accessory[] {
  return [{ text: formatAttemptScore(attempt) }, { text: getAttemptOutcomeLabel(attempt) }];
}

function getH5PAccessories({
  accessInfo,
  attemptsData,
  gradeText,
}: {
  accessInfo: AddonModH5pactivityGetH5pactivityAccessInformationWSResponse | undefined;
  attemptsData: AddonModH5pactivityGetAttemptsWSResponse | undefined;
  gradeText?: string;
}): List.Item.Accessory[] {
  if (gradeText) {
    return [{ text: gradeText, tooltip: "Grade" }];
  }

  const latestAttempt = getLatestAttempt(getAttempts(attemptsData));
  if (latestAttempt) {
    return [{ text: getCompactOutcomeLabel(latestAttempt), tooltip: "Latest attempt" }];
  }

  if (accessInfo?.cansubmit === false) {
    return [{ text: { value: "Preview", color: Color.Blue }, tooltip: "Preview mode" }];
  }

  return [{ text: "Open", tooltip: "No attempts yet" }];
}

function getCompactOutcomeLabel(attempt: AddonModH5PActivityWSAttempt) {
  if (attempt.success === 1) {
    return { value: "Pass", color: Color.Green };
  }
  if (attempt.success === 0) {
    return { value: "Fail", color: Color.Red };
  }
  if (attempt.completion === 1) {
    return { value: "Done", color: Color.Blue };
  }
  if (attempt.completion === 0) {
    return { value: "Open", color: Color.Orange };
  }
  return { value: "Tracked" };
}

function getAttemptOutcomeLabel(attempt: AddonModH5PActivityWSAttempt) {
  if (attempt.success === 1) {
    return { value: "Passed", color: Color.Green };
  }
  if (attempt.success === 0) {
    return { value: "Failed", color: Color.Red };
  }
  if (attempt.completion === 1) {
    return { value: "Completed", color: Color.Blue };
  }
  if (attempt.completion === 0) {
    return { value: "Incomplete", color: Color.Orange };
  }
  return { value: "Tracked" };
}

function formatAttemptScore(attempt: AddonModH5PActivityWSAttempt) {
  return `${attempt.rawscore} / ${attempt.maxscore}`;
}

function formatGradeMethod(gradeMethod: AddonModH5PActivityGradeMethod) {
  switch (gradeMethod) {
    case 0:
      return "Manual";
    case 1:
      return "Highest attempt";
    case 2:
      return "Average attempt";
    case 3:
      return "Last attempt";
    case 4:
      return "First attempt";
    default:
      return String(gradeMethod);
  }
}
