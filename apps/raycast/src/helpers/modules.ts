import { Module } from "../types";
import { Modname } from "../types/contents";

const moduleDetailOverrides: Partial<Record<Modname, boolean>> = {
  assign: true,
  forum: true,
  quiz: true,
};

export function getModuleListItemId(
  module: Module,
  options: { hasDetail?: boolean; suffix?: string } = {},
) {
  const suffix = options.suffix ?? "";
  const overrideDetail = moduleDetailOverrides[module.modname as Modname];
  const hasDetail =
    options.hasDetail ?? overrideDetail ?? Boolean(module.description);
  const prefix = hasDetail ? "D-" : "--";

  return `${prefix}${module.id}${suffix}`;
}
