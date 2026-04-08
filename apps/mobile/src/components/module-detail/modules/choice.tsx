import { useMutation } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Text, View } from "react-native";

import { platformColors } from "@/constants/platform-colors";

import { PrimaryButton } from "@/components/primary-button";
import { InsetGroup, InsetRow } from "@/components/native-ui";
import { requestWS, useWSQuery } from "@/lib/useWSQuery";

import { FactSection, formatFactDate, getFactRow, useModuleDetailAdapter } from "../shared";
import type { ModuleDetailProps } from "../types";

type ChoiceSummary = {
  id: number;
  cmid: number;
  name: string;
  allowmultiple?: boolean;
  allowupdate?: boolean;
  timeopen?: number;
  timeclose?: number;
};

type ChoiceOptionsResponse = {
  options: ChoiceOption[];
};

type ChoiceOption = {
  id: number;
  text: string;
  checked: boolean;
  disabled: boolean;
  countanswers: number;
  maxanswers: number;
};

export function ChoiceDetail({ scope, module }: ModuleDetailProps) {
  const { adapter } = useModuleDetailAdapter();
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const choicesQuery = useWSQuery<{ choices: ChoiceSummary[] }>(
    adapter,
    "mod_choice_get_choices_by_courses",
    { courseids: scope.courseIds },
    { enabled: Boolean(adapter) },
  );

  const choice = useMemo(
    () =>
      (choicesQuery.data as { choices: ChoiceSummary[] } | undefined)?.choices.find(
        (item) => item.id === module.module.instance || item.cmid === module.module.id,
      ),
    [choicesQuery.data, module.module.id, module.module.instance],
  );

  const optionsQuery = useWSQuery<ChoiceOptionsResponse>(
    adapter,
    "mod_choice_get_choice_options",
    { choiceid: choice?.id ?? -1 },
    { enabled: Boolean(adapter && choice?.id) },
  );

  const options = (optionsQuery.data as ChoiceOptionsResponse | undefined)?.options ?? [];
  const allowMultiple = Boolean(choice?.allowmultiple);
  const allowUpdate = choice?.allowupdate ?? true;

  useEffect(() => {
    const checkedIds = options.filter((item) => item.checked).map((item) => item.id);
    setSelectedIds(checkedIds);
  }, [optionsQuery.data]);

  const submitMutation = useMutation({
    mutationFn: async () => {
      if (!adapter || !choice) {
        throw new Error("Choice is unavailable");
      }

      await requestWS(adapter, "mod_choice_submit_choice_response", {
        choiceid: choice.id,
        responses: selectedIds,
      });
    },
    onSuccess: async () => {
      setStatusMessage("Response saved.");
      await optionsQuery.refetch();
    },
    onError: (error) => {
      setStatusMessage(error instanceof Error ? error.message : "Could not save response.");
    },
  });

  const rows = [
    getFactRow("Selection", allowMultiple ? "Multiple" : "Single"),
    getFactRow("Open", formatFactDate(choice?.timeopen)),
    getFactRow("Close", formatFactDate(choice?.timeclose)),
  ].filter((item): item is { label: string; value: string } => Boolean(item));

  return (
    <View style={{ gap: 14 }}>
      <FactSection
        title="Choice"
        rows={rows}
        isLoading={choicesQuery.isLoading || optionsQuery.isLoading}
        emptyCopy="Choice options are only available in Moodle."
      />

      {choice ? (
        <View style={{ gap: 10 }}>
          <Text selectable style={{ fontSize: 19, fontWeight: "700", color: platformColors.label }}>
            Choose an option
          </Text>

          <InsetGroup>
            {options.map((option, index) => {
              const selected = selectedIds.includes(option.id);
              const locked = option.disabled || submitMutation.isPending;

              return (
                <InsetRow
                  key={option.id}
                  first={index === 0}
                  last={index === options.length - 1}
                  title={option.text}
                  subtitle={`${option.countanswers}${option.maxanswers > 0 ? ` / ${option.maxanswers}` : ""} participants`}
                  detail={selected ? "Selected" : undefined}
                  showChevron={false}
                  onPress={() => {
                    if (locked) return;

                    setStatusMessage(null);
                    setSelectedIds((previous) => {
                      if (allowMultiple) {
                        return previous.includes(option.id)
                          ? previous.filter((id) => id !== option.id)
                          : [...previous, option.id];
                      }

                      return previous.includes(option.id) ? [] : [option.id];
                    });
                  }}
                />
              );
            })}
          </InsetGroup>

          <PrimaryButton
            label={submitMutation.isPending ? "Saving…" : "Submit response"}
            disabled={
              !allowUpdate ||
              submitMutation.isPending ||
              selectedIds.length === 0 ||
              (selectedIds.length === 1 && options.some((option) => option.id === selectedIds[0] && option.checked))
            }
            onPress={() => submitMutation.mutate()}
          />
          {!allowUpdate ? (
            <Text selectable style={{ fontSize: 13, color: platformColors.secondaryLabel }}>
              Responses for this activity cannot be changed.
            </Text>
          ) : null}
          {statusMessage ? (
            <Text selectable style={{ fontSize: 13, color: platformColors.secondaryLabel }}>
              {statusMessage}
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
