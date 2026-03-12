import { Action, ActionPanel, Icon, List, open } from "@raycast/api";
import { mkdir } from "fs/promises";
import { useContext } from "react";
import { OpenInBrowserAction } from "../components/OpenInBrowserAction";
import { HiddenItemActionsSection } from "../components/WithHiddenItems";
import CourseContext from "../course-context";
import { getModuleFolder } from "../helpers/files";
import { preferences } from "../helpers/preferences";
import { useRemoteHTMLResource } from "../hooks/useRemoteHTMLService";
import { Module } from "../types";
import { AddonModBookTocChapterParsed } from "../types/contents";
import DefaultListItem from "./default";

export function BookChapterDetail({ module, href }: { module: Module; href: string }) {
  const { activeCourse } = useContext(CourseContext);
  const fileurl = module.contents?.find((c) => c.fileurl?.endsWith(href))?.fileurl;
  const { data: content, isLoading } = useRemoteHTMLResource(fileurl, module.contents, activeCourse.id);

  return <List.Item.Detail isLoading={isLoading} markdown={content} />;
}

export function ViewBook({ module }: { module: Module }) {
  const tocContent = module.contents?.find((c) => c.filename === "structure");
  const toc: AddonModBookTocChapterParsed[] = tocContent?.content ? JSON.parse(tocContent.content) : [];

  return (
    <List navigationTitle={module.name} isShowingDetail={true}>
      {toc?.toReversed().map((content) => {
        return (
          <List.Item
            key={content.href}
            title={content.title}
            detail={<BookChapterDetail module={module} href={content.href} />}
            actions={
              <ActionPanel>
                <OpenInBrowserAction url={`${module.url}&chapterid=${content.href.match(/\d+/)?.[0]}`} />
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
