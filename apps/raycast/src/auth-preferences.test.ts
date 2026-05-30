import assert from "node:assert/strict";
import test from "node:test";

import { parsePasswordTokenPair } from "./auth-preferences";

test("parses password token pair preferences", () => {
  const token = "a".repeat(32);
  const privateToken = "A1".repeat(32);

  assert.deepEqual(parsePasswordTokenPair(`${token}:${privateToken}`), {
    token,
    privateToken,
  });
});

test("rejects values that are not token pair preferences", () => {
  assert.equal(parsePasswordTokenPair("password"), null);
  assert.equal(
    parsePasswordTokenPair(`${"a".repeat(31)}:${"A".repeat(64)}`),
    null,
  );
  assert.equal(
    parsePasswordTokenPair(`${"a".repeat(32)}:${"A_".repeat(32)}`),
    null,
  );
});
