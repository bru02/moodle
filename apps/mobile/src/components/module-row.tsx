import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, type ColorValue } from "react-native";

import type { ScopedModule } from "@moodle/core";

import { platformColors } from "@/constants/platform-colors";
import { InsetRow, SymbolBadge } from "@/components/native-ui";
import { openModule } from "@/lib/module-navigation";
import { useAppState } from "@/providers/app-provider";

type ModuleRowProps = {
  module: ScopedModule;
  courseId: string;
  tint?: ColorValue;
  first?: boolean;
  last?: boolean;
  /** When true, show the section name as a subtitle. Defaults to false to avoid
   * repeating the section title that's already shown in the group header above. */
  showSection?: boolean;
};

export function ModuleRow({ module, courseId, tint, first, last, showSection = false }: ModuleRowProps) {
  const { activeAccount, accountSession } = useAppState();
  const session = activeAccount ? accountSession(activeAccount.id) : null;
  const [loading, setLoading] = useState(false);
  const [showSpinner, setShowSpinner] = useState(false);
  const spinnerTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    if (loading) {
      spinnerTimer.current = setTimeout(() => setShowSpinner(true), 60);
    } else {
      clearTimeout(spinnerTimer.current);
      setShowSpinner(false);
    }
    return () => clearTimeout(spinnerTimer.current);
  }, [loading]);

  const handlePress = useCallback(async () => {
    if (!activeAccount) return;

    setLoading(true);

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
      setLoading(false);
    }
  }, [activeAccount, courseId, module, session]);

  const { symbol, tint: fallbackTint } = badgeForModule(module.module.modname);

  return (
    <InsetRow
      first={first}
      last={last}
      title={module.module.name}
      subtitle={showSection ? module.sectionName : undefined}
      leading={<SymbolBadge symbol={symbol} tint={tint ?? fallbackTint} />}
      accessory={showSpinner ? <ActivityIndicator /> : undefined}
      showChevron={!showSpinner}
      onPress={handlePress}
    />
  );
}

function badgeForModule(modname: string): { symbol: string; tint: ColorValue } {
  switch (modname) {
    case "assign":
      return { symbol: "square.and.pencil", tint: platformColors.systemOrange };
    case "attendance":
      return { symbol: "person.crop.circle.badge.checkmark", tint: platformColors.systemGreen };
    case "book":
      return { symbol: "book.fill", tint: platformColors.systemBrown };
    case "choice":
      return { symbol: "checklist", tint: platformColors.systemPurple };
    case "feedback":
      return { symbol: "star.bubble", tint: platformColors.systemYellow };
    case "folder":
      return { symbol: "folder.fill", tint: platformColors.systemBlue };
    case "forum":
      return { symbol: "bubble.left.and.bubble.right.fill", tint: platformColors.systemIndigo };
    case "glossary":
      return { symbol: "character.book.closed.fill", tint: platformColors.systemBrown };
    case "label":
      return { symbol: "tag.fill", tint: platformColors.systemGray };
    case "lesson":
      return { symbol: "graduationcap.fill", tint: platformColors.systemTeal };
    case "page":
      return { symbol: "doc.richtext.fill", tint: platformColors.systemBlue };
    case "quiz":
      return { symbol: "checkmark.square.fill", tint: platformColors.systemPink };
    case "resource":
      return { symbol: "doc.fill", tint: platformColors.systemBlue };
    case "scorm":
      return { symbol: "play.rectangle.fill", tint: platformColors.systemRed };
    case "survey":
      return { symbol: "list.bullet.clipboard.fill", tint: platformColors.systemPurple };
    case "url":
      return { symbol: "safari.fill", tint: platformColors.systemBlue };
    case "video":
      return { symbol: "play.tv.fill", tint: platformColors.systemRed };
    case "wiki":
      return { symbol: "text.book.closed.fill", tint: platformColors.systemTeal };
    case "workshop":
      return { symbol: "hammer.fill", tint: platformColors.systemOrange };
    case "chat":
      return { symbol: "message.fill", tint: platformColors.systemGreen };
    default:
      return { symbol: "square.grid.2x2.fill", tint: platformColors.systemGray };
  }
}
