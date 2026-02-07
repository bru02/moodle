import { Action, ActionPanel, Color, List } from "@raycast/api";
import { memo, useContext, useMemo } from "react";
import CompletionAction from "../components/CompletionAction";
import DatesDetail from "../components/DatesDetail";
import { OpenInBrowserAction } from "../components/OpenInBrowserAction";
import { HiddenItemActionsSection } from "../components/WithHiddenItems";
import CourseContext from "../course-context";
import { stripHTML } from "../helpers";
import { getFilePath } from "../helpers/files";
import { formatDurationBetween } from "../helpers/format";
import { turndown } from "../helpers/markdown";
import { useWSQuery } from "../hooks/useWSQuery";
import { useSync } from "../sync";
import { Module } from "../types";
import type {
  AddonModAssignAssign,
  AddonModAssignGradingStates,
  AddonModAssignSubmissionStatusValues,
} from "../types/assign";
import DefaultListItem from "./default";
import ResourceListItem from "./resource";

function AssignListItem({ module }: { module: Module }) {
  const course = useContext(CourseContext);
  const { data, isPending } = useWSQuery("mod_assign_get_assignments", { "courseids[0]": Number(course.id) });
  const currentAssignment = data?.courses.flatMap((c) => c.assignments).find((a) => a.id === module.instance);

  if (!currentAssignment) {
    return <DefaultListItem module={module} />;
  }

  return (
    <DefaultListItem
      module={module}
      detail={<AssignListItemDetail assignment={currentAssignment} isLoading={isPending} module={module} />}
      actions={
        <ActionPanel>
          <Action.Push
            title="View Related Files"
            target={
              <CourseContext value={course}>
                <AssignmentFilesList module={module} assignment={currentAssignment} />
              </CourseContext>
            }
          ></Action.Push>
          <OpenInBrowserAction url={module.url!} />
          <CompletionAction module={module} course={course} />
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
}: {
  assignment: AddonModAssignAssign;
  isLoading: boolean;
  module: Module;
}) {
  const { data: submissionsData } = useWSQuery("mod_assign_get_submission_status", { assignid: module.instance });

  const submission = submissionsData?.lastattempt?.teamsubmission ?? submissionsData?.lastattempt?.submission;

  const detail = (
    <List.Item.Detail
      isLoading={isLoading}
      markdown={turndown(assignment.intro || "")}
      metadata={
        <List.Item.Detail.Metadata>
          {submissionsData?.feedback && submissionsData?.feedback.gradefordisplay && (
            <List.Item.Detail.Metadata.Label
              title="Grade"
              text={stripHTML(submissionsData?.feedback.gradefordisplay)}
            />
          )}
          {submission && <FeedbackComment cmid={assignment.cmid} itemid={submission.id} />}{" "}
          {submission && (
            <List.Item.Detail.Metadata.Label
              title="Submission Status"
              text={getSubmissionStatusLabelProps(submission?.status)}
            />
          )}
          {submissionsData?.lastattempt && (
            <List.Item.Detail.Metadata.Label
              title="Grading Status"
              text={getGradeStatusLabelProps(submissionsData.lastattempt.gradingstatus)}
            />
          )}
          <DatesDetail module={module} />
          {assignment.cutoffdate > 0 && assignment.cutoffdate !== assignment.duedate ? (
            <List.Item.Detail.Metadata.Label
              title="Grace Period"
              text={formatDurationBetween(assignment.duedate, assignment.cutoffdate)}
            />
          ) : null}
          {submission?.attemptnumber !== undefined && assignment.maxattempts !== 1 && (
            <List.Item.Detail.Metadata.Label
              title="Attempt"
              text={`${submission.attemptnumber + 1} / ${assignment.maxattempts === -1 ? "∞" : assignment.maxattempts}`}
            />
          )}
        </List.Item.Detail.Metadata>
      }
    />
  );

  return detail;
}

function AssignmentFilesList({ module, assignment }: { module: Module; assignment: AddonModAssignAssign }) {
  const course = useContext(CourseContext);
  const { data: submissionsData } = useWSQuery("mod_assign_get_submission_status", { assignid: module.instance });

  const submissions = submissionsData?.lastattempt?.teamsubmission ?? submissionsData?.lastattempt?.submission;

  const submittedFiles = useMemo(
    () =>
      submissions?.plugins?.flatMap((plugin) => plugin.fileareas?.flatMap((filearea) => filearea.files || []) || []) ||
      [],
    [submissions],
  );

  const { introattachments = [] } = assignment;

  const allFiles = useMemo(() => {
    const introFiles = introattachments.map((file) => [getFilePath(file, module, course), file] as const);
    const submitted = submittedFiles
      .map((file) => ({ ...file, filename: "Sol – " + file.filename }))
      .map((file) => [getFilePath(file, module, course), file] as const);
    return [...introFiles, ...submitted];
  }, [introattachments, submittedFiles, module, course]);

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
    </List>
  );
}

function FeedbackComment({ cmid, itemid }: { cmid: number; itemid: number }) {
  const { data: comments } = useWSQuery("core_comment_get_comments", {
    contextlevel: "module",
    instanceid: cmid,
    component: "assignsubmission_comments",
    itemid,
    area: "submission_comments",
    page: 0,
  });

  if (comments?.comments.length || 0 > 0) {
    return <List.Item.Detail.Metadata.Label title="Feedback" text={turndown(comments!.comments[0].content)} />;
  }
}

function getSubmissionStatusLabelProps(status: AddonModAssignSubmissionStatusValues) {
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

function getGradeStatusLabelProps(gradeStatus: AddonModAssignGradingStates) {
  switch (gradeStatus) {
    case "graded":
      return { value: "Graded", color: Color.Green };
    case "notgraded":
      return { value: "Not graded", color: Color.Orange };
    case "gradedfollowupsubmit":
      return { value: "Graded - resubmitted", color: Color.Yellow };
    case "released":
      return { value: "Released", color: Color.Green };
    default:
      return { value: gradeStatus };
  }
}
