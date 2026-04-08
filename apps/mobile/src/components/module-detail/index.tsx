import { Text, View } from "react-native";

import { platformColors } from "@/constants/platform-colors";

import { MoodleHtml } from "@/components/moodle-html";

import { GenericModuleDetail, moduleDetailComponents } from "./modules";
import { FilesSection, ModuleDateFacts, formatModuleKind, getVisibleFiles } from "./shared";
import type { ModuleDetailProps } from "./types";

export function ModuleDetail({ scope, module }: ModuleDetailProps) {
  const label2Color = platformColors.secondaryLabel;
  const files = getVisibleFiles(module);
  const DetailComponent = moduleDetailComponents[module.module.modname] ?? GenericModuleDetail;
  const shouldRenderDescriptionHeader = module.module.modname !== "label";

  return (
    <View style={{ gap: 18 }}>
      {shouldRenderDescriptionHeader ? (
        <View style={{ gap: 10 }}>
          <Text selectable style={{ fontSize: 13, fontWeight: "600", color: label2Color }}>
            {module.sectionName} · {formatModuleKind(module.module.modname)}
          </Text>
          {module.module.description ? (
            <MoodleHtml
              html={module.module.description}
              baseUrl={module.module.url}
              contents={module.module.contents}
              scopeId={scope.id}
              variant="secondary"
            />
          ) : null}
        </View>
      ) : null}

      <ModuleDateFacts module={module} />

      <DetailComponent scope={scope} module={module} />

      {module.module.modname !== "folder" && module.module.modname !== "resource" && files.length > 0 ? (
        <FilesSection title="Files" files={files} />
      ) : null}
    </View>
  );
}
