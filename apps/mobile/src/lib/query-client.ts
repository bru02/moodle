import AsyncStorage from "@react-native-async-storage/async-storage";
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import { QueryClient } from "@tanstack/react-query";

export const QUERY_CACHE_KEY = "moodle.mobile.query-cache";
export const QUERY_CACHE_MAX_AGE = 7 * 24 * 60 * 60 * 1000;

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60 * 1000,
      gcTime: QUERY_CACHE_MAX_AGE,
      retry: 1,
      networkMode: "offlineFirst",
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
    },
  },
});

export const queryPersister = createAsyncStoragePersister({
  storage: AsyncStorage,
  key: QUERY_CACHE_KEY,
});
