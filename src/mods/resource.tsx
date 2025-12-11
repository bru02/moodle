import { Action, ActionPanel, Color, Icon, Keyboard } from "@raycast/api";
import { getProgressIcon } from "@raycast/utils";
import { useContext } from "react";
import CourseContext from "../course-context";
import { formatBytes, preferences, shortcut } from "../helpers";
import { checkFileSize, getFilePath, handleFileUrl, pdfify } from "../helpers/files";
import { useFileSyncStore } from "../store";
import { CoreWSExternalFile, Course, Module } from "../types";
import DefaultListItem from "./default";

const syncEnabled = Boolean(preferences.sync_folder);

export default function ResourceListItem({ module, content }: { module: Module; content?: CoreWSExternalFile }) {
  const fileContent: CoreWSExternalFile = content ?? module.contents![0];
  const course = useContext(CourseContext) as Course;
  const path = getFilePath(fileContent, module, course);
  const progress = useFileSyncStore((state) => state.progress[path]);
  const isException = useFileSyncStore((state) => state.exceptions.includes(path));
  const addException = useFileSyncStore((state) => state.addException);
  const fileSize = fileContent.filesize ?? 0;
  let filename = fileContent.filename ?? module.name;
  const downloadProgress = progress?.progress ?? 0;
  const convertProgress = progress?.convertProgress;

  if (checkFileSize(fileSize) && !isException) {
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
            <Action.OpenInBrowser url={handleFileUrl(fileContent.fileurl)} />
            <Action.CopyToClipboard
              title="Copy URL"
              shortcut={Keyboard.Shortcut.Common.Copy}
              content={handleFileUrl(fileContent.fileurl)}
            />
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
            <Action.OpenInBrowser url={handleFileUrl(fileContent.fileurl)} />
            <Action.CopyToClipboard
              title="Copy URL"
              shortcut={Keyboard.Shortcut.Common.Copy}
              content={handleFileUrl(fileContent.fileurl)}
            />
          </ActionPanel>
        }
      />
    );
  }

  let filePath = path;

  if (convertProgress === 100) {
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
            <Action.CopyToClipboard
              title="Copy URL"
              shortcut={Keyboard.Shortcut.Common.Copy}
              content={handleFileUrl(fileContent.fileurl)}
            />
          </ActionPanel.Section>
        </ActionPanel>
      }
    />
  );
}
