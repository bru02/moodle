import { Action, ActionPanel, Color, Icon, List } from "@raycast/api";
import { memo, useContext, useMemo } from "react";

import CompletionAction from "../components/CompletionAction";
import DatesDetail from "../components/DatesDetail";
import { OpenInBrowserAction } from "../components/OpenInBrowserAction";
import { HiddenItemActionsSection } from "../components/WithHiddenItems";
import CourseContext from "../course-context";
import { stripHTML } from "../helpers";
import { getFilePath, handleFileUrl } from "../helpers/files";
import { formatDurationBetween } from "../helpers/format";
import { buildGradeAccessoryTextByModuleId } from "../helpers/grades";
import { turndown } from "../helpers/markdown";
import { useWSBatchQuery, useWSQuery } from "../hooks/useWSQuery";
import { useSync } from "../sync";
import { Module } from "../types";
import type {
  AddonModAssignAssign,
  AddonModAssignGetSubmissionStatusWSResponse,
  AddonModAssignGradingStates,
  AddonModAssignPlugin,
  AddonModAssignSubmissionStatusValues,
} from "../types/assign";
import DefaultListItem from "./default";
import ResourceListItem from "./resource";

function AssignListItem({ module }: { module: Module }) {
  const ctx = useContext(CourseContext);
  const { scope, activeCourse } = ctx;
  const { data, isPending } = useWSQuery("mod_assign_get_assignments", {
    courseids: scope.courseIds,
  });
  const { data: gradeTables } = useWSBatchQuery(
    "gradereport_user_get_grades_table",
    scope.courseIds.map((courseid) => ({ courseid, userid: 0 })),
  );
  const { data: submissionsData } = useWSQuery(
    "mod_assign_get_submission_status",
    { assignid: module.instance },
  );
  const currentAssignment = data?.courses
    .flatMap((c) => c.assignments)
    .find((a) => a.id === module.instance);
  const submission =
    submissionsData?.lastattempt?.teamsubmission ??
    submissionsData?.lastattempt?.submission;
  const gradeTextByModuleId = useMemo(
    () => buildGradeAccessoryTextByModuleId(gradeTables),
    [gradeTables],
  );
  const gradeText = gradeTextByModuleId.get(module.id);

  if (!currentAssignment) {
    return <DefaultListItem module={module} />;
  }

  return (
    <DefaultListItem
      module={module}
      detail={
        <AssignListItemDetail
          assignment={currentAssignment}
          isLoading={isPending}
          module={module}
          submissionsData={submissionsData}
        />
      }
      accessories={getAssignmentAccessories({
        status: submission?.status,
        gradingStatus: submissionsData?.lastattempt?.gradingstatus,
        gradeText,
        dueAt: getAssignmentSubmissionDeadline(currentAssignment),
      })}
      actions={
        <ActionPanel>
          <Action.Push
            title="View Related Files"
            icon={Icon.Document}
            target={
              <CourseContext value={ctx}>
                <AssignmentFilesList
                  module={module}
                  assignment={currentAssignment}
                />
              </CourseContext>
            }
          ></Action.Push>
          <OpenInBrowserAction url={module.url!} />
          <CompletionAction module={module} />
          <HiddenItemActionsSection item={module} />
        </ActionPanel>
      }
    />
  );
}

export default memo(AssignListItem);

function AssignListItemDetail({
  assignment,
  isLoading,
  module,
  submissionsData,
}: {
  assignment: AddonModAssignAssign;
  isLoading: boolean;
  module: Module;
  submissionsData: AddonModAssignGetSubmissionStatusWSResponse | undefined;
}) {
  const submission =
    submissionsData?.lastattempt?.teamsubmission ??
    submissionsData?.lastattempt?.submission;
  const editPdfPlugin = submissionsData?.feedback?.plugins?.find(
    (plugin) => plugin.type === "editpdf",
  );
  const hasPdfAnnotations = getDisplayFeedbackFiles(editPdfPlugin).length > 0;
  const feedbackMarkdown = useMemo(
    () => buildAssignmentFeedbackMarkdown(submissionsData?.feedback?.plugins),
    [submissionsData?.feedback?.plugins],
  );
  const detailMarkdown = useMemo(
    () =>
      [
        turndown(assignment.intro || ""),
        feedbackMarkdown ? `# Feedback\n\n${feedbackMarkdown}` : "",
      ]
        .filter(Boolean)
        .join("\n\n---\n\n"),
    [assignment.intro, feedbackMarkdown],
  );

  return (
    <List.Item.Detail
      isLoading={isLoading}
      markdown={detailMarkdown}
      metadata={
        <List.Item.Detail.Metadata>
          {submissionsData?.feedback?.gradefordisplay ? (
            <List.Item.Detail.Metadata.Label
              title="Grade"
              text={stripHTML(submissionsData.feedback.gradefordisplay)}
            />
          ) : null}
          {editPdfPlugin ? (
            <List.Item.Detail.Metadata.Label
              title="Annotations"
              text={hasPdfAnnotations ? "Available" : "None"}
            />
          ) : null}
          {submission && (
            <List.Item.Detail.Metadata.Label
              title="Submission"
              text={getSubmissionStatusDetailText(submission.status)}
            />
          )}
          {submissionsData?.lastattempt && (
            <List.Item.Detail.Metadata.Label
              title="Grading"
              text={getGradingStatusDetailText(
                submissionsData.lastattempt.gradingstatus,
              )}
            />
          )}
          <DatesDetail module={module} />
          {assignment.cutoffdate > 0 &&
          assignment.cutoffdate !== assignment.duedate ? (
            <List.Item.Detail.Metadata.Label
              title="Grace Period"
              text={formatDurationBetween(
                assignment.duedate,
                assignment.cutoffdate,
              )}
            />
          ) : null}
          {submission?.attemptnumber !== undefined &&
            assignment.maxattempts !== 1 && (
              <List.Item.Detail.Metadata.Label
                title="Attempt"
                text={`${submission.attemptnumber + 1} / ${assignment.maxattempts === -1 ? "∞" : assignment.maxattempts}`}
              />
            )}
        </List.Item.Detail.Metadata>
      }
    />
  );
}

function AssignmentFilesList({
  module,
  assignment,
}: {
  module: Module;
  assignment: AddonModAssignAssign;
}) {
  const { activeCourse: course } = useContext(CourseContext);
  const { data: submissionsData } = useWSQuery(
    "mod_assign_get_submission_status",
    { assignid: module.instance },
  );

  const submissions =
    submissionsData?.lastattempt?.teamsubmission ??
    submissionsData?.lastattempt?.submission;
  const feedbackFiles = useMemo(
    () => getAssignmentFeedbackFiles(submissionsData?.feedback?.plugins),
    [submissionsData?.feedback?.plugins],
  );

  const submittedFiles = useMemo(
    () =>
      submissions?.plugins?.flatMap(
        (plugin) =>
          plugin.fileareas?.flatMap((filearea) => filearea.files || []) || [],
      ) || [],
    [submissions],
  );

  const { introattachments = [] } = assignment;

  const allFiles = useMemo(() => {
    const introFiles = introattachments.map(
      (file) => [getFilePath(file, module, course), file] as const,
    );
    const submitted = submittedFiles
      .map((file) => ({ ...file, filename: "Sol – " + file.filename }))
      .map((file) => [getFilePath(file, module, course), file] as const);
    const feedback = feedbackFiles
      .map((file) => ({ ...file, filename: "Feedback - " + file.filename }))
      .map((file) => [getFilePath(file, module, course), file] as const);
    return [...introFiles, ...submitted, ...feedback];
  }, [introattachments, submittedFiles, feedbackFiles, module, course]);

  useSync(allFiles);

  return (
    <List navigationTitle={`Files for ${module.name}`}>
      <List.Section title="Intro Files">
        {introattachments.map((i) => (
          <ResourceListItem key={i.filename} module={module} content={i} />
        ))}
      </List.Section>
      <List.Section title="Submitted Files">
        {submittedFiles.map((i) => (
          <ResourceListItem key={i.filename} module={module} content={i} />
        ))}
      </List.Section>
      <List.Section title="Feedback Files">
        {feedbackFiles.map((i) => (
          <ResourceListItem
            key={`${i.filename}-${i.fileurl}`}
            module={module}
            content={i}
          />
        ))}
      </List.Section>
    </List>
  );
}

function getAssignmentAccessories({
  status,
  gradingStatus,
  gradeText,
  dueAt,
}: {
  status?: AddonModAssignSubmissionStatusValues;
  gradingStatus?: AddonModAssignGradingStates;
  gradeText?: string;
  dueAt?: number;
}): List.Item.Accessory[] {
  if (gradeText) {
    return [{ text: gradeText, tooltip: "Grade" }];
  }

  const hasUpcomingOrPastDeadline = typeof dueAt === "number" && dueAt > 0;
  if (
    hasUpcomingOrPastDeadline &&
    status &&
    ["new", "draft", "reopened"].includes(status)
  ) {
    return [{ date: new Date(dueAt * 1000), tooltip: "Time left to submit" }];
  }

  if (status === "submitted") {
    if (gradingStatus === "notgraded") {
      return [
        {
          text: { value: "Review", color: Color.Orange },
          tooltip: "Awaiting grading",
        },
      ];
    }
    if (gradingStatus === "graded" || gradingStatus === "released") {
      return [
        { text: { value: "Graded", color: Color.Green }, tooltip: "Graded" },
      ];
    }
  }

  if (!status) {
    return [];
  }

  return [
    {
      text: getSubmissionStatusAccessoryText(status),
      tooltip: "Submission status",
    },
  ];
}

function getSubmissionStatusAccessoryText(
  status: AddonModAssignSubmissionStatusValues,
) {
  switch (status) {
    case "draft":
      return { value: "Draft", color: Color.Yellow };
    case "new":
      return { value: "None", color: Color.Orange };
    case "reopened":
      return { value: "Reopen", color: Color.Blue };
    case "submitted":
      return { value: "Done", color: Color.Green };
    default:
      return { value: status };
  }
}

function getSubmissionStatusDetailText(
  status: AddonModAssignSubmissionStatusValues,
) {
  switch (status) {
    case "draft":
      return { value: "Draft (not submitted)" };
    case "new":
      return { value: "No submission", color: Color.Orange };
    case "reopened":
      return { value: "Reopened", color: Color.Blue };
    case "submitted":
      return { value: "Submitted for grading", color: Color.Green };
    default:
      return { value: status };
  }
}

function getGradingStatusDetailText(status: AddonModAssignGradingStates) {
  switch (status) {
    case "graded":
      return { value: "Graded", color: Color.Green };
    case "notgraded":
      return { value: "Not graded", color: Color.Orange };
    case "gradedfollowupsubmit":
      return { value: "Graded - resubmitted", color: Color.Yellow };
    case "released":
      return { value: "Released", color: Color.Green };
    default:
      return { value: status };
  }
}

function getAssignmentSubmissionDeadline(assignment: AddonModAssignAssign) {
  if (assignment.cutoffdate > 0) {
    return assignment.cutoffdate;
  }
  if (assignment.duedate > 0) {
    return assignment.duedate;
  }
  return undefined;
}

function buildAssignmentFeedbackMarkdown(
  plugins?: NonNullable<
    AddonModAssignGetSubmissionStatusWSResponse["feedback"]
  >["plugins"],
) {
  return (plugins ?? [])
    .map((plugin) => {
      const text = getAssignmentFeedbackText(plugin);
      const files = getDisplayFeedbackFiles(plugin);
      const fileLines = files
        .filter((file) => file.filename && file.fileurl)
        .map((file) => `- [${file.filename}](${handleFileUrl(file.fileurl)})`)
        .join("\n");
      const body = [text ? turndown(text).trim() : "", fileLines]
        .filter(Boolean)
        .join("\n\n");
      if (!body) {
        return null;
      }

      const title =
        plugin.type === "comments"
          ? "Feedback comments"
          : plugin.type === "file"
            ? "File feedback"
            : plugin.type === "editpdf"
              ? "PDF annotations"
              : plugin.name;
      return `## ${title}\n\n${body}`;
    })
    .filter((value): value is string => Boolean(value))
    .join("\n\n---\n\n");
}

function getAssignmentFeedbackText(plugin: AddonModAssignPlugin) {
  const files =
    plugin.fileareas?.flatMap((filearea) => filearea.files ?? []) ?? [];
  return (plugin.editorfields ?? [])
    .map((field) =>
      field.text.replace(/@@PLUGINFILE@@[^"'\\s>)]+/gi, (match) => {
        const normalizedPath = normalizeFeedbackPath(
          match.replace(/^@@PLUGINFILE@@/i, ""),
        );
        const file = files.find((candidate) => {
          const fullPath = normalizeFeedbackPath(
            `${candidate.filepath ?? ""}${candidate.filename ?? ""}`,
          );
          return (
            normalizedPath === fullPath ||
            normalizedPath === fullPath.slice(1) ||
            normalizedPath === candidate.filename
          );
        });
        return file?.fileurl ? handleFileUrl(file.fileurl) : match;
      }),
    )
    .join("")
    .trim();
}

function getAssignmentFeedbackFiles(
  plugins?: NonNullable<
    AddonModAssignGetSubmissionStatusWSResponse["feedback"]
  >["plugins"],
) {
  return (plugins ?? []).flatMap((plugin) => getDisplayFeedbackFiles(plugin));
}

function getDisplayFeedbackFiles(plugin?: AddonModAssignPlugin) {
  if (!plugin || plugin.type === "comments") {
    return [];
  }

  const fileareas =
    plugin.type === "editpdf"
      ? (plugin.fileareas ?? []).filter(
          (filearea) => filearea.area === "download",
        )
      : (plugin.fileareas ?? []);

  return fileareas.flatMap((filearea) => filearea.files ?? []);
}

function normalizeFeedbackPath(path: string) {
  const decodedPath = decodeURIComponent(path)
    .replace(/\\/g, "/")
    .replace(/\/+/g, "/");
  return decodedPath.startsWith("/") ? decodedPath : `/${decodedPath}`;
}
