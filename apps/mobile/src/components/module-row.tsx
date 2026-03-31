import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator } from "react-native";

import type { ScopedModule } from "@moodle/core";

import { InsetRow, SymbolBadge } from "@/components/native-ui";
import { openModule } from "@/lib/module-navigation";
import { useAppState } from "@/providers/app-provider";

type ModuleRowProps = {
  module: ScopedModule;
  courseId: string;
  first?: boolean;
  last?: boolean;
};

export function ModuleRow({ module, courseId, first, last }: ModuleRowProps) {
  const { activeAccount, accountSession } = useAppState();
  const session = activeAccount ? accountSession(activeAccount.id) : null;
  const [loading, setLoading] = useState(false);
  const [showSpinner, setShowSpinner] = useState(false);
  const spinnerTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    if (loading) {
      spinnerTimer.current = setTimeout(() => setShowSpinner(true), 100);
    } else {
      clearTimeout(spinnerTimer.current);
      setShowSpinner(false);
    }
    return () => clearTimeout(spinnerTimer.current);
  }, [loading]);

  const handlePress = useCallback(async () => {
    if (!activeAccount) return;

    const isResource = module.module.modname === "resource";
    if (isResource) setLoading(true);

    try {
      await openModule({
        accountId: activeAccount.id,
        courseId,
        contentId: module.id,
        module: module.module,
        siteOrigin: activeAccount.origin,
        session,
      });
    } finally {
      if (isResource) setLoading(false);
    }
  }, [activeAccount, courseId, module, session]);

  return (
    <InsetRow
      first={first}
      last={last}
      title={module.module.name}
      subtitle={module.sectionName}
      leading={<SymbolBadge symbol={symbolForModule(module.module.modname)} />}
      accessory={showSpinner ? <ActivityIndicator /> : undefined}
      showChevron={!showSpinner}
      onPress={handlePress}
    />
  );
}

function symbolForModule(modname: string) {
  switch (modname) {
    case "assign":
      return "doc.text";
    case "attendance":
      return "checkmark.circle";
    case "book":
      return "books.vertical";
    case "folder":
      return "folder";
    case "forum":
      return "bubble.left.and.bubble.right";
    case "page":
      return "doc.plaintext";
    case "quiz":
      return "questionmark.circle";
    case "resource":
      return "arrow.down.doc";
    case "url":
      return "link";
    default:
      return "square.grid.2x2";
  }
}
