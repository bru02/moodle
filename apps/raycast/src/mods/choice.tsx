import { Action, ActionPanel, Color, Form, Icon, List, Toast, showToast, useNavigation } from "@raycast/api";
import { memo, useContext, useMemo, useState } from "react";

import CompletionAction from "../components/CompletionAction";
import DatesDetail from "../components/DatesDetail";
import { OpenInBrowserAction } from "../components/OpenInBrowserAction";
import { HiddenItemActionsSection } from "../components/WithHiddenItems";
import CourseContext from "../course-context";
import { stripHTML } from "../helpers";
import { formatRelativeTime } from "../helpers/format";
import { turndown } from "../helpers/markdown";
import { queryClient, requestWS, useWSQuery } from "../hooks/useWSQuery";
import { Module } from "../types";
import type { AddonModChoiceChoice, AddonModChoiceOption } from "../types/choice";
import DefaultListItem from "./default";

function ChoiceListItem({ module }: { module: Module }) {
  const ctx = useContext(CourseContext);
  const { scope, activeCourse } = ctx;
  const { data: choicesData, isPending: isChoicePending } = useWSQuery("mod_choice_get_choices_by_courses", {
    courseids: scope.courseIds,
  });
  const { data: optionsData, isPending: isOptionsPending } = useWSQuery("mod_choice_get_choice_options", {
    choiceid: module.instance,
  });

  const choice = choicesData?.choices.find((item) => item.id === module.instance || item.coursemodule === module.id);
  if (!choice) {
    return <DefaultListItem module={module} />;
  }

  const options = optionsData?.options ?? [];
  const checkedOptions = options.filter((option) => option.checked);
  const hasAnswered = checkedOptions.length > 0;
  const canSubmit = canSubmitChoiceResponse(choice, hasAnswered);
  const canClear = canClearChoiceResponse(choice, hasAnswered);
  const editableOptions = options.filter((option) => !option.disabled || option.checked);

  return (
    <DefaultListItem
      module={module}
      icon={Icon.CheckCircle}
      detail={
        <ChoiceListItemDetail
          module={module}
          choice={choice}
          options={options}
          isLoading={isChoicePending || isOptionsPending}
        />
      }
      accessories={getChoiceAccessories(choice, checkedOptions)}
      actions={
        <ActionPanel>
          {canSubmit && editableOptions.length > 0 && (
            <Action.Push
              title={hasAnswered ? "Update Response" : "Submit Response"}
              icon={hasAnswered ? Icon.Pencil : Icon.CheckCircle}
              target={
                <ChoiceResponseForm
                  module={module}
                  choice={choice}
                  options={editableOptions}
                  hasAnswered={hasAnswered}
                />
              }
            />
          )}
          {canClear && (
            <Action
              title="Clear Response"
              icon={Icon.Trash}
              style={Action.Style.Destructive}
              onAction={async () => {
                const toast = await showToast({ style: Toast.Style.Animated, title: "Clearing response" });
                try {
                  await deleteChoiceResponse(choice.id);
                  await invalidateChoiceQueries();
                  toast.style = Toast.Style.Success;
                  toast.title = "Response cleared";
                } catch (error) {
                  toast.style = Toast.Style.Failure;
                  toast.title = "Failed to clear response";
                  toast.message = getErrorMessage(error);
                }
              }}
            />
          )}
          {options.length > 0 && (
            <Action.Push
              title="View Options"
              icon={Icon.List}
              target={<ChoiceOptionsList module={module} options={options} />}
            />
          )}
          {module.url && <OpenInBrowserAction url={module.url} />}
          <CompletionAction module={module} course={activeCourse} />
          <HiddenItemActionsSection item={module} />
        </ActionPanel>
      }
    />
  );
}

export default memo(ChoiceListItem);

function ChoiceListItemDetail({
  module,
  choice,
  options,
  isLoading,
}: {
  module: Module;
  choice: AddonModChoiceChoice;
  options: AddonModChoiceOption[];
  isLoading: boolean;
}) {
  const selectedLabels = options.filter((option) => option.checked).map(getChoiceOptionLabel);
  const selectedSummary = selectedLabels.length > 0 ? selectedLabels.join(", ") : "Not answered";
  const markdown = choice.intro || module.description || "";

  return (
    <List.Item.Detail
      isLoading={isLoading}
      markdown={turndown(markdown)}
      metadata={
        <List.Item.Detail.Metadata>
          <List.Item.Detail.Metadata.Label title="Your Response" text={selectedSummary} />
          <List.Item.Detail.Metadata.Label
            title="Selection Type"
            text={choice.allowmultiple ? "Multiple options" : "Single option"}
          />
          <List.Item.Detail.Metadata.Label title="Can Update" text={choice.allowupdate ? "Yes" : "No"} />
          <List.Item.Detail.Metadata.Label title="Status" text={getChoiceStatus(choice)} />
          {choice.timeopen ? (
            <List.Item.Detail.Metadata.Label title="Opens" text={formatRelativeTime(choice.timeopen)} />
          ) : null}
          {choice.timeclose ? (
            <List.Item.Detail.Metadata.Label title="Closes" text={formatRelativeTime(choice.timeclose)} />
          ) : null}
          <DatesDetail module={module} />
        </List.Item.Detail.Metadata>
      }
    />
  );
}

function ChoiceResponseForm({
  module,
  choice,
  options,
  hasAnswered,
}: {
  module: Module;
  choice: AddonModChoiceChoice;
  options: AddonModChoiceOption[];
  hasAnswered: boolean;
}) {
  const allowsMultiple = Boolean(choice.allowmultiple);
  const { pop } = useNavigation();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const sortedOptions = useMemo(
    () => [...options].sort((a, b) => getChoiceOptionLabel(a).localeCompare(getChoiceOptionLabel(b))),
    [options],
  );
  const initialResponses = useMemo(
    () => options.filter((option) => option.checked).map((option) => String(option.id)),
    [options],
  );
  const [selectedById, setSelectedById] = useState<Record<number, boolean>>(() =>
    options.reduce<Record<number, boolean>>((acc, option) => {
      acc[option.id] = initialResponses.includes(String(option.id));
      return acc;
    }, {}),
  );
  const [selectedResponse, setSelectedResponse] = useState<string>(initialResponses[0] ?? String(options[0]?.id ?? ""));

  const submitTitle = hasAnswered ? "Update Response" : "Submit Response";

  return (
    <Form
      isLoading={isSubmitting}
      navigationTitle={`${submitTitle}: ${module.name}`}
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title={submitTitle}
            onSubmit={async () => {
              const responses = allowsMultiple
                ? options.filter((option) => selectedById[option.id]).map((option) => option.id)
                : [Number(selectedResponse)].filter((response) => Number.isFinite(response));

              if (responses.length === 0) {
                await showToast({ style: Toast.Style.Failure, title: "Select at least one option" });
                return;
              }

              setIsSubmitting(true);
              try {
                await submitChoiceResponse(choice.id, responses);
                await Promise.all([
                  invalidateChoiceQueries(),
                  showToast({
                    style: Toast.Style.Success,
                    title: hasAnswered ? "Response updated" : "Response submitted",
                  }),
                ]);
                pop();
              } catch (error) {
                await showToast({
                  style: Toast.Style.Failure,
                  title: hasAnswered ? "Failed to update response" : "Failed to submit response",
                  message: getErrorMessage(error),
                });
              } finally {
                setIsSubmitting(false);
              }
            }}
          />
        </ActionPanel>
      }
    >
      {allowsMultiple ? (
        <>
          {sortedOptions.map((option) => (
            <Form.Checkbox
              key={option.id}
              id={`response-${option.id}`}
              label={getChoiceOptionLabel(option)}
              value={Boolean(selectedById[option.id])}
              onChange={(checked) =>
                setSelectedById((current) => ({
                  ...current,
                  [option.id]: checked,
                }))
              }
            />
          ))}
        </>
      ) : (
        <Form.Dropdown id="response" title="Option" value={selectedResponse} onChange={setSelectedResponse}>
          {sortedOptions.map((option) => (
            <Form.Dropdown.Item key={option.id} value={String(option.id)} title={getChoiceOptionLabel(option)} />
          ))}
        </Form.Dropdown>
      )}
    </Form>
  );
}

function ChoiceOptionsList({ module, options }: { module: Module; options: AddonModChoiceOption[] }) {
  const sortedOptions = useMemo(() => [...options].sort((a, b) => b.countanswers - a.countanswers), [options]);
  return (
    <List navigationTitle={`${module.name} Options`} isShowingDetail={true}>
      {sortedOptions.map((option) => (
        <List.Item
          key={option.id}
          icon={option.checked ? Icon.CheckCircle : Icon.Circle}
          title={getChoiceOptionLabel(option)}
          accessories={getChoiceOptionAccessories(option)}
          detail={
            <List.Item.Detail
              markdown={turndown(option.text)}
              metadata={
                <List.Item.Detail.Metadata>
                  <List.Item.Detail.Metadata.Label title="Responses" text={String(option.countanswers)} />
                  {option.maxanswers > 0 && (
                    <List.Item.Detail.Metadata.Label
                      title="Capacity"
                      text={`${option.countanswers} / ${option.maxanswers}`}
                    />
                  )}
                  <List.Item.Detail.Metadata.Label
                    title="Your Selection"
                    text={option.checked ? "Selected" : "Not selected"}
                  />
                </List.Item.Detail.Metadata>
              }
            />
          }
          actions={<ActionPanel>{module.url && <OpenInBrowserAction url={module.url} />}</ActionPanel>}
        />
      ))}
    </List>
  );
}

function getChoiceAccessories(
  choice: AddonModChoiceChoice,
  selectedOptions: AddonModChoiceOption[],
): List.Item.Accessory[] {
  if (selectedOptions.length > 0) {
    return [
      {
        text:
          selectedOptions.length === 1
            ? { value: "Answered", color: Color.Green }
            : { value: `${selectedOptions.length} selected`, color: Color.Green },
      },
    ];
  }

  if (hasChoiceClosed(choice)) {
    return [{ text: { value: "Closed", color: Color.Red } }];
  }

  if (!hasChoiceOpened(choice)) {
    return [{ text: { value: "Pending", color: Color.Orange } }];
  }

  return [{ text: { value: "Open", color: Color.Blue } }];
}

function getChoiceOptionAccessories(option: AddonModChoiceOption): List.Item.Accessory[] {
  const accessories: List.Item.Accessory[] = [{ text: String(option.countanswers) }];

  if (option.maxanswers > 0) {
    accessories.push({ text: `${option.countanswers}/${option.maxanswers}` });
  }

  if (option.checked) {
    accessories.push({ text: { value: "Mine", color: Color.Green } });
  }

  if (option.disabled && !option.checked) {
    accessories.push({ text: { value: "Full", color: Color.Orange } });
  }

  return accessories;
}

function getChoiceStatus(choice: AddonModChoiceChoice) {
  if (hasChoiceClosed(choice)) {
    return { value: "Closed", color: Color.Red };
  }
  if (!hasChoiceOpened(choice)) {
    return { value: "Not open yet", color: Color.Orange };
  }
  return { value: "Open", color: Color.Green };
}

function hasChoiceOpened(choice: AddonModChoiceChoice, timestamp = Math.floor(Date.now() / 1000)) {
  return !choice.timeopen || timestamp >= choice.timeopen;
}

function hasChoiceClosed(choice: AddonModChoiceChoice, timestamp = Math.floor(Date.now() / 1000)) {
  return Boolean(choice.timeclose && timestamp > choice.timeclose);
}

function canSubmitChoiceResponse(choice: AddonModChoiceChoice, hasAnswered: boolean) {
  if (!hasChoiceOpened(choice) || hasChoiceClosed(choice)) {
    return false;
  }
  if (hasAnswered && !choice.allowupdate) {
    return false;
  }
  return true;
}

function canClearChoiceResponse(choice: AddonModChoiceChoice, hasAnswered: boolean) {
  if (!hasAnswered) {
    return false;
  }
  if (!choice.allowupdate) {
    return false;
  }
  return hasChoiceOpened(choice) && !hasChoiceClosed(choice);
}

function getChoiceOptionLabel(option: AddonModChoiceOption) {
  const label = stripHTML(option.text);
  if (label.length > 0) {
    return label;
  }
  return `Option ${option.id}`;
}

async function submitChoiceResponse(choiceId: number, responses: number[]) {
  await requestWS("mod_choice_submit_choice_response", { choiceid: choiceId, responses });
}

async function deleteChoiceResponse(choiceId: number) {
  const response = await requestWS("mod_choice_delete_choice_responses", { choiceid: choiceId, responses: [] });
  if (!response.status) {
    throw new Error(response.warnings?.[0]?.message || "Failed to clear response");
  }
}

async function invalidateChoiceQueries() {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ["mod_choice_get_choices_by_courses"] }),
    queryClient.invalidateQueries({ queryKey: ["mod_choice_get_choice_options"] }),
    queryClient.invalidateQueries({ queryKey: ["mod_choice_get_choice_results"] }),
    queryClient.invalidateQueries({ queryKey: ["core_course_get_contents"] }),
  ]);
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  if (typeof error === "string" && error.trim().length > 0) {
    return error;
  }

  return "Unexpected error";
}
