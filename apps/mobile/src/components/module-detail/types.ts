import type { CourseScope, ScopedModule } from "@moodle/core";

export type ModuleDetailProps = {
  scope: CourseScope;
  module: ScopedModule;
};
