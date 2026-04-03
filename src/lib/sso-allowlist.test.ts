import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  canManageSsoAllowlist,
  getSsoAdminEmails,
  normalizeEmail,
} from "./sso-allowlist";

describe("normalizeEmail", () => {
  it("trims and lowercases", () => {
    expect(normalizeEmail("  User@Example.COM ")).toBe("user@example.com");
  });
});

describe("getSsoAdminEmails", () => {
  const prev = process.env.SSO_ALLOWLIST_ADMIN_EMAILS;

  beforeEach(() => {
    delete process.env.SSO_ALLOWLIST_ADMIN_EMAILS;
  });

  afterEach(() => {
    if (prev === undefined) {
      delete process.env.SSO_ALLOWLIST_ADMIN_EMAILS;
    } else {
      process.env.SSO_ALLOWLIST_ADMIN_EMAILS = prev;
    }
  });

  it("uses default admin when env is unset", () => {
    expect(getSsoAdminEmails()).toEqual(["jaume@somosgigson.com"]);
  });

  it("parses comma-separated env", () => {
    process.env.SSO_ALLOWLIST_ADMIN_EMAILS = " A@x.com , B@y.com ";
    expect(getSsoAdminEmails()).toEqual(["a@x.com", "b@y.com"]);
  });
});

describe("canManageSsoAllowlist", () => {
  const prev = process.env.SSO_ALLOWLIST_ADMIN_EMAILS;

  beforeEach(() => {
    delete process.env.SSO_ALLOWLIST_ADMIN_EMAILS;
  });

  afterEach(() => {
    if (prev === undefined) {
      delete process.env.SSO_ALLOWLIST_ADMIN_EMAILS;
    } else {
      process.env.SSO_ALLOWLIST_ADMIN_EMAILS = prev;
    }
  });

  it("returns false for empty email", () => {
    expect(canManageSsoAllowlist("")).toBe(false);
    expect(canManageSsoAllowlist(undefined)).toBe(false);
  });

  it("matches default admin case-insensitively", () => {
    expect(canManageSsoAllowlist("Jaume@somosgigson.com")).toBe(true);
  });

  it("respects SSO_ALLOWLIST_ADMIN_EMAILS", () => {
    process.env.SSO_ALLOWLIST_ADMIN_EMAILS = "ops@corp.test";
    expect(canManageSsoAllowlist("ops@corp.test")).toBe(true);
    expect(canManageSsoAllowlist("jaume@somosgigson.com")).toBe(false);
  });
});
