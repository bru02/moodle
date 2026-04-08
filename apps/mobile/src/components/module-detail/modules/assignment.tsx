import { useMutation } from "@tanstack/react-query";
import { File } from "expo-file-system";
import { createUploadTask, FileSystemSessionType, FileSystemUploadType } from "expo-file-system/legacy";
import { useMemo, useState } from "react";
import { Text, View } from "react-native";

import { platformColors } from "@/constants/platform-colors";

import type { CoreWSExternalFile } from "@moodle/core";

import { compactFactRows, FilesSection, formatBytes, formatFactDate, formatReadableHtml, formatStatusLabel, formatSubmissionStatus, getFactRow, useModuleDetailAdapter } from "@/components/module-detail/shared";
import { StatPill } from "@/components/native-ui";
import { MoodleHtml } from "@/components/moodle-html";
import { PrimaryButton } from "@/components/primary-button";
import { requestWS, useWSQuery } from "@/lib/useWSQuery";

import type { ModuleDetailProps } from "../types";

type AssignmentSummary = {
  id: number;
  cmid: number;
  intro?: string;
  activity?: string;
  introattachments?: CoreWSExternalFile[];
  activityattachments?: CoreWSExternalFile[];
  duedate?: number;
  cutoffdate?: number;
  allowsubmissionsfromdate?: number;
  gradingduedate?: number;
  configs?: AssignmentConfig[];
};

type AssignmentConfig = {
  plugin?: string;
  subtype?: string;
  name?: string;
  value?: string;
};

type AssignmentStatus = {
  lastattempt?: {
    gradingstatus?: string;
    canedit?: boolean;
    cansubmit?: boolean;
    submission?: AssignmentSubmission;
    teamsubmission?: AssignmentSubmission;
  };
  feedback?: {
    gradefordisplay?: string;
  };
};

type AssignmentSubmission = {
  status?: string;
  plugins?: AssignmentPlugin[];
};

type AssignmentPlugin = {
  type?: string;
  fileareas?: Array<{
    area?: string;
    files?: Array<{
      filename?: string;
      filesize?: number;
    }>;
  }>;
};

export function AssignmentDetail({ scope, module }: ModuleDetailProps) {
  const { adapter, activeAccount } = useModuleDetailAdapter();
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [draftItemId, setDraftItemId] = useState<number>(0);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);

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
  const assignmentDescription = getAssignmentDescription({
    moduleDescription: module.module.description,
    intro: assignment?.intro,
    activity: assignment?.activity,
  });

  const submission = statusData?.lastattempt?.teamsubmission ?? statusData?.lastattempt?.submission;
  const canEdit = Boolean(statusData?.lastattempt?.canedit);
  const canSubmit = Boolean(statusData?.lastattempt?.cansubmit);
  const assignmentFiles = useMemo(
    () => mergeAssignmentFiles(assignment?.introattachments, assignment?.activityattachments),
    [assignment?.activityattachments, assignment?.introattachments],
  );

  const existingFiles = useMemo(
    () =>
      submission?.plugins
        ?.find((plugin) => plugin.type === "file")
        ?.fileareas?.flatMap((area) => area.files ?? []) ?? [],
    [submission?.plugins],
  );

  const maxSubmissionBytes = useMemo(
    () => parseIntPositive(getAssignConfigValue(assignment?.configs, "assignsubmission", "file", "maxsubmissionsizebytes")),
    [assignment?.configs],
  );
  const maxFileSubmissions = useMemo(
    () => parseIntPositive(getAssignConfigValue(assignment?.configs, "assignsubmission", "file", "maxfilesubmissions")),
    [assignment?.configs],
  );
  const pickerMimeType = useMemo(
    () => buildPickerMimeType(getAssignConfigValue(assignment?.configs, "assignsubmission", "file", "filetypeslist")),
    [assignment?.configs],
  );

  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!adapter || !activeAccount) {
        throw new Error("Session unavailable");
      }

      if (typeof maxFileSubmissions === "number" && maxFileSubmissions > 0 && existingFiles.length >= maxFileSubmissions) {
        throw new Error(`Maximum number of files reached (${maxFileSubmissions}).`);
      }

      const picked = await File.pickFileAsync(undefined, pickerMimeType);
      const selectedFile = Array.isArray(picked) ? picked[0] : picked;

      if (!selectedFile) {
        throw new Error("No file selected");
      }

      if (
        typeof maxSubmissionBytes === "number" &&
        maxSubmissionBytes > 0 &&
        typeof selectedFile.size === "number" &&
        selectedFile.size > maxSubmissionBytes
      ) {
        throw new Error(`File is too large (${formatBytes(selectedFile.size)}). Max allowed is ${formatBytes(maxSubmissionBytes)}.`);
      }

      const nextItemId = await uploadAssignmentDraftFile({
        siteOrigin: activeAccount.origin,
        token: adapter.session.token,
        file: selectedFile,
        itemId: draftItemId,
        onProgress: (value) => setUploadProgress(value),
      });

      await requestWS(adapter, "mod_assign_save_submission", {
        assignmentid: module.module.instance,
        plugindata: {
          files_filemanager: nextItemId,
        },
      });

      setDraftItemId(nextItemId);
    },
    onSuccess: async () => {
      setUploadProgress(null);
      setStatusMessage("File attached to draft.");
      await statusQuery.refetch();
    },
    onError: (error) => {
      setUploadProgress(null);
      const message = error instanceof Error ? error.message : "Could not upload file.";
      if (message === "No file selected") {
        return;
      }
      setStatusMessage(message);
    },
  });

  const submitMutation = useMutation({
    mutationFn: async () => {
      if (!adapter) {
        throw new Error("Session unavailable");
      }

      await requestWS(adapter, "mod_assign_submit_for_grading", {
        assignmentid: module.module.instance,
        acceptsubmissionstatement: true,
      });
    },
    onSuccess: async () => {
      setStatusMessage("Submitted for grading.");
      await statusQuery.refetch();
    },
    onError: (error) => {
      setStatusMessage(error instanceof Error ? error.message : "Could not submit assignment.");
    },
  });

  const secondaryFacts = compactFactRows(
    getFactRow("Grading", statusData?.lastattempt?.gradingstatus ? formatStatusLabel(statusData.lastattempt.gradingstatus) : undefined),
    getFactRow("Available", formatFactDate(assignment?.allowsubmissionsfromdate)),
    getFactRow("Cutoff", formatFactDate(assignment?.cutoffdate)),
    getFactRow("Grading due", formatFactDate(assignment?.gradingduedate)),
  );

  return (
    <View style={{ gap: 14 }}>
      {(assignmentsQuery.isLoading || statusQuery.isLoading) && !assignment && !statusData ? (
        <Text selectable style={{ fontSize: 14, lineHeight: 21, color: platformColors.secondaryLabel }}>
          Loading…
        </Text>
      ) : (
        <>
          <View style={{ flexDirection: "row", gap: 12, flexWrap: "wrap" }}>
            {statusData?.feedback?.gradefordisplay ? (
              <StatPill label="Grade" value={formatReadableHtml(statusData.feedback.gradefordisplay)} tint="#34C759" />
            ) : null}
            {submission?.status ? (
              <StatPill label="Submission" value={formatSubmissionStatus(submission.status) ?? "Unknown"} />
            ) : null}
            {assignment?.duedate ? (
              <StatPill label="Due" value={formatFactDate(assignment.duedate) ?? ""} tint={getDueTint(assignment.duedate)} />
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

      {assignmentDescription ? (
        <MoodleHtml html={assignmentDescription} baseUrl={module.module.url} contents={assignmentFiles} variant="secondary" />
      ) : !assignment && !assignmentsQuery.isLoading ? (
        <Text selectable style={{ fontSize: 14, lineHeight: 21, color: platformColors.secondaryLabel }}>
          Assignment details are only available in Moodle.
        </Text>
      ) : null}

      {assignmentFiles.length > 0 ? <FilesSection title="Attached files" files={assignmentFiles} /> : null}

      {canEdit ? (
        <View style={{ gap: 10 }}>
          <Text selectable style={{ fontSize: 19, fontWeight: "700", color: platformColors.label }}>
            File submission
          </Text>

          {typeof maxSubmissionBytes === "number" && maxSubmissionBytes > 0 ? (
            <Text selectable style={{ fontSize: 13, color: platformColors.secondaryLabel }}>
              Max file size: {formatBytes(maxSubmissionBytes)}
            </Text>
          ) : null}

          {typeof maxFileSubmissions === "number" && maxFileSubmissions > 0 ? (
            <Text selectable style={{ fontSize: 13, color: platformColors.secondaryLabel }}>
              Files allowed: {existingFiles.length} / {maxFileSubmissions}
            </Text>
          ) : null}

          <PrimaryButton
            label={
              uploadMutation.isPending
                ? uploadProgress != null
                  ? `Uploading ${Math.round(uploadProgress * 100)}%`
                  : "Picking…"
                : "Pick file"
            }
            variant="tinted"
            onPress={() => {
              setStatusMessage(null);
              uploadMutation.mutate();
            }}
            disabled={
              uploadMutation.isPending ||
              submitMutation.isPending ||
              (typeof maxFileSubmissions === "number" && maxFileSubmissions > 0 && existingFiles.length >= maxFileSubmissions)
            }
          />

          {existingFiles.length > 0 ? (
            <View style={{ gap: 6 }}>
              {existingFiles.map((file, index) => (
                <Text key={`${file.filename ?? "file"}:${index}`} selectable style={{ fontSize: 13, color: platformColors.secondaryLabel }}>
                  {file.filename ?? "File"}
                  {typeof file.filesize === "number" ? ` · ${formatBytes(file.filesize)}` : ""}
                </Text>
              ))}
            </View>
          ) : null}

          <PrimaryButton
            label={submitMutation.isPending ? "Submitting…" : "Submit"}
            disabled={!canSubmit || uploadMutation.isPending || submitMutation.isPending}
            onPress={() => {
              setStatusMessage(null);
              submitMutation.mutate();
            }}
          />

          {statusMessage ? (
            <Text selectable style={{ fontSize: 13, color: platformColors.secondaryLabel }}>
              {statusMessage}
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

function getDueTint(dueTimestamp: number) {
  const now = Date.now() / 1000;
  const delta = dueTimestamp - now;
  const day = 24 * 60 * 60;
  if (delta < 0) return "#FF3B30"; // overdue red
  if (delta < day) return "#FF9500"; // today orange
  return undefined;
}

function getAssignConfigValue(
  configs: readonly AssignmentConfig[] | undefined,
  subtype: string,
  plugin: string,
  name: string,
) {
  return configs?.find(
    (config) => config.subtype === subtype && config.plugin === plugin && config.name === name,
  )?.value;
}

function parseIntPositive(value: string | undefined) {
  if (!value) {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function buildPickerMimeType(filetypesList: string | undefined) {
  if (!filetypesList) {
    return undefined;
  }

  const token = filetypesList
    .split(/[\s,]+/)
    .map((value) => value.trim().toLowerCase())
    .find((value) => value.length > 0 && value !== "*" && value !== ".*");

  if (!token) {
    return undefined;
  }

  if (token.includes("/")) {
    return token;
  }

  if (!token.startsWith(".")) {
    return undefined;
  }

  return extensionToMime(token);
}

function extensionToMime(extension: string) {
  switch (extension) {
    case ".pdf":
      return "application/pdf";
    case ".doc":
      return "application/msword";
    case ".docx":
      return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    case ".xls":
      return "application/vnd.ms-excel";
    case ".xlsx":
      return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    case ".ppt":
      return "application/vnd.ms-powerpoint";
    case ".pptx":
      return "application/vnd.openxmlformats-officedocument.presentationml.presentation";
    case ".txt":
      return "text/plain";
    case ".csv":
      return "text/csv";
    case ".zip":
      return "application/zip";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".png":
      return "image/png";
    default:
      return undefined;
  }
}

function mergeAssignmentFiles(...groups: Array<readonly CoreWSExternalFile[] | undefined>) {
  const filesByUrl = new Map<string, CoreWSExternalFile>();

  for (const group of groups) {
    for (const file of group ?? []) {
      if (!file.fileurl || filesByUrl.has(file.fileurl)) {
        continue;
      }

      filesByUrl.set(file.fileurl, file);
    }
  }

  return [...filesByUrl.values()];
}

function getAssignmentDescription(input: {
  moduleDescription?: string;
  intro?: string;
  activity?: string;
}) {
  const activity = input.activity?.trim();
  const intro = input.intro?.trim();
  const moduleDescription = input.moduleDescription?.trim();

  if (activity && !sameHtml(activity, moduleDescription) && !sameHtml(activity, intro)) {
    return activity;
  }

  if (intro && !sameHtml(intro, moduleDescription)) {
    return intro;
  }

  return undefined;
}

function sameHtml(left?: string, right?: string) {
  if (!left || !right) {
    return false;
  }

  return normalizeHtmlForComparison(left) === normalizeHtmlForComparison(right);
}

function normalizeHtmlForComparison(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

async function uploadAssignmentDraftFile(input: {
  siteOrigin: string;
  token: string;
  file: File;
  itemId?: number;
  onProgress?: (value: number) => void;
}) {
  const uploadUrl = new URL("/webservice/upload.php", input.siteOrigin);
  uploadUrl.searchParams.set("token", input.token);
  uploadUrl.searchParams.set("filepath", "/");
  uploadUrl.searchParams.set("itemid", String(input.itemId ?? 0));
  uploadUrl.searchParams.set("filearea", "draft");

  const task = createUploadTask(
    uploadUrl.toString(),
    input.file.uri,
    {
      httpMethod: "POST",
      uploadType: FileSystemUploadType.MULTIPART,
      fieldName: "file",
      mimeType: input.file.type || "application/octet-stream",
      sessionType: FileSystemSessionType.BACKGROUND,
    },
    (event) => {
      if (event.totalBytesExpectedToSend > 0) {
        input.onProgress?.(event.totalBytesSent / event.totalBytesExpectedToSend);
      }
    },
  );

  const response = await task.uploadAsync();
  if (!response) {
    throw new Error("Upload cancelled");
  }

  if (response.status < 200 || response.status >= 300) {
    throw new Error(`Upload failed (${response.status})`);
  }

  const payload = JSON.parse(response.body) as Array<{ itemid?: number; error?: string }>;
  const first = payload?.[0];

  if (first?.error) {
    throw new Error(first.error);
  }

  if (typeof first?.itemid !== "number") {
    throw new Error("Upload returned no draft item id");
  }

  return first.itemid;
}
