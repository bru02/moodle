import { Action, ActionPanel, Icon, List } from "@raycast/api";
import { OpenInBrowserAction } from "../components/OpenInBrowserAction";
import { HiddenItemActionsSection } from "../components/WithHiddenItems";
import { useRemoteHTMLResource } from "../hooks/useRemoteHTMLService";
import { Module } from "../types";
import { AddonModBookTocChapterParsed } from "../types/contents";
import DefaultListItem from "./default";

export function BookChapterDetail({ module, href }: { module: Module; href: string }) {
  const { data: content, isLoading } = useRemoteHTMLResource(
    module.contents!.find((c) => c.fileurl?.endsWith(href))!.fileurl!,
  );

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
  return (
    <DefaultListItem
      module={module}
      icon={Icon.Book}
      actions={
        <ActionPanel>
          <Action.Push title="View Book" icon={Icon.Eye} target={<ViewBook module={module} />} />
          <OpenInBrowserAction url={module.url!} />
          <HiddenItemActionsSection item={module} />
        </ActionPanel>
      }
    />
  );
}
