import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveLocale, t } from "./index.ts";

test("t interpolates {name}", () => assert.equal(t("en", "home.greeting", { name: "Aki" }), "Hello, Aki"));
test("t leaves unknown placeholders", () => assert.equal(t("en", "home.greeting", {}), "Hello, {name}"));
test("t falls back to the key when missing everywhere", () => assert.equal(t("en", "no.such.key"), "no.such.key"));

test("user locale wins", () => assert.equal(resolveLocale("en", "ja"), "en"));
test("Accept-Language is used when the user has none", () => {
  assert.equal(resolveLocale(null, "en-US,en;q=0.9"), "en");
  assert.equal(resolveLocale(null, "fr,en;q=0.5,ja;q=0.8"), "ja");
});
test("defaults to ja", () => {
  assert.equal(resolveLocale(null, null), "ja");
  assert.equal(resolveLocale("xx", "fr,de"), "ja");
});
