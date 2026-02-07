import { Action, ActionPanel, Color, Icon, List } from "@raycast/api";
import { useContext } from "react";
import CompletionAction from "../components/CompletionAction";
import DatesDetail from "../components/DatesDetail";
import { OpenInBrowserAction } from "../components/OpenInBrowserAction";
import CourseContext from "../course-context";
import { formatRelativeTime } from "../helpers/format";
import { turndown } from "../helpers/markdown";
import { useWSQuery } from "../hooks/useWSQuery";
import { Module } from "../types";
import type { AddonModForumData, AddonModForumDiscussion, AddonModForumType } from "../types/forum";
import DefaultListItem from "./default";

const forumTypeLabels: Record<AddonModForumType, string> = {
  news: "Announcements",
  social: "Social",
  general: "Standard Forum",
  eachuser: "Each Person Posts One",
  single: "Single Simple Discussion",
  qanda: "Q & A",
  blog: "Blog",
} as const;

export default function ForumListItem({ module }: { module: Module }) {
  const course = useContext(CourseContext);
  const { data, isPending } = useWSQuery("mod_forum_get_forums_by_courses", { "courseids[0]": Number(course.id) });

  const currentForum = data?.find((forum) => forum.id === module.instance || forum.cmid === module.id);

  if (!currentForum) {
    return <DefaultListItem module={module} />;
  }

  return (
    <DefaultListItem
      module={module}
      detail={<ForumListItemDetail forum={currentForum} isLoading={isPending} module={module} />}
      actions={
        <ActionPanel>
          <Action.Push
            title="View Discussions"
            target={
              <CourseContext value={course}>
                <ForumDiscussionsList forum={currentForum} module={module} />
              </CourseContext>
            }
          />
          <OpenInBrowserAction url={module.url!} />
          <CompletionAction module={module} course={course} />
        </ActionPanel>
      }
    />
  );
}

function ForumListItemDetail({
  forum,
  isLoading,
  module,
}: {
  forum: AddonModForumData;
  isLoading: boolean;
  module: Module;
}) {
  const detail = (
    <List.Item.Detail
      isLoading={isLoading}
      markdown={turndown(forum.intro || "")}
      metadata={
        <List.Item.Detail.Metadata>
          <List.Item.Detail.Metadata.Label title="Type" text={forumTypeLabels[forum.type] ?? forum.type} />
          {typeof forum.numdiscussions === "number" && (
            <List.Item.Detail.Metadata.Label title="Discussions" text={String(forum.numdiscussions)} />
          )}
          {typeof forum.unreadpostscount === "number" && (
            <List.Item.Detail.Metadata.Label title="Unread" text={formatUnreadCount(forum.unreadpostscount)} />
          )}
          {typeof forum.cancreatediscussions === "boolean" && (
            <List.Item.Detail.Metadata.Label title="Can Post" text={forum.cancreatediscussions ? "Yes" : "No"} />
          )}
          {typeof forum.istracked === "boolean" && (
            <List.Item.Detail.Metadata.Label title="Tracking" text={forum.istracked ? "On" : "Off"} />
          )}
          {forum.grade_forum > 0 && (
            <List.Item.Detail.Metadata.Label title="Grade" text={String(forum.grade_forum)} />
          )}
          <List.Item.Detail.Metadata.Label title="Last Updated" text={formatRelativeTime(forum.timemodified)} />
          <DatesDetail module={module} />
        </List.Item.Detail.Metadata>
      }
    />
  );

  return detail;
}

function ForumDiscussionsList({ forum, module }: { forum: AddonModForumData; module: Module }) {
  const { data, isPending } = useWSQuery("mod_forum_get_forum_discussions", {
    forumid: forum.id,
    page: 0,
    perpage: 50,
  });

  const discussions = data?.discussions ?? [];

  return (
    <List navigationTitle={`${module.name} Discussions`} isLoading={isPending} isShowingDetail={true}>
      {discussions.map((discussion) => (
        <List.Item
          key={discussion.discussion ?? discussion.id}
          title={discussion.name || discussion.subject}
          subtitle={typeof discussion.userfullname === "string" ? discussion.userfullname : undefined}
          accessories={getDiscussionAccessories(discussion)}
          detail={<ForumDiscussionDetail discussion={discussion} />}
          actions={
            <ActionPanel>
              <OpenInBrowserAction url={module.url!} />
            </ActionPanel>
          }
        />
      ))}
    </List>
  );
}

function ForumDiscussionDetail({ discussion }: { discussion: AddonModForumDiscussion }) {
  const detail = (
    <List.Item.Detail
      markdown={turndown(discussion.message || "")}
      metadata={
        <List.Item.Detail.Metadata>
          <List.Item.Detail.Metadata.Label
            title="Author"
            text={typeof discussion.userfullname === "string" ? discussion.userfullname : "Unknown"}
          />
          <List.Item.Detail.Metadata.Label title="Replies" text={String(discussion.numreplies)} />
          {discussion.numunread > 0 && (
            <List.Item.Detail.Metadata.Label title="Unread" text={formatUnreadCount(discussion.numunread)} />
          )}
          <List.Item.Detail.Metadata.Label title="Created" text={formatRelativeTime(discussion.created)} />
          <List.Item.Detail.Metadata.Label title="Last Updated" text={formatRelativeTime(discussion.timemodified)} />
          {discussion.pinned && <List.Item.Detail.Metadata.Label title="Pinned" text="Yes" />}
          {discussion.locked && <List.Item.Detail.Metadata.Label title="Locked" text="Yes" />}
        </List.Item.Detail.Metadata>
      }
    />
  );

  return detail;
}

function formatUnreadCount(unread: number) {
  if (unread > 0) {
    return { value: String(unread), color: Color.Orange };
  }
  return "0";
}

function getDiscussionAccessories(discussion: AddonModForumDiscussion): List.Item.Accessory[] {
  const accessories: List.Item.Accessory[] = [{ text: `${discussion.numreplies} replies` }];
  if (discussion.numunread > 0) {
    accessories.push({text: formatUnreadCount(discussion.numunread)});
  }
  if (discussion.pinned) {
    accessories.push({ icon: Icon.Pin });
  }
  if (discussion.locked) {
    accessories.push({ icon: Icon.Lock });
  }
  return accessories;
}
