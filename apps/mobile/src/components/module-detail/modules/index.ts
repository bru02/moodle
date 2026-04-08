import type { ComponentType } from "react";

import type { ModuleDetailProps } from "../types";
import { AssignmentDetail } from "./assignment";
import { BookDetail } from "./book";
import { ChoiceDetail } from "./choice";
import { FeedbackDetail } from "./feedback";
import { FolderDetail } from "./folder";
import { ForumDetail } from "./forum";
import { GenericModuleDetail } from "./generic";
import { LabelDetail } from "./label";
import { PageDetail } from "./page";
import { QuizDetail } from "./quiz";

export const moduleDetailComponents: Partial<Record<string, ComponentType<ModuleDetailProps>>> = {
  page: PageDetail,
  book: BookDetail,
  label: LabelDetail,
  folder: FolderDetail,
  assign: AssignmentDetail,
  quiz: QuizDetail,
  forum: ForumDetail,
  choice: ChoiceDetail,
  feedback: FeedbackDetail,
  crfeedback: FeedbackDetail,
};

export { GenericModuleDetail };
