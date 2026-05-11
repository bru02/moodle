import { Action, ActionPanel, Color, Icon, List } from "@raycast/api";
import { useContext } from "react";

import { OpenInBrowserAction } from "../components/OpenInBrowserAction";
import CourseContext from "../course-context";
import { formatRelativeTime } from "../helpers/format";
import { turndown } from "../helpers/markdown";
import { useWSQuery } from "../hooks/useWSQuery";
import { Module } from "../types";
import type {
  AddonModForumData,
  AddonModForumDiscussion,
} from "../types/forum";
import { ModuleListItemShell } from "./module-list-item-shell";

export default function ForumListItem({ module }: { module: Module }) {
  const ctx = useContext(CourseContext);
  const { scope, activeCourse } = ctx;
  const { data, isPending } = useWSQuery("mod_forum_get_forums_by_courses", {
    courseids: scope.courseIds,
  });

  const currentForum = data?.find(
    (forum) => forum.id === module.instance || forum.cmid === module.id,
  );

  if (!currentForum) {
    return <ModuleListItemShell module={module} course={activeCourse} />;
  }

  return (
    <ModuleListItemShell
      module={module}
      detail={
        <ForumListItemDetail forum={currentForum} isLoading={isPending} />
      }
      accessories={getForumAccessories(currentForum)}
      course={activeCourse}
      primaryAction={
        <Action.Push
          title="View Discussions"
          icon={Icon.SpeechBubbleActive}
          target={
            <CourseContext value={ctx}>
              <ForumDiscussionsList forum={currentForum} module={module} />
            </CourseContext>
          }
        />
      }
    />
  );
}

function ForumListItemDetail({
  forum,
  isLoading,
}: {
  forum: AddonModForumData;
  isLoading: boolean;
}) {
  return (
    <List.Item.Detail
      isLoading={isLoading}
      markdown={turndown(forum.intro || "")}
    />
  );
}

function ForumDiscussionsList({
  forum,
  module,
}: {
  forum: AddonModForumData;
  module: Module;
}) {
  const { data, isPending } = useWSQuery("mod_forum_get_forum_discussions", {
    forumid: forum.id,
    page: 0,
    perpage: 50,
  });

  const discussions = data?.discussions ?? [];

  return (
    <List
      navigationTitle={`${module.name} Discussions`}
      isLoading={isPending}
      isShowingDetail={true}
    >
      {discussions.map((discussion) => (
        <List.Item
          key={discussion.discussion ?? discussion.id}
          title={discussion.name || discussion.subject}
          subtitle={
            typeof discussion.userfullname === "string"
              ? discussion.userfullname
              : undefined
          }
          accessories={getDiscussionAccessories(discussion)}
          detail={<ForumDiscussionDetail discussion={discussion} />}
          actions={
            <ActionPanel>
              {module.url && (
                <OpenInBrowserAction
                  url={module.url.replace(
                    /view\.php.*$/,
                    `discuss.php?id=${discussion.discussion}`,
                  )}
                />
              )}
            </ActionPanel>
          }
        />
      ))}
    </List>
  );
}

function ForumDiscussionDetail({
  discussion,
}: {
  discussion: AddonModForumDiscussion;
}) {
  const detail = (
    <List.Item.Detail
      markdown={turndown(discussion.message || "")}
      metadata={
        <List.Item.Detail.Metadata>
          <List.Item.Detail.Metadata.Label
            title="Author"
            text={
              typeof discussion.userfullname === "string"
                ? discussion.userfullname
                : "Unknown"
            }
          />
          <List.Item.Detail.Metadata.Label
            title="Replies"
            text={String(discussion.numreplies)}
          />
          {discussion.numunread > 0 && (
            <List.Item.Detail.Metadata.Label
              title="Unread"
              text={formatUnreadCount(discussion.numunread)}
            />
          )}
          <List.Item.Detail.Metadata.Label
            title="Created"
            text={formatRelativeTime(discussion.created)}
          />
          <List.Item.Detail.Metadata.Label
            title="Last Updated"
            text={formatRelativeTime(discussion.timemodified)}
          />
          {discussion.pinned ? (
            <List.Item.Detail.Metadata.Label title="Pinned" text="Yes" />
          ) : null}
          {discussion.locked ? (
            <List.Item.Detail.Metadata.Label title="Locked" text="Yes" />
          ) : null}
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

function getForumAccessories(forum: AddonModForumData): List.Item.Accessory[] {
  if (typeof forum.unreadpostscount !== "number") {
    return [];
  }

  return [
    {
      text: formatUnreadCount(forum.unreadpostscount),
      tooltip: "Unread posts",
    },
  ];
}

function getDiscussionAccessories(
  discussion: AddonModForumDiscussion,
): List.Item.Accessory[] {
  const accessories: List.Item.Accessory[] = [
    { text: `${discussion.numreplies} replies` },
  ];
  if (discussion.numunread > 0) {
    accessories.push({ text: formatUnreadCount(discussion.numunread) });
  }
  if (discussion.pinned) {
    accessories.push({ icon: Icon.Pin });
  }
  if (discussion.locked) {
    accessories.push({ icon: Icon.Lock });
  }
  return accessories;
}
