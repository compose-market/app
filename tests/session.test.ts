import assert from "node:assert/strict";
import test from "node:test";

import * as session from "@compose-market/theme/session";

test("published theme session package exports the shells used by web", () => {
  assert.equal(typeof session.ComposeKeyDialogShell, "function");
  assert.equal(typeof session.SessionBudgetDialogShell, "function");
  assert.equal(typeof session.SessionIndicatorShell, "function");
  assert.equal(typeof session.SessionManageDialogShell, "function");
});
