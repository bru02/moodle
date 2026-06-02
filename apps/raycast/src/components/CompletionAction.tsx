import { Action, Icon } from "@raycast/api";
import { useMutation } from "@tanstack/react-query";

import { useUser } from "../client";
import { getUrlForService } from "../helpers";
import { queryClient } from "../hooks/useWSQuery";
import { Module } from "../types";
import { CoreCompletionUpdateActivityCompletionStatusManuallyWSParams } from "../types/completion";
import {
  CoreCourseModuleCompletionStatus,
  CoreCourseModuleCompletionTracking,
  type CoreCourseGetContentsWSSection,
  type CoreCourseModuleWSCompletionData,
} from "../types/contents";

type MutationContext = {
  previousContentQueries: ReturnType<typeof getCourseContentQueries>;
};

export default function CompletionAction({ module }: { module: Module }) {
  const { token } = useUser();
  const completionData = module.completiondata;

  const mutation = useMutation<void, Error, boolean, MutationContext>(
    {
      mutationFn: (completed) =>
        updateCompletionStatus(token, module.id, completed),
      onMutate: async (completed) => {
        await queryClient.cancelQueries({
          queryKey: ["core_course_get_contents"],
        });

        const previousContentQueries = getCourseContentQueries();

        if (completionData) {
          const optimisticCompletion = buildOptimisticCompletion(
            completionData,
            completed,
          );
          queryClient.setQueriesData(
            { queryKey: ["core_course_get_contents"] },
            (data) =>
              updateCompletionInContentsData(
                data,
                module.id,
                optimisticCompletion,
              ),
          );
        }

        return { previousContentQueries };
      },
      onError: (_error, _completed, context) => {
        for (const [queryKey, data] of context?.previousContentQueries ?? []) {
          queryClient.setQueryData(queryKey, data);
        }
      },
      onSettled: () => {
        queryClient.invalidateQueries({
          queryKey: ["core_course_get_contents"],
        });
      },
    },
    queryClient,
  );

  const shouldRender =
    !!completionData &&
    module.completion === CoreCourseModuleCompletionTracking.MANUAL &&
    !completionData.isautomatic &&
    completionData.istrackeduser &&
    module.uservisible;

  if (!shouldRender || !completionData) {
    return null;
  }

  const isComplete =
    completionData.state !==
    CoreCourseModuleCompletionStatus.COMPLETION_INCOMPLETE;

  return (
    <Action
      title={isComplete ? "Mark as Incomplete" : "Mark as Complete"}
      icon={isComplete ? Icon.XMarkCircle : Icon.CheckCircle}
      onAction={() => {
        if (mutation.isPending) {
          return;
        }
        mutation.mutate(!isComplete);
      }}
    />
  );
}

function getCourseContentQueries() {
  return queryClient.getQueriesData<
    CoreCourseGetContentsWSSection[] | CoreCourseGetContentsWSSection[][]
  >({
    queryKey: ["core_course_get_contents"],
  });
}

function buildOptimisticCompletion(
  current: CoreCourseModuleWSCompletionData,
  completed: boolean,
): CoreCourseModuleWSCompletionData {
  return {
    ...current,
    state: completed
      ? CoreCourseModuleCompletionStatus.COMPLETION_COMPLETE
      : CoreCourseModuleCompletionStatus.COMPLETION_INCOMPLETE,
    timecompleted: completed ? Math.floor(Date.now() / 1000) : 0,
  };
}

function updateCompletionInContentsData(
  data: unknown,
  moduleId: number,
  completion: CoreCourseModuleWSCompletionData,
) {
  if (!Array.isArray(data)) return data;
  if (data.every(isCourseContentSection)) {
    return updateSectionsCompletion(data, moduleId, completion);
  }
  if (
    data.every((row) => Array.isArray(row) && row.every(isCourseContentSection))
  ) {
    return data.map((sections) =>
      updateSectionsCompletion(sections, moduleId, completion),
    );
  }
  return data;
}

function isCourseContentSection(
  value: unknown,
): value is CoreCourseGetContentsWSSection {
  return (
    !!value &&
    typeof value === "object" &&
    "modules" in value &&
    Array.isArray(value.modules)
  );
}

function updateSectionsCompletion(
  sections: CoreCourseGetContentsWSSection[],
  moduleId: number,
  completion: CoreCourseModuleWSCompletionData,
) {
  return sections.map((section) => {
    let changed = false;
    const modules = section.modules.map((mod) => {
      if (mod.id !== moduleId) return mod;
      changed = true;
      return { ...mod, completiondata: completion };
    });
    return changed ? { ...section, modules } : section;
  });
}

async function updateCompletionStatus(
  token: string,
  moduleId: number,
  completed: boolean,
) {
  const params: CoreCompletionUpdateActivityCompletionStatusManuallyWSParams = {
    cmid: moduleId,
    completed,
  };

  const response = await fetch(
    getUrlForService(
      "core_completion_update_activity_completion_status_manually",
      token,
    ),
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        cmid: params.cmid.toString(),
        completed: params.completed ? "1" : "0",
      }).toString(),
    },
  );

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    payload = undefined;
  }

  if (!response.ok || isMoodleError(payload)) {
    throw new Error(
      extractErrorMessage(payload) ?? "Failed to update completion status",
    );
  }
}

type MoodleErrorPayload = { exception?: string; message?: string };

function isMoodleError(payload: unknown): payload is MoodleErrorPayload {
  return Boolean(
    payload && typeof payload === "object" && "exception" in payload,
  );
}

function extractErrorMessage(payload: unknown) {
  if (payload && typeof payload === "object" && "message" in payload) {
    const message = (payload as { message?: unknown }).message;
    if (typeof message === "string" && message.trim().length > 0) {
      return message;
    }
  }
}
