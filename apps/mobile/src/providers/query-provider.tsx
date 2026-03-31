import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import React from "react";

import { QUERY_CACHE_MAX_AGE, queryClient, queryPersister } from "@/lib/query-client";

export function MoodleQueryProvider({ children }: { children: React.ReactNode }) {
  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{ maxAge: QUERY_CACHE_MAX_AGE, persister: queryPersister }}
    >
      {children}
    </PersistQueryClientProvider>
  );
}
