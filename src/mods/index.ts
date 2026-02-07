import { FC } from "react";
import { Module } from "../types";
import { Modname } from "../types/contents";
import AssignListItem from "./assign";
import BookListItem, { ViewBook } from "./book";
import DefaultListItem from "./default";
import FolderListItem, { ViewFolder } from "./folder";
import ForumListItem from "./forum";
import PageListItem, { ViewPage } from "./page";
import QuizListItem from "./quiz";
import ResourceListItem from "./resource";

type ModuleFC = FC<{ module: Module }>;

const ModuleListItems: Partial<Record<Modname, ModuleFC>> & { default: ModuleFC } = {
  resource: ResourceListItem,
  folder: FolderListItem,
  book: BookListItem,
  page: PageListItem,
  default: DefaultListItem,
  assign: AssignListItem,
  forum: ForumListItem,
  quiz: QuizListItem,
} as const;

export const ModuleViewComponents: Partial<Record<Modname, ModuleFC>> = {
  book: ViewBook,
  page: ViewPage,
  folder: ViewFolder,
} as const;

export default ModuleListItems;
