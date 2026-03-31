import { MoodleHtml } from "@/components/moodle-html";
import { useWSQuery } from "@/lib/useWSQuery";
import { useAppState } from "@/providers/app-provider";

import { FactSection, formatFactDate, formatReadableHtml, formatStatusLabel, formatSubmissionStatus, getFactRow } from "../shared";
import type { ModuleDetailProps } from "../types";

type AssignmentSummary = {
  id: number;
  cmid: number;
  intro?: string;
  duedate?: number;
  cutoffdate?: number;
  allowsubmissionsfromdate?: number;
  gradingduedate?: number;
};

type AssignmentStatus = {
  lastattempt?: {
    gradingstatus?: string;
    submission?: {
      status?: string;
      timecreated?: number;
      timemodified?: number;
      attemptnumber?: number;
    };
    teamsubmission?: {
      status?: string;
      timecreated?: number;
      timemodified?: number;
      attemptnumber?: number;
    };
  };
  feedback?: {
    gradeddate?: number;
    gradefordisplay?: string;
  };
};

export function AssignmentDetail({ scope, module }: ModuleDetailProps) {
  const { activeAccount, accountSession, refreshAccountSession } = useAppState();
  const session = activeAccount ? accountSession(activeAccount.id) : null;
  const adapter = activeAccount && session
    ? {
        siteOrigin: activeAccount.origin,
        session,
        refreshSession: async () => await refreshAccountSession(activeAccount.id),
      }
    : null;
  const assignmentsQuery = useWSQuery<{ courses: { assignments: AssignmentSummary[] }[] }>(
    adapter,
    "mod_assign_get_assignments",
    { courseids: scope.courseIds },
    { enabled: Boolean(adapter) },
  );
  const statusQuery = useWSQuery<AssignmentStatus>(
    adapter,
    "mod_assign_get_submission_status",
    { assignid: module.module.instance },
    { enabled: Boolean(adapter) },
  );
  const assignmentsData = assignmentsQuery.data as { courses: { assignments: AssignmentSummary[] }[] } | undefined;
  const statusData = statusQuery.data as AssignmentStatus | undefined;
  const assignment = assignmentsData?.courses
    .flatMap((course: { assignments: AssignmentSummary[] }) => course.assignments)
    .find((item: AssignmentSummary) => item.id === module.module.instance || item.cmid === module.module.id);
  const submission = statusData?.lastattempt?.teamsubmission ?? statusData?.lastattempt?.submission;
  const rows = [
    getFactRow("Submission", formatSubmissionStatus(submission?.status)),
    getFactRow(
      "Grading",
      statusData?.lastattempt?.gradingstatus ? formatStatusLabel(statusData.lastattempt.gradingstatus) : undefined,
    ),
    getFactRow("Grade", statusData?.feedback?.gradefordisplay ? formatReadableHtml(statusData.feedback.gradefordisplay) : undefined),
    getFactRow("Available", formatFactDate(assignment?.allowsubmissionsfromdate)),
    getFactRow("Due", formatFactDate(assignment?.duedate)),
    getFactRow("Cutoff", formatFactDate(assignment?.cutoffdate)),
    getFactRow("Grading due", formatFactDate(assignment?.gradingduedate)),
  ].filter((item): item is { label: string; value: string } => Boolean(item));

  return (
    <FactSection
      title="Assignment"
      rows={rows}
      description={
        assignment?.intro ? (
          <MoodleHtml html={assignment.intro} baseUrl={module.module.url} contents={module.module.contents} variant="secondary" />
        ) : undefined
      }
      isLoading={assignmentsQuery.isLoading || statusQuery.isLoading}
      emptyCopy="Assignment details are only available in Moodle."
    />
  );
}
