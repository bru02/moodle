import {
  Action,
  ActionPanel,
  Clipboard,
  Color,
  Icon,
  Keyboard,
  Toast,
  closeMainWindow,
  showToast,
} from "@raycast/api";
import { getProgressIcon } from "@raycast/utils";
import { useContext, useMemo } from "react";

import { HiddenItemActionsSection } from "../components/WithHiddenItems";
import CourseContext from "../course-context";
import { formatBytes, shortcut, stripHTML } from "../helpers";
import {
  canConvert,
  checkFileSize,
  getFilePath,
  handleFileUrl,
  pdfify,
} from "../helpers/files";
import { preferences } from "../helpers/preferences";
import { useFileSyncExceptionsStore, useFileSyncProgressStore } from "../store";
import { CoreWSExternalFile, Module } from "../types";
import DefaultListItem from "./default";

const syncEnabled = Boolean(preferences.sync_folder);

type LiteParseModule = typeof import("@llamaindex/liteparse");

const importLiteParse = new Function(
  "specifier",
  "return import(specifier)",
) as (specifier: string) => Promise<LiteParseModule>;

async function parseFileAsMarkdown(filePath: string) {
  const { LiteParse } = await importLiteParse("@llamaindex/liteparse");
  const parser = new LiteParse({ outputFormat: "text" });
  const result = await parser.parse(filePath, true);

  return result.text.trim();
}

async function copyFileAsMarkdown(filePath: string) {
  await closeMainWindow();

  const toast = await showToast({
    style: Toast.Style.Animated,
    title: "Converting to Markdown",
  });

  try {
    const markdown = await parseFileAsMarkdown(filePath);
    await Clipboard.copy(markdown);

    toast.style = Toast.Style.Success;
    toast.title = "Copied Markdown";
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    toast.style = Toast.Style.Failure;
    toast.title = "Failed to Copy Markdown";
    toast.message = message;
  }
}

export default function ResourceListItem({
  module,
  content,
}: {
  module: Module;
  content?: CoreWSExternalFile;
}) {
  const fileContent: CoreWSExternalFile | undefined =
    content ?? module.contents?.[0];
  const { activeCourse: course } = useContext(CourseContext);
  const path = useMemo(
    () => (fileContent ? getFilePath(fileContent, module, course) : ""),
    [fileContent, module, course],
  );
  const progress = useFileSyncProgressStore((state) =>
    state.progress.get(path),
  );
  const isException = useFileSyncExceptionsStore((state) =>
    state.exceptions.includes(path),
  );
  const addException = useFileSyncExceptionsStore(
    (state) => state.addException,
  );
  const fileSize = fileContent?.filesize ?? 0;
  const downloadProgress = progress?.progress ?? 0;
  const convertProgress = progress?.convertProgress;
  const converted =
    convertProgress === 100 && canConvert(fileContent?.mimetype);
  let filename = fileContent?.filename ?? module.name;
  let filePath = path;
  if (converted) {
    filename = pdfify(filename);
    filePath = pdfify(path);
  }
  const title = content ? filename : module.name || filename;
  const subtitle = title !== filename ? filename : undefined;
  const keywords = useMemo(() => {
    const values = new Set(
      filename
        .split(/[\s\-_]+/)
        .map((part) => part.trim().toLowerCase())
        .filter(Boolean),
    );

    if (title !== filename) {
      values.add(filename.trim().toLowerCase());
    }

    return values.size > 0 ? [...values] : undefined;
  }, [filename, title]);
  const fileUrl = useMemo(
    () => (fileContent ? handleFileUrl(fileContent.fileurl) : ""),
    [fileContent],
  );

  // If no file content is available, render a fallback.
  if (!fileContent) {
    return <DefaultListItem module={module} icon={Icon.Document} />;
  }

  if (syncEnabled && checkFileSize(fileSize) && !isException) {
    return (
      <DefaultListItem
        module={module}
        contentFilename={filename}
        title={stripHTML(title)}
        subtitle={subtitle}
        keywords={keywords}
        icon={Icon.Download}
        accessories={[
          { text: { value: formatBytes(fileSize), color: Color.Red } },
        ]}
        actions={
          <ActionPanel>
            <Action
              title="Download File"
              icon={Icon.Download}
              onAction={() => addException(path)}
            />
            <Action.OpenInBrowser url={fileUrl} />
            <Action.CopyToClipboard
              title="Copy URL"
              shortcut={Keyboard.Shortcut.Common.Copy}
              content={fileUrl}
            />
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
        title={stripHTML(title)}
        subtitle={subtitle}
        keywords={keywords}
        icon={
          syncEnabled
            ? getProgressIcon(downloadProgress / 100 || 0, Color.Orange)
            : Icon.Document
        }
        actions={
          <ActionPanel>
            <Action.OpenInBrowser url={fileUrl} />
            <Action.CopyToClipboard
              title="Copy URL"
              shortcut={Keyboard.Shortcut.Common.Copy}
              content={fileUrl}
            />
            <HiddenItemActionsSection item={module} />
          </ActionPanel>
        }
      />
    );
  }

  return (
    <DefaultListItem
      module={module}
      contentFilename={filename}
      title={stripHTML(title)}
      subtitle={subtitle}
      keywords={keywords}
      icon={
        typeof convertProgress === "number" && !converted
          ? getProgressIcon((convertProgress || 0) / 100 || 0, Color.Blue)
          : { fileIcon: filePath }
      }
      quickLook={{ path: filePath }}
      actions={
        <ActionPanel>
          <Action.Open
            title="Open File"
            target={filePath}
            icon={Icon.Document}
          />
          <Action.ShowInFinder title="Show in Finder" path={filePath} />
          <Action.ToggleQuickLook />
          <Action.OpenWith
            title="Open with"
            path={filePath}
            shortcut={Keyboard.Shortcut.Common.OpenWith}
          />
          <ActionPanel.Section>
            <Action.CreateQuicklink
              title="Create Quicklink"
              quicklink={{ link: filePath }}
              icon={Icon.Link}
              shortcut={shortcut("l", ["shift"])}
            />
          </ActionPanel.Section>
          <ActionPanel.Section>
            <Action.CopyToClipboard
              title="Copy File"
              shortcut={shortcut(".")}
              content={{ file: filePath }}
            />
            <Action
              title="Copy as Markdown"
              icon={Icon.Clipboard}
              onAction={() => copyFileAsMarkdown(filePath)}
            />
            <Action.CopyToClipboard
              title="Copy Name"
              shortcut={Keyboard.Shortcut.Common.CopyName}
              content={filename}
            />
            <Action.CopyToClipboard
              title="Copy Path"
              shortcut={Keyboard.Shortcut.Common.CopyPath}
              content={filePath}
            />
            <Action.CopyToClipboard
              title="Copy URL"
              shortcut={Keyboard.Shortcut.Common.Copy}
              content={fileUrl}
            />
          </ActionPanel.Section>
          <HiddenItemActionsSection item={module} />
        </ActionPanel>
      }
    />
  );
}
