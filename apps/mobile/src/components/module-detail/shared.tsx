import { useQuery } from "@tanstack/react-query";
import { type ReactNode } from "react";
import { Pressable, Text, View } from "react-native";

import { platformColors } from "@/constants/platform-colors";

import { NativeIconButton } from "@/components/native-icon-button";
import type { CoreCourseModuleContentFile, CoreWSExternalFile, CourseScope, ScopedModule } from "@moodle/core";
import { cleanMoodleHtml, cleanMoodleText, handleMoodleFileUrl } from "@moodle/core";

import { openExternalUrl } from "@/lib/browser";
import { previewRemoteDocument } from "@/lib/document-preview";
import { buildAutologinRedirectUrl } from "@/lib/moodle-client";
import { useAppState } from "@/providers/app-provider";

export function ModuleDateFacts({ module }: { module: ScopedModule }) {
  const isAssignmentModule = module.module.modname === "assign";

  const facts = [
    isAssignmentModule
      ? null
      : getDateFact(
          module.module.dates?.find((item) => item.dataid === "availablefrom")?.label,
          module.module.dates?.find((item) => item.dataid === "availablefrom")?.timestamp,
        ),
    getDateFact(
      module.module.dates?.find((item) => item.dataid === "timeopen")?.label,
      module.module.dates?.find((item) => item.dataid === "timeopen")?.timestamp,
    ),
    isAssignmentModule
      ? null
      : getDateFact(
          module.module.dates?.find((item) => item.dataid === "duedate")?.label,
          module.module.dates?.find((item) => item.dataid === "duedate")?.timestamp,
        ),
    getDateFact(
      module.module.dates?.find((item) => item.dataid === "timeclose")?.label,
      module.module.dates?.find((item) => item.dataid === "timeclose")?.timestamp,
    ),
    getDateFact("Completed", module.module.completiondata?.timecompleted),
  ].filter((item): item is { label: string; value: string } => Boolean(item));

  if (facts.length === 0) {
    return null;
  }

  const labelColor = platformColors.label;
  const label2Color = platformColors.secondaryLabel;
  const fillColor = platformColors.secondarySystemBackground;

  return (
    <View style={{ gap: 10 }}>
      {facts.map((fact) => (
        <View
          key={fact.label}
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            gap: 12,
            paddingHorizontal: 14,
            paddingVertical: 12,
            borderRadius: 12,
            borderCurve: "continuous",
            backgroundColor: fillColor,
          }}
        >
          <Text selectable style={{ flex: 1, fontSize: 14, fontWeight: "600", color: label2Color }}>
            {fact.label}
          </Text>
          <Text selectable style={{ fontSize: 14, fontWeight: "700", color: labelColor }}>
            {fact.value}
          </Text>
        </View>
      ))}
    </View>
  );
}

type RenderableFile = Pick<
  CoreCourseModuleContentFile | CoreWSExternalFile,
  "filename" | "filepath" | "filesize" | "fileurl" | "timemodified" | "mimetype"
>;

export function FilesSection({ title, files }: { title: string; files: readonly RenderableFile[] }) {
  const { activeAccount, accountSession } = useAppState();
  const labelColor = platformColors.label;
  const label2Color = platformColors.secondaryLabel;
  const fillColor = platformColors.secondarySystemBackground;
  const session = activeAccount ? accountSession(activeAccount.id) : null;

  if (files.length === 0) {
    return null;
  }

  return (
    <View style={{ gap: 10 }}>
      <Text selectable style={{ fontSize: 19, fontWeight: "700", color: labelColor }}>
        {title}
      </Text>
      {files.map((file) => {
        const fileUrl = file.fileurl;
        return (
          <Pressable
            key={`${file.filename ?? file.filepath ?? "file"}:${file.timemodified ?? 0}`}
            accessibilityRole="button"
            accessibilityLabel={[
              file.filename ?? file.filepath ?? "File",
              file.mimetype,
              typeof file.filesize === "number" ? formatBytes(file.filesize) : undefined,
            ]
              .filter(Boolean)
              .join(", ")}
            onPress={async () => {
              if (!session || !fileUrl) return;
              await previewRemoteDocument({
                url: handleMoodleFileUrl({
                  url: fileUrl,
                  accessKey: session.accessKey,
                  siteOrigin: activeAccount?.origin,
                }),
                fileName: file.filename ?? undefined,
                mimeType: file.mimetype ?? undefined,
              });
            }}
            style={({ pressed }) => ({
              gap: 4,
              paddingHorizontal: 14,
              paddingVertical: 12,
              borderRadius: 12,
              borderCurve: "continuous",
              backgroundColor: fillColor,
              opacity: pressed ? 0.82 : 1,
            })}
          >
            <Text selectable style={{ fontSize: 15, fontWeight: "700", color: labelColor }}>
              {file.filename ?? file.filepath ?? "File"}
            </Text>
            <Text selectable style={{ fontSize: 13, color: label2Color }}>
              {[file.mimetype, typeof file.filesize === "number" ? formatBytes(file.filesize) : undefined]
                .filter(Boolean)
                .join(" · ") || "Remote file"}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function FactSection({
  title,
  rows,
  description,
  isLoading,
  emptyCopy,
}: {
  title: string;
  rows: readonly { label: string; value: string }[];
  description?: ReactNode;
  isLoading?: boolean;
  emptyCopy: string;
}) {
  const labelColor = platformColors.label;
  const label2Color = platformColors.secondaryLabel;
  const fillColor = platformColors.secondarySystemBackground;

  return (
    <View style={{ gap: 10 }}>
      <Text selectable style={{ fontSize: 19, fontWeight: "700", color: labelColor }}>
        {title}
      </Text>
      {rows.map((row) => (
        <View
          key={row.label}
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            gap: 12,
            paddingHorizontal: 14,
            paddingVertical: 12,
            borderRadius: 12,
            borderCurve: "continuous",
            backgroundColor: fillColor,
          }}
        >
          <Text selectable style={{ flex: 1, fontSize: 14, fontWeight: "600", color: label2Color }}>
            {row.label}
          </Text>
          <Text selectable style={{ flex: 1, fontSize: 14, fontWeight: "700", textAlign: "right", color: labelColor }}>
            {row.value}
          </Text>
        </View>
      ))}
      {description ? description : null}
      {isLoading && rows.length === 0 ? (
        <Text selectable style={{ fontSize: 14, lineHeight: 21, color: label2Color }}>
          Loading…
        </Text>
      ) : null}
      {!description && rows.length === 0 && !isLoading ? (
        <Text selectable style={{ fontSize: 14, lineHeight: 21, color: label2Color }}>
          {emptyCopy}
        </Text>
      ) : null}
    </View>
  );
}

export function ModuleDetailCard({
  title,
  rows,
  description,
  emptyCopy,
  children,
}: {
  title: string;
  rows: readonly { label: string; value: string }[];
  description?: ReactNode;
  emptyCopy: string;
  children?: ReactNode;
}) {
  return (
    <View style={{ gap: 12 }}>
      <FactSection title={title} rows={rows} description={description} emptyCopy={emptyCopy} />
      {children ?? null}
    </View>
  );
}

export function ReadableTextBlock({
  title,
  content,
  isLoading,
  emptyCopy,
  subtle = false,
}: {
  title: string;
  content?: ReactNode;
  isLoading?: boolean;
  emptyCopy: string;
  subtle?: boolean;
}) {
  const labelColor = platformColors.label;
  const label2Color = platformColors.secondaryLabel;
  const fillColor = platformColors.secondarySystemBackground;

  return (
    <View
      style={{
        gap: 10,
        paddingHorizontal: 14,
        paddingVertical: 14,
        borderRadius: 16,
        borderCurve: "continuous",
        backgroundColor: subtle ? fillColor : "transparent",
      }}
    >
      <Text selectable style={{ fontSize: 19, fontWeight: "700", color: labelColor }}>
        {title}
      </Text>
      {isLoading ? (
        <Text selectable style={{ fontSize: 15, lineHeight: 23, color: label2Color }}>
          Loading…
        </Text>
      ) : content ? (
        content
      ) : (
        <Text selectable style={{ fontSize: 15, lineHeight: 23, color: label2Color }}>
          {emptyCopy}
        </Text>
      )}
    </View>
  );
}

export function OpenInMoodleButton({ scope, module }: { scope: CourseScope; module: ScopedModule }) {
  const { activeAccount, accountSession } = useAppState();
  const session = activeAccount ? accountSession(activeAccount.id) : null;

  if (!session || !activeAccount) {
    return null;
  }

  return (
    <NativeIconButton
      label="Open in Moodle"
      systemImage="globe"
      onPress={async () => {
        const url = await buildAutologinRedirectUrl({
          siteOrigin: activeAccount.origin,
          session,
          destinationUrl: module.module.url ?? `${activeAccount.origin}/course/view.php?id=${scope.mergedCourse.id}`,
        });
        await openExternalUrl(url);
      }}
    />
  );
}

export function useRemoteModuleHtml(content: CoreCourseModuleContentFile | undefined) {
  const { activeAccount, accountSession } = useAppState();
  const session = activeAccount ? accountSession(activeAccount.id) : null;

  return useQuery({
    queryKey: ["moodle", "module-text", activeAccount?.id, content?.fileurl, content?.timemodified],
    enabled: Boolean(content?.fileurl && session),
    queryFn: async () => {
      if (!content?.fileurl || !session) {
        return "";
      }

      const response = await fetch(
        handleMoodleFileUrl({
          url: content.fileurl,
          accessKey: session.accessKey,
          siteOrigin: activeAccount?.origin,
        }),
      );
      return await response.text();
    },
  });
}

export function getVisibleFiles(module: ScopedModule) {
  return (module.module.contents ?? []).filter((file) => {
    if (module.module.modname === "page") {
      return file.filename !== "index.html";
    }

    if (module.module.modname === "book") {
      return file.filename !== "structure" && !file.fileurl?.includes("/mod_book/chapter/");
    }

    return true;
  });
}

export function getFactRow(label: string, value?: string) {
  if (!value) {
    return null;
  }

  return { label, value };
}

export function compactFactRows(
  ...rows: Array<ReturnType<typeof getFactRow>>
) {
  return rows.filter((item): item is { label: string; value: string } => Boolean(item));
}

export function useModuleDetailAdapter() {
  const { activeAccount, accountSession, refreshAccountSession } = useAppState();
  const session = activeAccount ? accountSession(activeAccount.id) : null;

  return {
    activeAccount,
    session,
    adapter:
      activeAccount && session
        ? {
            siteOrigin: activeAccount.origin,
            session,
            refreshSession: async () => await refreshAccountSession(activeAccount.id),
          }
        : null,
  };
}

export function getDateFact(label: string | undefined, timestamp: number | undefined) {
  if (!label || !timestamp) {
    return null;
  }

  return {
    label: cleanMoodleText(label),
    value: formatFactDate(timestamp),
  };
}

export function formatFactDate(timestamp?: number) {
  if (!timestamp || timestamp <= 0) {
    return undefined;
  }

  return FACT_DATE_FORMATTER.format(new Date(timestamp * 1000));
}

export function formatSubmissionStatus(status?: string) {
  if (!status) {
    return undefined;
  }

  switch (status) {
    case "draft":
      return "Draft";
    case "new":
      return "No submission";
    case "noattempt":
      return "No attempt";
    case "nosubmission":
      return "No submission";
    case "noonlinesubmissions":
      return "No online submissions";
    case "reopened":
      return "Reopened";
    case "submitted":
      return "Submitted";
    case "gradedfollowupsubmit":
      return "Graded - resubmitted";
    default:
      return formatStatusLabel(status);
  }
}

export function formatStatusLabel(value: string) {
  const compactLabels: Record<string, string> = {
    graded: "Graded",
    notgraded: "Not graded",
    released: "Released",
    gradedfollowupsubmit: "Graded - resubmitted",
    inmarking: "In marking",
    inreview: "In review",
    notmarked: "Not marked",
    readyforreview: "Marking completed",
    readyforrelease: "Ready for release",
    needgrading: "Needs grading",
  };

  const normalized = value.trim().toLowerCase();
  const compactLabel = compactLabels[normalized];
  if (compactLabel) {
    return compactLabel;
  }

  return value.replace(/[_-]+/g, " ").replace(/\b\w/g, (match) => match.toUpperCase());
}

export function formatModuleKind(modname: string) {
  switch (modname) {
    case "assign":
      return "Assignment";
    case "attendance":
      return "Attendance";
    case "crfeedback":
    case "feedback":
      return "Feedback";
    case "quiz":
      return "Quiz";
    case "resource":
      return "Resource";
    case "folder":
      return "Folder";
    case "forum":
      return "Forum";
    case "label":
      return "Note";
    case "page":
      return "Page";
    case "book":
      return "Book";
    case "choice":
      return "Choice";
    case "url":
      return "Link";
    default:
      return formatStatusLabel(modname);
  }
}

export function summarizeHost(value?: string) {
  if (!value) {
    return undefined;
  }

  try {
    return new URL(value).host;
  } catch {
    return value;
  }
}

export function summarizePath(value?: string) {
  if (!value) {
    return undefined;
  }

  try {
    const parsed = new URL(value);
    return parsed.pathname.replace(/\/+$/, "") || "/";
  } catch {
    return undefined;
  }
}

export function humanizeMimeType(value?: string) {
  if (!value) {
    return undefined;
  }

  switch (value) {
    case "application/pdf":
      return "PDF";
    case "text/html":
      return "HTML";
    case "text/plain":
      return "Text";
    default:
      return value
        .replace(/^application\//, "")
        .replace(/^text\//, "")
        .replace(/[-_.]+/g, " ")
        .replace(/\b\w/g, (match) => match.toUpperCase());
  }
}

export function formatCompletionState(state?: number) {
  switch (state) {
    case 0:
      return "Incomplete";
    case 1:
      return "Complete";
    case 2:
      return "Passed";
    case 3:
      return "Failed";
    default:
      return undefined;
  }
}

export function formatAttemptsSummary(count: number, limit?: number) {
  if (typeof limit !== "number" || limit < 0) {
    return String(count);
  }

  return `${count} / ${limit}`;
}

export function trimNumber(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/\.?0+$/, "");
}

export function formatDuration(seconds: number) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.round((seconds % 3600) / 60);

  if (hours > 0 && minutes > 0) {
    return `${hours}h ${minutes}m`;
  }

  if (hours > 0) {
    return `${hours}h`;
  }

  return `${minutes}m`;
}

export function formatBytes(bytes: number) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1).replace(/\.0$/, "")} KB`;
  }

  if (bytes < 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1).replace(/\.0$/, "")} MB`;
  }

  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1).replace(/\.0$/, "")} GB`;
}

export function formatReadableHtml(html: string) {
  if (!html) {
    return "";
  }

  return cleanMoodleHtml(html)
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

const FACT_DATE_FORMATTER = new Intl.DateTimeFormat("en", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});
