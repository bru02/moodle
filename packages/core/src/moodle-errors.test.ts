import { describe, expect, it } from "bun:test";

import {
  getMoodleErrorCode,
  getMoodleErrorMessage,
  getMoodleExceptionMessage,
  isMoodleErrorPayload,
} from "./moodle-errors";

describe("moodle-errors", () => {
  it("extracts nested ajax exception message/code from array payloads", () => {
    const payload = [
      {
        error: true,
        exception: {
          message: "Client IP address mismatch",
          errorcode: "ipmismatch",
          link: "https://moodle.uni-nke.hu/",
          moreinfourl: "https://docs.moodle.org/405/en/error/moodle/ipmismatch",
        },
      },
    ];

    expect(isMoodleErrorPayload(payload)).toBe(true);
    expect(getMoodleErrorMessage(payload)).toBe("Client IP address mismatch");
    expect(getMoodleErrorCode(payload)).toBe("ipmismatch");
    expect(getMoodleExceptionMessage(payload)).toBe("Client IP address mismatch");
  });

  it("still extracts flat moodle error payloads", () => {
    const payload = {
      message: "Invalid token",
      errorcode: "invalidtoken",
    };

    expect(isMoodleErrorPayload(payload)).toBe(true);
    expect(getMoodleErrorMessage(payload)).toBe("Invalid token");
    expect(getMoodleErrorCode(payload)).toBe("invalidtoken");
    expect(getMoodleExceptionMessage(payload)).toBeUndefined();
  });
});
