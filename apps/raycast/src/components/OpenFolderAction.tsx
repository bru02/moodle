import { mkdir } from "fs/promises";

import type { CourseScope, SimpleCourse } from "@moodle/core";
import { Action, ActionPanel, Icon, open } from "@raycast/api";

import { getCourseFolder } from "../helpers/files";

function courseLabel(course: SimpleCourse) {
  const parts = course.displayname.trim().split(/\s+/);
  if (parts.length > 2) return parts.slice(-2).join(" ");
  return course.displayname;
}

export function OpenFolderAction({
  scope,
  onOpen,
}: {
  scope: CourseScope;
  onOpen: (course: SimpleCourse) => void;
}) {
  const openFolder = async (course: SimpleCourse) => {
    const path = getCourseFolder(course);
    await mkdir(path, { recursive: true });
    await open(path);
    onOpen(course);
  };

  if (scope.courses.length > 1) {
    return (
      <ActionPanel.Submenu title="Open Folder in Finder" icon={Icon.Finder}>
        {scope.courses.map((c) => (
          <Action
            key={c.id}
            title={courseLabel(c)}
            icon={Icon.Folder}
            onAction={() => openFolder(c)}
          />
        ))}
      </ActionPanel.Submenu>
    );
  }

  return (
    <Action
      title="Open Folder in Finder"
      icon={Icon.Finder}
      onAction={() => openFolder(scope.courses[0])}
    />
  );
}
