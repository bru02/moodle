import { Redirect } from "expo-router";

import { useAppState } from "@/providers/app-provider";

export default function Index() {
  const { ready, accounts, activeAccountId } = useAppState();

  if (!ready) {
    return null;
  }

  if (activeAccountId) {
    return <Redirect href="/courses" />;
  }

  if (accounts.length > 0) {
    return <Redirect href="/accounts" />;
  }

  return <Redirect href="/login-sheet" />;
}

