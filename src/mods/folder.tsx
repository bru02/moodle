import { Action, ActionPanel, Icon, List, open } from "@raycast/api";
import { mkdir } from "fs/promises";
import { useContext } from "react";
import { OpenInBrowserAction } from "../components/OpenInBrowserAction";
import { HiddenItemActionsSection } from "../components/WithHiddenItems";
import CourseContext from "../course-context";
import { getModuleFolder } from "../helpers/files";
import { preferences } from "../helpers/preferences";
import { Module } from "../types";
import DefaultListItem from "./default";
import ResourceListItem from "./resource";

export function ViewFolder({ module }: { module: Module }) {
  return (
    <List navigationTitle={module.name}>
      {module.contents?.map((content) => (
        <ResourceListItem key={content.filename} module={module} content={content} />
      ))}
    </List>
  );
}

export default function FolderListItem({ module }: { module: Module }) {
  const course = useContext(CourseContext);
  return (
    <DefaultListItem
      module={module}
      actions={
        <ActionPanel>
          <Action.Push
            title="Open Folder"
            icon={Icon.Folder}
            target={
              <CourseContext.Provider value={course}>
                <ViewFolder module={module} />
              </CourseContext.Provider>
            }
          />
          {preferences.sync_folder && (
            <Action
              title="Open Folder in Finder"
              icon={Icon.Finder}
              onAction={async () => {
                const path = getModuleFolder(course, module);
                await mkdir(path, { recursive: true });
                await open(path);
              }}
            />
          )}
          <OpenInBrowserAction url={module.url!} applyShortcut />
          <HiddenItemActionsSection item={module} />
        </ActionPanel>
      }
    />
  );
}
