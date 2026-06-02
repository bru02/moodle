import { describe, expect, it } from "bun:test";
import { parseCredentials } from "./credentials";

describe("parseCredentials", () => {
  it("accepts env-style credentials", () => {
    expect(
      parseCredentials(`
        siteOrigin=https://moodle.example.test
        username=ABC123
        password=secret
      `),
    ).toEqual({
      siteOrigin: "https://moodle.example.test",
      username: "ABC123",
      password: "secret",
      token: undefined,
      privateToken: undefined,
    });
  });

  it("accepts token credentials", () => {
    expect(
      parseCredentials(`
        url: https://moodle.example.test
        token: mobile-token
      `),
    ).toMatchObject({
      siteOrigin: "https://moodle.example.test",
      token: "mobile-token",
    });
  });
});
