import { Action, ActionPanel, Color, Icon, Keyboard } from "@raycast/api";
import { getProgressIcon } from "@raycast/utils";
import { useContext, useMemo } from "react";
import { HiddenItemActionsSection } from "../components/WithHiddenItems";
import CourseContext from "../course-context";
import { formatBytes, shortcut } from "../helpers";
import { canConvert, checkFileSize, getFilePath, handleFileUrl, pdfify } from "../helpers/files";
import { preferences } from "../helpers/preferences";
import { useFileSyncExceptionsStore, useFileSyncProgressStore } from "../store";
import { CoreWSExternalFile, Course, Module } from "../types";
import DefaultListItem from "./default";

const syncEnabled = Boolean(preferences.sync_folder);

export default function ResourceListItem({ module, content }: { module: Module; content?: CoreWSExternalFile }) {
  const fileContent: CoreWSExternalFile | undefined = content ?? module.contents?.[0];
  const course = useContext(CourseContext) as Course;
  const path = useMemo(
    () => (fileContent ? getFilePath(fileContent, module, course) : ""),
    [fileContent, module, course],
  );
  const progress = useFileSyncProgressStore((state) => state.progress.get(path));
  const isException = useFileSyncExceptionsStore((state) => state.exceptions.includes(path));
  const addException = useFileSyncExceptionsStore((state) => state.addException);
  const fileSize = fileContent?.filesize ?? 0;
  let filename = fileContent?.filename ?? module.name;
  const downloadProgress = progress?.progress ?? 0;
  const convertProgress = progress?.convertProgress;
  const fileUrl = useMemo(() => (fileContent ? handleFileUrl(fileContent.fileurl) : ""), [fileContent]);

  // If no file content is available, render a fallback.
  if (!fileContent) {
    return <DefaultListItem module={module} icon={Icon.Document} />;
  }

  if (syncEnabled && checkFileSize(fileSize) && !isException) {
    return (
      <DefaultListItem
        module={module}
        contentFilename={filename}
        title={filename}
        icon={Icon.Download}
        accessories={[{ text: { value: formatBytes(fileSize), color: Color.Red } }]}
        actions={
          <ActionPanel>
            <Action title="Download File" icon={Icon.Download} onAction={() => addException(path)} />
            <Action.OpenInBrowser url={fileUrl} />
            <Action.CopyToClipboard title="Copy URL" shortcut={Keyboard.Shortcut.Common.Copy} content={fileUrl} />
            <HiddenItemActionsSection item={module} />
          </ActionPanel>
        }
      />
    );
  }

  if (!syncEnabled || downloadProgress < 100) {
    return (
      <DefaultListItem
        module={module}
        contentFilename={filename}
        title={filename}
        icon={syncEnabled ? getProgressIcon(downloadProgress / 100 || 0, Color.Orange) : Icon.Document}
        actions={
          <ActionPanel>
            <Action.OpenInBrowser url={fileUrl} />
            <Action.CopyToClipboard title="Copy URL" shortcut={Keyboard.Shortcut.Common.Copy} content={fileUrl} />
            <HiddenItemActionsSection item={module} />
          </ActionPanel>
        }
      />
    );
  }

  let filePath = path;

  if (convertProgress === 100 && canConvert(fileContent.mimetype)) {
    filename = pdfify(filename);
    filePath = pdfify(path);
  }

  return (
    <DefaultListItem
      module={module}
      contentFilename={filename}
      title={filename}
      icon={
        typeof convertProgress === "number" && convertProgress < 100
          ? getProgressIcon((convertProgress || 0) / 100 || 0, Color.Blue)
          : {
              fileIcon: filePath,
            }
      }
      quickLook={{ path: filePath }}
      actions={
        <ActionPanel>
          <Action.Open title="Open File" target={filePath} icon={Icon.Document} />
          <Action.ShowInFinder title="Show in Finder" path={filePath} />
          <Action.ToggleQuickLook />
          <Action.OpenWith title="Open with" path={filePath} shortcut={Keyboard.Shortcut.Common.OpenWith} />
          <ActionPanel.Section>
            <Action.CreateQuicklink
              title="Create Quicklink"
              quicklink={{ link: filePath }}
              icon={Icon.Link}
              shortcut={shortcut("l", ["shift"])}
            />
          </ActionPanel.Section>
          <ActionPanel.Section>
            <Action.CopyToClipboard title="Copy File" shortcut={shortcut(".")} content={{ file: filePath }} />
            <Action.CopyToClipboard title="Copy Name" shortcut={Keyboard.Shortcut.Common.CopyName} content={filename} />
            <Action.CopyToClipboard title="Copy Path" shortcut={Keyboard.Shortcut.Common.CopyPath} content={filePath} />
            <Action.CopyToClipboard title="Copy URL" shortcut={Keyboard.Shortcut.Common.Copy} content={fileUrl} />
          </ActionPanel.Section>
          <HiddenItemActionsSection item={module} />
        </ActionPanel>
      }
    />
  );
}
