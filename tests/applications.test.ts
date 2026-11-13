import test from "node:test";
import assert from "node:assert/strict";
import {
  GROUPS, STATUS_VALUES, canTransition, countByGroup, deadlineState, duplicateKind, effectiveDeadline, progressOf,
  requirementsProgress, statusGroup, statusLabel,
} from "../src/lib/applications.ts";
import { parseApplication, parseRequirement, parseStatusChange } from "../src/lib/records/validate.ts";
import { parseListParams, sanitizeSearch } from "../src/lib/records/params.ts";
import { addDays, dateInZone } from "../src/lib/time.ts";

const UID = "123e4567-e89b-42d3-a456-426614174000";

test("every status belongs to exactly one group; stored values are unchanged from Phase 3", () => {
  const all = Object.values(GROUPS).flat();
  assert.equal(new Set(all).size, all.length, "no status in two groups");
  assert.deepEqual([...all].sort(), [...STATUS_VALUES].sort(), "groups cover every status");
  for (const old of ["researching", "preparing", "ready_to_apply", "submitted", "under_review", "interview", "accepted", "rejected", "withdrawn"])
    assert.ok(STATUS_VALUES.includes(old as never), old + " still valid");
  assert.equal(statusLabel("ready_to_apply"), "Ready to Submit");
  assert.equal(statusGroup("waitlisted"), "decisions");
});

test("grouping counts each application once", () => {
  const c = countByGroup(["researching", "preparing", "submitted", "interview", "accepted", "waitlisted", "withdrawn", "ready_to_apply"]);
  assert.deepEqual(c, { total: 8, in_progress: 3, submitted: 2, decisions: 2, withdrawn: 1 });
  assert.equal(c.in_progress + c.submitted + c.decisions + c.withdrawn, c.total);
});

test("status transitions", () => {
  assert.equal(canTransition("researching", "submitted").ok, true);
  assert.equal(canTransition("under_review", "accepted").ok, true);
  assert.equal(canTransition("waitlisted", "accepted").ok, true);
  assert.equal(canTransition("rejected", "accepted").ok, true, "appeals happen");
  assert.equal(canTransition("submitted", "submitted").ok, false);
  assert.equal(canTransition("submitted", "preparing").ok, false, "cannot un-submit");
  assert.equal(canTransition("accepted", "researching").ok, false);
  assert.equal(canTransition("withdrawn", "submitted").ok, false);
  assert.equal(canTransition("withdrawn", "preparing").ok, true, "reopen");
  assert.equal(canTransition("researching", "bogus").ok, false);
});

test("deadline precedence: application override, then program, then unknown", () => {
  assert.deepEqual(effectiveDeadline("2027-01-10", "2027-02-01"), { date: "2027-01-10", source: "application" });
  assert.deepEqual(effectiveDeadline(null, "2027-02-01"), { date: "2027-02-01", source: "program" });
  assert.deepEqual(effectiveDeadline(undefined, null), { date: null, source: null });
});

test("deadline urgency: closed and unknown are never overdue; date-only math does not shift", () => {
  const today = "2026-11-14";
  assert.equal(deadlineState("preparing", "2026-11-13", today), "overdue");
  assert.equal(deadlineState("preparing", today, today), "due_soon");
  assert.equal(deadlineState("preparing", addDays(today, 3), today), "due_soon");
  assert.equal(deadlineState("preparing", addDays(today, 4), today), "upcoming");
  assert.equal(deadlineState("preparing", null, today), "none");
  for (const s of ["submitted", "under_review", "accepted", "rejected", "withdrawn"]) assert.equal(deadlineState(s, "2020-01-01", today), "closed", s);
  // 20:00 UTC on 13 Nov is already 14 Nov in Karachi: the deadline of the 14th is due today, not overdue.
  const karachiToday = dateInZone("2026-11-13T20:00:00Z", "Asia/Karachi");
  assert.equal(deadlineState("preparing", "2026-11-14", karachiToday), "due_soon");
});

test("requirements progress is derived, 6 of 8 = 75%", () => {
  assert.deepEqual(requirementsProgress([]), { total: 0, done: 0, remaining: 0, percent: 0 });
  assert.deepEqual(progressOf(8, 6), { total: 8, done: 6, remaining: 2, percent: 75 });
  assert.equal(requirementsProgress([{ is_complete: true }, { is_complete: false }, { is_complete: false }]).percent, 33);
});

test("duplicate detection: soft warning, different intake allowed", () => {
  assert.equal(duplicateKind([], "Fall 2027", null), null);
  assert.equal(duplicateKind([{ id: "a", intake: "Fall 2027" }], " fall 2027 ", null), "same-intake");
  assert.equal(duplicateKind([{ id: "a", intake: "Fall 2027" }], "Spring 2028", null), "other-intake");
  assert.equal(duplicateKind([{ id: "a", intake: null }], null, null), "same-intake");
  assert.equal(duplicateKind([{ id: "a", intake: "Fall 2027" }], "Fall 2027", "a"), null, "editing itself is not a duplicate");
});

test("application validation", () => {
  assert.equal(parseApplication({}).ok, false);
  assert.ok(!parseApplication({ program_id: "x" }).ok);
  const ok = parseApplication({ program_id: UID });
  assert.ok(ok.ok && ok.values.status === "researching" && ok.values.application_deadline === null && ok.values.application_fee === null);
  assert.ok(!parseApplication({ program_id: UID, status: "done" }).ok);
  assert.ok(parseApplication({ program_id: UID, status: "waitlisted" }).ok);
  const fee = parseApplication({ program_id: UID, application_fee: "50" });
  assert.ok(!fee.ok && fee.errors.currency);
  assert.ok(parseApplication({ program_id: UID, application_fee: "50", currency: "USD" }).ok);
  assert.ok(!parseApplication({ program_id: UID, application_deadline: "2026-02-31" }).ok);
  assert.ok(!parseApplication({ program_id: UID, portal_url: "javascript:alert(1)" }).ok);
  const dates = parseApplication({ program_id: UID, submission_date: "2026-05-02", decision_date: "2026-05-01" });
  assert.ok(!dates.ok && dates.errors.decision_date);
  assert.ok(!parseApplication({ program_id: UID, reference_number: "x".repeat(101) }).ok);
});

test("requirement and status-change validation", () => {
  assert.ok(!parseRequirement({ title: "  " }).ok);
  assert.ok(!parseRequirement({ title: "SOP", due_date: "nope" }).ok);
  const r = parseRequirement({ title: " SOP ", notes: "", due_date: "2027-01-01" });
  assert.ok(r.ok && r.values.title === "SOP" && r.values.notes === null);
  assert.ok(!parseStatusChange({ status: "" }).ok);
  assert.ok(!parseStatusChange({ status: "submitted", note: "x".repeat(1001) }).ok);
  assert.ok(parseStatusChange({ status: "submitted", note: "Sent via portal" }).ok);
});

test("application list params: sort whitelist and hostile search", () => {
  const sorts = ["deadline", "updated", "created", "university"];
  const p = parseListParams({ q: "ref,(1)%", sort: "drop table", status: "submitted", page: "2" }, sorts, ["status", "country"]);
  assert.deepEqual([p.q, p.sort, p.page, p.filters], ["ref 1", "deadline", 2, { status: "submitted" }]);
  assert.equal(sanitizeSearch("a%,b"), "a b");
});
