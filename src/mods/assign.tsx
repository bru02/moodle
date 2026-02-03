import { Action, ActionPanel, Color, List } from "@raycast/api";
import { formatDuration, intervalToDuration } from "date-fns";
import { useContext, useMemo } from "react";
import CompletionAction from "../components/CompletionAction";
import DatesDetail from "../components/DatesDetail";
import { OpenInBrowserAction } from "../components/OpenInBrowserAction";
import CourseContext from "../course-context";
import { stripHTML } from "../helpers";
import { getFilePath } from "../helpers/files";
import { turndown } from "../helpers/markdown";
import { createRenderProfiler, useRenderTimer } from "../hooks/useRenderTimer";
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

export default function AssignListItem({ module }: { module: Module }) {
  useRenderTimer(`AssignListItem:${module.id}`);
  const render = createRenderProfiler(`AssignListItem:${module.id}`);
  const course = useContext(CourseContext);
  const { data, isPending } = useWSQuery("mod_assign_get_assignments", { "courseids[0]": Number(course.id) });
  render.step("after assignments query");
  const currentAssignment = data?.courses.flatMap((c) => c.assignments).find((a) => a.id === module.instance);
  render.step("after assignment lookup");

  if (!currentAssignment) {
    render.end("no assignment");
    return <DefaultListItem module={module} />;
  }

  const result = (
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
        </ActionPanel>
      }
    />
  );

  render.end("with assignment");
  return result;
}

function AssignListItemDetail({
  assignment,
  isLoading,
  module,
}: {
  assignment: AddonModAssignAssign;
  isLoading: boolean;
  module: Module;
}) {
  useRenderTimer(`AssignListItemDetail:${assignment.id}`);
  const render = createRenderProfiler(`AssignListItemDetail:${assignment.id}`);
  const { data: submissionsData } = useWSQuery("mod_assign_get_submission_status", { assignid: module.instance });
  render.step("after submission status query");

  const submission = submissionsData?.lastattempt?.teamsubmission ?? submissionsData?.lastattempt?.submission;
  render.step("after submission derive");

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
              text={formatDuration(
                intervalToDuration({
                  start: new Date(assignment.duedate * 1000),
                  end: new Date(assignment.cutoffdate * 1000),
                }),
              )}
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

  render.step("after detail element");
  render.end();
  return detail;
}

function AssignmentFilesList({ module, assignment }: { module: Module; assignment: AddonModAssignAssign }) {
  useRenderTimer(`AssignmentFilesList:${assignment.id}`);
  const render = createRenderProfiler(`AssignmentFilesList:${assignment.id}`);
  const course = useContext(CourseContext);
  const { data: submissionsData } = useWSQuery("mod_assign_get_submission_status", { assignid: module.instance });
  render.step("after submission status query");

  const submissions = submissionsData?.lastattempt?.teamsubmission ?? submissionsData?.lastattempt?.submission;

  const submittedFiles = useMemo(
    () =>
      submissions?.plugins?.flatMap((plugin) => plugin.fileareas?.flatMap((filearea) => filearea.files || []) || []) ||
      [],
    [submissions],
  );
  render.step("after submittedFiles memo");

  const { introattachments = [] } = assignment;

  const allFiles = useMemo(() => {
    const introFiles = introattachments.map((file) => [getFilePath(file, module, course), file] as const);
    const submitted = submittedFiles
      .map((file) => ({ ...file, filename: "Sol – " + file.filename }))
      .map((file) => [getFilePath(file, module, course), file] as const);
    return [...introFiles, ...submitted];
  }, [introattachments, submittedFiles, module, course]);
  render.step("after allFiles memo");

  useSync(allFiles);
  render.step("after useSync");

  const result = (
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

  render.end();
  return result;
}

function FeedbackComment({ cmid, itemid }: { cmid: number; itemid: number }) {
  useRenderTimer(`FeedbackComment:${itemid}`);
  const render = createRenderProfiler(`FeedbackComment:${itemid}`);
  const { data: comments } = useWSQuery("core_comment_get_comments", {
    contextlevel: "module",
    instanceid: cmid,
    component: "assignsubmission_comments",
    itemid,
    area: "submission_comments",
    page: 0,
  });
  render.step("after comments query");

  if (comments?.comments.length || 0 > 0) {
    const result = <List.Item.Detail.Metadata.Label title="Feedback" text={turndown(comments!.comments[0].content)} />;
    render.end("with comment");
    return result;
  }

  render.end("no comment");
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
