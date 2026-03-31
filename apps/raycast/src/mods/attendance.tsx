import { normalizeNetworkError } from "@moodle/core";
import { Action, ActionPanel, Color, Icon, List, Toast, showToast } from "@raycast/api";
import { useQuery } from "@tanstack/react-query";
import { memo, useContext, useMemo } from "react";

import { getUser } from "../client";
import DatesDetail from "../components/DatesDetail";
import { OpenInBrowserAction } from "../components/OpenInBrowserAction";
import { HiddenItemActionsSection } from "../components/WithHiddenItems";
import CourseContext from "../course-context";
import { stripHTML } from "../helpers";
import { turndown } from "../helpers/markdown";
import { getMoodleErrorMessage, isMoodleErrorPayload } from "../helpers/moodle-errors";
import { siteOrigin } from "../helpers/preferences";
import { queryClient } from "../hooks/useWSQuery";
import { Module } from "../types";
import type { AddonModAttendanceMobileViewActivityWSResponse } from "../types/attendance";
import DefaultListItem from "./default";

type AttendanceSummaryItem = {
  title: string;
  value: string;
};

type MobileSessionItem = {
  time: string;
  sessionid?: number;
};

const ATTENDANCE_TRANSLATIONS: Record<string, string> = {
  "plugin.mod_attendance.sessionscompleted": "Sessions Completed",
  "plugin.mod_attendance.pointssessionscompleted": "Points (Completed Sessions)",
  "plugin.mod_attendance.percentagesessionscompleted": "Percentage (Completed Sessions)",
  "plugin.mod_attendance.sessionstotal": "Sessions Total",
  "plugin.mod_attendance.pointsallsessions": "Points (All Sessions)",
  "plugin.mod_attendance.percentageallsessions": "Percentage (All Sessions)",
  "plugin.mod_attendance.maxpossiblepoints": "Max Possible Points",
  "plugin.mod_attendance.maxpossiblepercentage": "Max Possible Percentage",
  "plugin.mod_attendance.submitattendance": "Submit Attendance",
};

function AttendanceListItem({ module }: { module: Module }) {
  const ctx = useContext(CourseContext);
  const { activeCourse } = ctx;
  const mobileViewQuery = useAttendanceMobileViewData(module, activeCourse.id);

  const summaryItems = useMemo(() => extractAttendanceSummaryItems(mobileViewQuery.data), [mobileViewQuery.data]);
  const mobileSessions = useMemo(() => extractMobileSessions(mobileViewQuery.data), [mobileViewQuery.data]);

  return (
    <DefaultListItem
      module={module}
      icon={Icon.PersonLines}
      detail={
        <AttendanceListItemDetail
          module={module}
          summaryItems={summaryItems}
          mobileSessions={mobileSessions}
          mobileError={mobileViewQuery.error}
          isLoading={mobileViewQuery.isPending}
        />
      }
      actions={
        <ActionPanel>
          <MarkAsAttendedAction
            module={module}
            courseid={activeCourse.id}
            mobileViewData={mobileViewQuery.data}
            onDone={() => mobileViewQuery.refetch()}
          />
          {module.url && <OpenInBrowserAction url={module.url} />}
          <HiddenItemActionsSection item={module} />
        </ActionPanel>
      }
    />
  );
}

export default memo(AttendanceListItem);

function AttendanceListItemDetail({
  module,
  summaryItems,
  mobileSessions,
  mobileError,
  isLoading,
}: {
  module: Module;
  summaryItems: AttendanceSummaryItem[];
  mobileSessions: MobileSessionItem[];
  mobileError: Error | null;
  isLoading: boolean;
}) {
  const openMobileSession = mobileSessions.find((item) => item.sessionid != null);
  const sessionTime = openMobileSession?.time ?? mobileSessions[0]?.time ?? "Unavailable";
  const intro = turndown(module.description || "").trim();

  return (
    <List.Item.Detail
      isLoading={isLoading}
      markdown={intro}
      metadata={
        <List.Item.Detail.Metadata>
          <List.Item.Detail.Metadata.Label
            title="Session Open"
            text={
              openMobileSession ? { value: "Yes", color: Color.Green } : { value: "No", color: Color.SecondaryText }
            }
          />
          <List.Item.Detail.Metadata.Label title="Session Time" text={sessionTime} />
          {summaryItems.map((item) => (
            <List.Item.Detail.Metadata.Label key={`${item.title}:${item.value}`} title={item.title} text={item.value} />
          ))}
          {summaryItems.length === 0 && mobileError && (
            <List.Item.Detail.Metadata.Label title="Mobile Summary" text={mobileError.message || "Failed to load"} />
          )}
          <DatesDetail module={module} />
        </List.Item.Detail.Metadata>
      }
    />
  );
}

function useAttendanceMobileViewData(module: Module, courseid: number) {
  return useQuery(
    {
      queryKey: ["tool_mobile_get_content", "mod_attendance", "mobile_view_activity", module.id, courseid],
      retry: false,
      queryFn: async () => {
        const user = await getUser();
        return await requestAttendanceMobileViaToolMobileGetContent({
          cmid: module.id,
          courseid,
          method: "mobile_view_activity",
          extraArgs: [["userid", user.id]],
        });
      },
    },
    queryClient,
  );
}

function MarkAsAttendedAction({
  module,
  courseid,
  mobileViewData,
  onDone,
}: {
  module: Module;
  courseid: number;
  mobileViewData: AddonModAttendanceMobileViewActivityWSResponse | undefined;
  onDone: () => void;
}) {
  return (
    <Action
      title="Mark as Attended"
      icon={Icon.CheckCircle}
      onAction={async () => {
        const mobileViewQueryKey = [
          "tool_mobile_get_content",
          "mod_attendance",
          "mobile_view_activity",
          module.id,
          courseid,
        ] as const;
        const user = await getUser();
        let sessionid = extractFirstOpenSessionId(mobileViewData);
        const toast = await showToast({
          style: Toast.Style.Animated,
          title: sessionid ? "Marking attendance" : "Refreshing attendance sessions",
        });

        if (!sessionid) {
          try {
            const refreshedMobileViewData = await requestAttendanceMobileViaToolMobileGetContent({
              cmid: module.id,
              courseid,
              method: "mobile_view_activity",
              extraArgs: [["userid", user.id]],
            });

            queryClient.setQueryData(mobileViewQueryKey, refreshedMobileViewData);
            sessionid = extractFirstOpenSessionId(refreshedMobileViewData);
          } catch (error) {
            toast.style = Toast.Style.Failure;
            toast.title = "Failed to refresh attendance";
            toast.message = error instanceof Error ? error.message : "Unknown error";
            return;
          }

          if (!sessionid) {
            toast.style = Toast.Style.Failure;
            toast.title = "No open attendance session";
            toast.message = "No open session is currently available.";
            return;
          }

          toast.title = "Marking attendance";
        }

        try {
          const mobileUserForm = await requestAttendanceMobileViaToolMobileGetContent({
            cmid: module.id,
            courseid,
            method: "mobile_user_form",
            extraArgs: [
              ["sessid", sessionid],
              ["userid", user.id],
            ],
          });

          const statusid = extractFirstAvailableStatusIdFromMobileUserForm(mobileUserForm);
          if (!statusid) {
            throw new Error("No available attendance status for this session.");
          }

          const updatedMobileViewData = await requestAttendanceMobileViaToolMobileGetContent({
            cmid: module.id,
            courseid,
            method: "mobile_view_activity",
            extraArgs: [
              ["sessid", sessionid],
              ["status", statusid],
              ["userid", user.id],
            ],
          });
          queryClient.setQueryData(mobileViewQueryKey, updatedMobileViewData);

          await Promise.all([
            queryClient.invalidateQueries({
              queryKey: mobileViewQueryKey,
            }),
            queryClient.invalidateQueries({ queryKey: ["core_course_get_contents"] }),
          ]);

          toast.style = Toast.Style.Success;
          toast.title = "Attendance marked";
          onDone();
        } catch (error) {
          toast.style = Toast.Style.Failure;
          toast.title = "Failed to mark attendance";
          toast.message = error instanceof Error ? error.message : "Unknown error";
        }
      }}
    />
  );
}

async function requestAttendanceMobileViaToolMobileGetContent({
  cmid,
  courseid,
  method,
  extraArgs = [],
}: {
  cmid: number;
  courseid: number;
  method: "mobile_view_activity" | "mobile_user_form";
  extraArgs?: Array<[string, string | number]>;
}): Promise<AddonModAttendanceMobileViewActivityWSResponse> {
  const { token } = await getUser();

  const body = new URLSearchParams();
  body.set("wsfunction", "tool_mobile_get_content");
  body.set("wstoken", token);
  body.set("moodlewsrestformat", "json");
  body.set("moodlewssettinglang", "en");
  body.set("moodlewssettingfilter", "true");
  body.set("moodlewssettingfileurl", "true");
  body.set("component", "mod_attendance");
  body.set("method", method);

  const args: Array<[string, string | number]> = [
    ["appcustomurlscheme", "moodlemobile"],
    ["appid", "com.moodle.moodlemobile"],
    ["appisdesktop", 0],
    ["appismobile", 1],
    ["appiswide", 1],
    ["applang", "en"],
    ["appplatform", "browser"],
    ["appversioncode", 50003],
    ["appversionname", "5.0.0"],
    ["cmid", cmid],
    ["courseid", courseid],
    ...extraArgs,
  ];

  for (let i = 0; i < args.length; i++) {
    const [name, value] = args[i];
    body.set(`args[${i}][name]`, name);
    body.set(`args[${i}][value]`, String(value));
  }

  let response: Response;
  try {
    response = await fetch(`${siteOrigin}/webservice/rest/server.php`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
  } catch (error) {
    throw normalizeNetworkError(error);
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    payload = undefined;
  }

  if (!response.ok || isMoodleErrorPayload(payload)) {
    throw new Error(getMoodleErrorMessage(payload) ?? response.statusText ?? "Failed to load attendance data");
  }

  return payload as AddonModAttendanceMobileViewActivityWSResponse;
}

function extractFirstOpenSessionId(data: AddonModAttendanceMobileViewActivityWSResponse | undefined) {
  return extractMobileSessions(data).find((item) => item.sessionid != null)?.sessionid ?? null;
}

function extractFirstAvailableStatusIdFromMobileUserForm(
  data: AddonModAttendanceMobileViewActivityWSResponse | undefined,
) {
  const html = getMobileTemplatesHtml(data);
  if (!html) return null;

  // Moodle mobile user form renders available statuses in grade-desc order.
  // Picking the first radio value matches the plugin's "highest available status" behavior.
  const match = html.match(/<ion-radio[^>]*\bvalue=(['"])(\d+)\1/i);
  const statusid = match?.[2];
  return statusid ? Number(statusid) : null;
}

function extractAttendanceSummaryItems(
  data: AddonModAttendanceMobileViewActivityWSResponse | undefined,
): AttendanceSummaryItem[] {
  const html = getMobileTemplatesHtml(data);
  if (!html) return [];

  const items: AttendanceSummaryItem[] = [];
  const seen = new Set<string>();
  const rowPattern =
    /<ion-row>[\s\S]*?<ion-col[^>]*>([\s\S]*?)<\/ion-col>[\s\S]*?<ion-col[^>]*>([\s\S]*?)<\/ion-col>[\s\S]*?<\/ion-row>/gi;

  for (const match of html.matchAll(rowPattern)) {
    const rawLabel = normalizeText(stripHTML(match[1] ?? ""));
    const rawValue = normalizeText(stripHTML(match[2] ?? ""));
    if (!rawLabel || !rawValue) continue;

    const title = translateAttendanceLabel(rawLabel);
    const key = `${title}::${rawValue}`;
    if (seen.has(key)) continue;

    seen.add(key);
    items.push({ title, value: rawValue });
  }

  return items;
}

function extractMobileSessions(data: AddonModAttendanceMobileViewActivityWSResponse | undefined): MobileSessionItem[] {
  const html = getMobileTemplatesHtml(data);
  if (!html) return [];

  const sessions: MobileSessionItem[] = [];
  const seen = new Set<string>();
  const itemPattern = /<ion-item>[\s\S]*?<h2>([\s\S]*?)<\/h2>[\s\S]*?<\/ion-item>/gi;

  for (const match of html.matchAll(itemPattern)) {
    const block = match[0] ?? "";
    const timeText = normalizeText(stripHTML(match[1] ?? ""));
    if (!timeText) continue;

    const idMatch = block.match(/sessid\s*:\s*(\d+)/i);
    const sessionid = idMatch?.[1] ? Number(idMatch[1]) : undefined;
    const key = `${timeText}::${sessionid ?? ""}`;
    if (seen.has(key)) continue;

    seen.add(key);
    sessions.push({ time: timeText, sessionid });
  }

  return sessions;
}

function translateAttendanceLabel(input: string): string {
  const keyMatch = input.match(/plugin\.mod_attendance\.[a-z_]+/i);
  if (keyMatch?.[0]) {
    const key = keyMatch[0].toLowerCase();
    return ATTENDANCE_TRANSLATIONS[key] ?? humanizeAttendanceKey(key);
  }

  return input;
}

function humanizeAttendanceKey(key: string): string {
  const last = key.split(".").pop() ?? key;
  return last
    .replace(/_/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .replace(/^./, (char) => char.toUpperCase());
}

function getMobileTemplatesHtml(data: AddonModAttendanceMobileViewActivityWSResponse | undefined): string {
  return (data?.templates ?? [])
    .map((template) => template?.html)
    .filter((html): html is string => typeof html === "string" && html.trim().length > 0)
    .join("\n");
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}
