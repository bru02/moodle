import { mkdir } from "fs/promises";

import { parseBookToc, resolveBookChapterContentFile } from "@moodle/core";
import {
  Action,
  ActionPanel,
  Clipboard,
  Icon,
  Keyboard,
  List,
  Toast,
  open,
  showToast,
} from "@raycast/api";
import { useContext } from "react";

import { OpenInBrowserAction } from "../components/OpenInBrowserAction";
import { HiddenItemActionsSection } from "../components/WithHiddenItems";
import CourseContext from "../course-context";
import { getModuleFolder } from "../helpers/files";
import { htmlToPlainText } from "../helpers/markdown";
import { preferences } from "../helpers/preferences";
import {
  fetchRemoteHTMLResource,
  useRemoteHTMLResource,
} from "../hooks/useRemoteHTMLService";
import { Module } from "../types";
import DefaultListItem from "./default";

export function BookChapterDetail({
  module,
  href,
}: {
  module: Module;
  href: string;
}) {
  const { activeCourse } = useContext(CourseContext);
  const fileurl = resolveBookChapterContentFile(module.contents, href)?.fileurl;
  const { data: content, isLoading } = useRemoteHTMLResource(
    fileurl,
    module.contents,
    activeCourse.id,
  );

  return <List.Item.Detail isLoading={isLoading} markdown={content} />;
}

function CopyBookChapterMarkdownAction({
  module,
  href,
}: {
  module: Module;
  href: string;
}) {
  const { activeCourse } = useContext(CourseContext);
  const fileurl = resolveBookChapterContentFile(module.contents, href)?.fileurl;

  return (
    <Action
      title="Copy as Markdown"
      icon={Icon.Clipboard}
      shortcut={Keyboard.Shortcut.Common.Copy}
      onAction={async () => {
        if (!fileurl) {
          await showToast({
            style: Toast.Style.Failure,
            title: "Chapter Content Missing",
          });
          return;
        }

        const toast = await showToast({
          style: Toast.Style.Animated,
          title: "Loading Chapter",
        });

        try {
          const content = await fetchRemoteHTMLResource(
            fileurl,
            module.contents,
            activeCourse.id,
          );
          await Clipboard.copy(content);

          toast.style = Toast.Style.Success;
          toast.title = "Copied Markdown";
        } catch (error) {
          toast.style = Toast.Style.Failure;
          toast.title = "Failed to Copy Markdown";
          toast.message =
            error instanceof Error ? error.message : String(error);
        }
      }}
    />
  );
}

export function ViewBook({ module }: { module: Module }) {
  const tocContent = module.contents?.find((c) => c.filename === "structure");
  const toc = parseBookToc(tocContent?.content);

  return (
    <List navigationTitle={htmlToPlainText(module.name)} isShowingDetail={true}>
      {toc?.toReversed().map((content) => {
        return (
          <List.Item
            key={content.href}
            title={htmlToPlainText(content.title)}
            detail={<BookChapterDetail module={module} href={content.href} />}
            actions={
              <ActionPanel>
                <OpenInBrowserAction
                  url={`${module.url}&chapterid=${content.href.match(/\d+/)?.[0]}`}
                />
                <CopyBookChapterMarkdownAction
                  module={module}
                  href={content.href}
                />
              </ActionPanel>
            }
          />
        );
      })}
    </List>
  );
}

export default function BookListItem({ module }: { module: Module }) {
  const ctx = useContext(CourseContext);

  return (
    <DefaultListItem
      module={module}
      icon={Icon.Book}
      actions={
        <ActionPanel>
          <Action.Push
            title="View Book"
            icon={Icon.Eye}
            target={
              <CourseContext.Provider value={ctx}>
                <ViewBook module={module} />
              </CourseContext.Provider>
            }
          />
          {preferences.sync_folder && (
            <Action
              title="Open Folder in Finder"
              icon={Icon.Finder}
              onAction={async () => {
                const path = getModuleFolder(ctx.activeCourse, module);
                await mkdir(path, { recursive: true });
                await open(path);
              }}
            />
          )}
          <OpenInBrowserAction url={module.url!} />
          <HiddenItemActionsSection item={module} />
        </ActionPanel>
      }
    />
  );
}
