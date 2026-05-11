import { Redirect, type Href } from "expo-router";

import { useAppState } from "@/providers/app-provider";

export default function Index() {
  const { ready, accounts, activeAccountId } = useAppState();

  if (!ready) {
    return null;
  }

  if (activeAccountId) {
    return <Redirect href={"/courses" as Href} />;
  }

  if (accounts.length > 0) {
    return <Redirect href={"/(auth)/accounts" as Href} />;
  }

  return <Redirect href={"/(auth)/login-sheet" as Href} />;
}
