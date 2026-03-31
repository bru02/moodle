import { describe, expect, it } from "bun:test";

import { OFFLINE_ERROR_MESSAGE } from "./errors";
import { executeMoodleWSRequest } from "./request";

describe("executeMoodleWSRequest", () => {
  it("normalizes fetch transport failures into a stable offline message", async () => {
    const result = await executeMoodleWSRequest({
      siteOrigin: "https://moodle.example.com",
      token: "token",
      service: "core_webservice_get_site_info",
      fetcher: async () => {
        throw new TypeError("fetch failed");
      },
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("expected request failure");
    }
    expect(result.error).toBeInstanceOf(Error);
    expect(result.shouldRefresh).toBe(false);
    expect(result.error.message).toBe(OFFLINE_ERROR_MESSAGE);
  });
});
