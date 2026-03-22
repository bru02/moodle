import { Action, ActionPanel, Color, Icon, List } from "@raycast/api";
import { memo, useContext, useMemo } from "react";

import CompletionAction from "../components/CompletionAction";
import { OpenInBrowserAction } from "../components/OpenInBrowserAction";
import { HiddenItemActionsSection } from "../components/WithHiddenItems";
import CourseContext from "../course-context";
import { formatDurationBetween, formatRelativeTime } from "../helpers/format";
import { turndown } from "../helpers/markdown";
import { useWSQuery } from "../hooks/useWSQuery";
import { Module } from "../types";
import type { AddonModChatChat, AddonModChatSession, AddonModChatWSSessionMessage } from "../types/chat";
import DefaultListItem from "./default";

function ChatListItem({ module }: { module: Module }) {
  const ctx = useContext(CourseContext);
  const { scope, activeCourse } = ctx;
  const { data, isPending } = useWSQuery("mod_chat_get_chats_by_courses", { courseids: scope.courseIds });
  const currentChat = data?.chats.find((chat) => chat.id === module.instance || chat.coursemodule === module.id);

  if (!currentChat) {
    return <DefaultListItem module={module} />;
  }

  return (
    <DefaultListItem
      module={module}
      icon={Icon.SpeechBubble}
      detail={<ChatListItemDetail chat={currentChat} isLoading={isPending} />}
      accessories={getChatAccessories(currentChat)}
      actions={
        <ActionPanel>
          <Action.Push
            title="View Past Sessions"
            icon={Icon.Clock}
            target={
              <CourseContext value={ctx}>
                <ChatSessionsList module={module} chat={currentChat} />
              </CourseContext>
            }
          />
          <OpenInBrowserAction url={module.url!} />
          <CompletionAction module={module} course={activeCourse} />
          <HiddenItemActionsSection item={module} />
        </ActionPanel>
      }
    />
  );
}

export default memo(ChatListItem);

function ChatListItemDetail({ chat, isLoading }: { chat: AddonModChatChat; isLoading: boolean }) {
  return <List.Item.Detail isLoading={isLoading} markdown={turndown(chat.intro || "")} />;
}

function ChatSessionsList({ module, chat }: { module: Module; chat: AddonModChatChat }) {
  const { data, isPending } = useWSQuery("mod_chat_get_sessions", {
    chatid: chat.id,
    groupid: 0,
    showall: false,
  });
  const sessions = useMemo(
    () => [...(data?.sessions ?? [])].sort((a, b) => b.sessionstart - a.sessionstart),
    [data?.sessions],
  );

  return (
    <List navigationTitle={`${module.name} Sessions`} isLoading={isPending} isShowingDetail={true}>
      {sessions.map((session, index) => (
        <List.Item
          key={`${session.sessionstart}:${session.sessionend}`}
          title={getSessionTitle(session, index)}
          subtitle={getSessionSubtitle(session)}
          accessories={getSessionAccessories(session)}
          detail={<ChatSessionDetail session={session} />}
          actions={
            <ActionPanel>
              <Action.Push
                title="View Session Messages"
                icon={Icon.TextDocument}
                target={<ChatSessionMessagesList module={module} chat={chat} session={session} />}
              />
              <OpenInBrowserAction url={module.url!} />
            </ActionPanel>
          }
        />
      ))}
    </List>
  );
}

function ChatSessionDetail({ session }: { session: AddonModChatSession }) {
  const users = session.sessionusers ?? [];
  const duration =
    session.sessionend > session.sessionstart ? formatDurationBetween(session.sessionstart, session.sessionend) : "";

  return (
    <List.Item.Detail
      metadata={
        <List.Item.Detail.Metadata>
          <List.Item.Detail.Metadata.Label title="Start" text={formatRelativeTime(session.sessionstart)} />
          <List.Item.Detail.Metadata.Label title="End" text={formatRelativeTime(session.sessionend)} />
          {duration ? <List.Item.Detail.Metadata.Label title="Duration" text={duration} /> : null}
          <List.Item.Detail.Metadata.Label title="Participants" text={String(users.length)} />
          <List.Item.Detail.Metadata.Label title="Status" text={getSessionStatusLabelProps(session.iscomplete)} />
          {users.slice(0, 8).map((user) => (
            <List.Item.Detail.Metadata.Label
              key={user.userid}
              title={`User #${user.userid}`}
              text={user.messagecount > 0 ? `${user.messagecount} messages` : "No messages"}
            />
          ))}
        </List.Item.Detail.Metadata>
      }
    />
  );
}

function ChatSessionMessagesList({
  module,
  chat,
  session,
}: {
  module: Module;
  chat: AddonModChatChat;
  session: AddonModChatSession;
}) {
  const { data, isPending } = useWSQuery("mod_chat_get_session_messages", {
    chatid: chat.id,
    sessionstart: session.sessionstart,
    sessionend: session.sessionend,
    groupid: 0,
  });
  const messages = useMemo(
    () => [...(data?.messages ?? [])].sort((a, b) => a.timestamp - b.timestamp),
    [data?.messages],
  );

  return (
    <List navigationTitle={`${module.name} Messages`} isLoading={isPending} isShowingDetail={true}>
      {messages.map((message) => (
        <List.Item
          key={message.id}
          title={getMessageTitle(message)}
          subtitle={message.userfullname ?? undefined}
          accessories={getMessageAccessories(message)}
          detail={<ChatSessionMessageDetail message={message} />}
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

function ChatSessionMessageDetail({ message }: { message: AddonModChatWSSessionMessage }) {
  const isSystemMessage = Boolean(message.issystem ?? message.system);

  return (
    <List.Item.Detail
      markdown={turndown(message.message || "")}
      metadata={
        <List.Item.Detail.Metadata>
          <List.Item.Detail.Metadata.Label title="Author" text={message.userfullname ?? `User #${message.userid}`} />
          <List.Item.Detail.Metadata.Label title="Time" text={formatRelativeTime(message.timestamp)} />
          <List.Item.Detail.Metadata.Label
            title="Type"
            text={isSystemMessage ? { value: "System", color: Color.Blue } : "Message"}
          />
        </List.Item.Detail.Metadata>
      }
    />
  );
}

function getSessionTitle(session: AddonModChatSession, index: number) {
  if (session.sessionstart > 0) {
    return `Session ${index + 1} (${formatRelativeTime(session.sessionstart)})`;
  }
  return `Session ${index + 1}`;
}

function getSessionSubtitle(session: AddonModChatSession) {
  const userCount = session.sessionusers?.length ?? 0;
  return `${userCount} participant${userCount === 1 ? "" : "s"}`;
}

function getSessionAccessories(session: AddonModChatSession): List.Item.Accessory[] {
  const accessories: List.Item.Accessory[] = [
    { text: getSessionStatusLabelProps(session.iscomplete) },
    { text: getSessionSubtitle(session) },
  ];

  if (session.sessionend > session.sessionstart) {
    accessories.push({ text: formatDurationBetween(session.sessionstart, session.sessionend) });
  }

  return accessories;
}

function getSessionStatusLabelProps(isComplete: number | boolean) {
  const completed = Boolean(isComplete);
  return completed ? { value: "Complete", color: Color.Green } : { value: "In Progress", color: Color.Orange };
}

function getChatAccessories(chat: AddonModChatChat): List.Item.Accessory[] {
  const hasScheduledSession = Boolean(chat.schedule && chat.chattime && chat.chattime > 0);
  if (hasScheduledSession) {
    return [{ text: { value: "Sched", color: Color.Orange }, tooltip: "Scheduled chat session" }];
  }
  return [{ text: "Open", tooltip: "No scheduled session" }];
}

function getMessageTitle(message: AddonModChatWSSessionMessage) {
  if (message.issystem || message.system) {
    return "System";
  }
  return message.userfullname ?? `User #${message.userid}`;
}

function getMessageAccessories(message: AddonModChatWSSessionMessage): List.Item.Accessory[] {
  const accessories: List.Item.Accessory[] = [{ text: formatRelativeTime(message.timestamp) }];
  if (message.issystem || message.system) {
    accessories.push({ text: { value: "System", color: Color.Blue } });
  }
  return accessories;
}
