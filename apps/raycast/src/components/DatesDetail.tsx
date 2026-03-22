import { List } from "@raycast/api";
import { formatRelative } from "date-fns";
import { enGB } from "date-fns/locale";

import { Module } from "../types";

export default function DatesDetail({ module }: { module: Module }) {
  return (
    module.dates?.map((date) => (
      <List.Item.Detail.Metadata.Label
        key={date.label}
        title={date.label.replace(/:$/, "")}
        text={formatRelative(new Date(date.timestamp * 1000), new Date(), {
          locale: enGB,
        })}
      />
    )) || null
  );
}
