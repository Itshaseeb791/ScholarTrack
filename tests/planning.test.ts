import test from "node:test";
import assert from "node:assert/strict";
import { AGENDA_DAYS, groupByDay, monthGrid, occursOn, parseDay, parseView, periodLabel, rangeFor, shiftPeriod, sortDay } from "../src/lib/calendar.ts";
import { buildDeadlineItems, classify, countGroups, groupDeadlines, isStalePassed, urgencyOf } from "../src/lib/deadlines.ts";
import { canChangeTaskStatus, isOpenTask, taskCounts, taskState, toggledStatus } from "../src/lib/tasks.ts";
import { missingOffsets, reminderState, sourceClosed, triggerDay, type ReminderView } from "../src/lib/reminders.ts";
import { parseEvent, parseReminder, parseTask } from "../src/lib/records/validate.ts";
import { addDays, addMonths, daysInMonth, isDateOnly, startOfWeek, timeInZone, todayIn, zonedInstant } from "../src/lib/time.ts";

const UID = "123e4567-e89b-42d3-a456-426614174000";
const TZ = "Asia/Karachi";

test("month grid: always 6 weeks starting Monday, covers the month, handles leap years and year ends", () => {
  const g = monthGrid("2026-11-13");
  assert.equal(g.weeks.length, 6); assert.ok(g.weeks.every((w) => w.length === 7));
  assert.equal(g.from, "2026-10-26"); assert.equal(g.to, "2026-12-06"); // 1 Nov 2026 is a Sunday
  assert.ok(g.weeks[0].every((d, i) => addDays(g.from, i) === d));
  const feb = monthGrid("2028-02-10");
  assert.ok(feb.weeks.flat().includes("2028-02-29"), "leap day present");
  assert.equal(daysInMonth(2028, 2), 29); assert.equal(daysInMonth(2026, 2), 28); assert.equal(daysInMonth(1900, 2), 28); assert.equal(daysInMonth(2000, 2), 29);
  const dec = monthGrid("2026-12-31");
  assert.ok(dec.weeks.flat().includes("2027-01-03"), "grid spills into next year");
  assert.equal(monthGrid("2026-01-01").from, "2025-12-29");
});

test("ranges per view, week boundaries and navigation", () => {
  assert.deepEqual(rangeFor("week", "2026-11-15"), { from: "2026-11-09", to: "2026-11-15" }, "Sunday belongs to the week that started Monday");
  assert.deepEqual(rangeFor("week", "2026-11-16"), { from: "2026-11-16", to: "2026-11-22" });
  assert.deepEqual(rangeFor("day", "2026-11-13"), { from: "2026-11-13", to: "2026-11-13" });
  const a = rangeFor("agenda", "2026-11-13");
  assert.equal(a.from, "2026-11-13"); assert.equal(a.to, addDays("2026-11-13", AGENDA_DAYS - 1));
  assert.equal(shiftPeriod("month", "2026-01-31", 1), "2026-02-28");
  assert.equal(shiftPeriod("month", "2026-01-15", -1), "2025-12-15");
  assert.equal(shiftPeriod("week", "2026-11-13", -1), "2026-11-06");
  assert.equal(shiftPeriod("day", "2026-12-31", 1), "2027-01-01");
  assert.equal(shiftPeriod("agenda", "2026-11-13", 1), "2026-12-13");
  assert.equal(periodLabel("month", "2026-11-13"), "November 2026");
  assert.equal(startOfWeek("2026-11-09"), "2026-11-09");
});

test("view and date parameters are sanitized", () => {
  assert.equal(parseView("bogus"), "month"); assert.equal(parseView("agenda"), "agenda");
  assert.equal(parseDay("2026-02-30", "2026-11-13"), "2026-11-13"); assert.equal(parseDay("nope", "x"), "x"); assert.equal(parseDay("2026-11-14", "x"), "2026-11-14");
  assert.ok(isDateOnly("2028-02-29")); assert.ok(!isDateOnly("2026-02-29"));
});

test("timezone: wall clock to instant and back, date-only values are never shifted", () => {
  assert.equal(zonedInstant("2026-11-13", "09:00", TZ).toISOString(), "2026-11-13T04:00:00.000Z");
  assert.equal(zonedInstant("2026-11-13", "00:30", TZ).toISOString(), "2026-11-12T19:30:00.000Z"); // previous UTC day
  assert.equal(timeInZone("2026-11-12T19:30:00Z", TZ), "00:30");
  assert.equal(todayIn(TZ, new Date("2026-11-12T19:30:00Z")), "2026-11-13");
  assert.equal(addMonths("2028-01-31", 1), "2028-02-29");
  // a date-only deadline is the same day in every view
  const items = buildDeadlineItems({ scholarships: [{ id: "1", name: "S", application_deadline: "2026-12-31" }] }, { timeZone: TZ });
  assert.equal(items[0].date, "2026-12-31"); assert.equal(items[0].time, null);
});

test("deadline items: precedence, deduplication and closed-record rules", () => {
  const items = buildDeadlineItems({
    programs: [{ id: "p1", name: "Covered", application_deadline: "2026-12-01" }, { id: "p2", name: "Free", application_deadline: "2026-12-02", university_name: "TUM", university_country: "Germany" }, { id: "p3", name: "No date", application_deadline: null }],
    applications: [
      { id: "a1", program_id: "p1", status: "preparing", effective_deadline: "2026-11-20", university_name: "ETH", program_name: "MSc" },
      { id: "a2", program_id: "p9", status: "submitted", effective_deadline: "2026-11-21", university_name: "KTH", program_name: "MSc" },
      { id: "a3", program_id: "p8", status: "withdrawn", effective_deadline: "2026-11-22", university_name: "UCL", program_name: "MSc" },
      { id: "a4", program_id: "p7", status: "preparing", effective_deadline: null, university_name: "EPFL", program_name: "MSc" },
    ],
    requirements: [
      { id: "r1", title: "SOP", due_date: "2026-11-18", is_complete: false, application_id: "a1" },
      { id: "r2", title: "Done", due_date: "2026-11-18", is_complete: true, application_id: "a1" },
      { id: "r3", title: "Closed app", due_date: "2026-11-18", is_complete: false, application_id: "a2" },
    ],
    tasks: [
      { id: "t1", title: "Open", due_date: "2026-11-10", status: "todo" }, { id: "t2", title: "Done", due_date: "2026-11-10", status: "completed" },
      { id: "t3", title: "Cancelled", due_date: "2026-11-10", status: "cancelled" }, { id: "t4", title: "Timed", due_date: "2026-11-11", due_time: "14:30:00", status: "todo" },
    ],
    events: [
      { id: "e1", title: "Interview", starts_at: "2026-11-12T19:30:00Z", ends_at: "2026-11-12T20:30:00Z", all_day: false },
      { id: "e2", title: "Conference", all_day: true, start_date: "2026-11-14", end_date: "2026-11-16" },
    ],
  }, { timeZone: TZ });
  const by = (id: string) => items.find((i) => i.id === id);
  assert.ok(!by("pp1"), "program with an application is not listed twice"); assert.ok(by("pp2")); assert.ok(!by("pp3"), "no date, no item");
  assert.ok(by("aa1") && !by("aa2") && !by("aa3"), "only pending applications are deadlines");
  assert.ok(!by("aa4"), "an unknown deadline is not listed as dated");
  assert.ok(by("rr1") && !by("rr2") && !by("rr3"), "completed requirements and requirements of closed applications are not pending");
  assert.ok(by("tt1") && !by("tt2") && !by("tt3"));
  assert.equal(by("tt4")?.time, "14:30"); assert.equal(by("tt4")?.allDay, false);
  assert.equal(by("ee1")?.date, "2026-11-13"); assert.equal(by("ee1")?.time, "00:30", "UTC instant lands on the Karachi day");
  assert.deepEqual([by("ee2")?.date, by("ee2")?.endDate], ["2026-11-14", "2026-11-16"]);
  const withDone = buildDeadlineItems({ tasks: [{ id: "t2", title: "Done", due_date: "2026-11-10", status: "completed" }] }, { includeDone: true });
  assert.equal(withDone[0].done, true);
  const undated = buildDeadlineItems({ applications: [{ id: "a4", status: "preparing", effective_deadline: null, university_name: "E", program_name: "M" }], tasks: [{ id: "t5", title: "No date", due_date: null, status: "todo" }] }, { includeUndated: true });
  assert.deepEqual(undated.map((i) => i.date), [null, null]);
});

test("deadline groups are mutually exclusive, unknown is never overdue", () => {
  const today = "2026-11-14";
  assert.deepEqual(["2026-11-13", "2026-11-14", "2026-11-15", "2026-11-21", "2026-11-22", "2026-12-14", "2026-12-15", null].map((d) => classify(d, today)),
    ["overdue", "today", "next7", "next7", "next30", "next30", "later", "none"]);
  const items = buildDeadlineItems({ tasks: [
    { id: "1", title: "a", due_date: "2026-11-10", status: "todo" }, { id: "2", title: "b", due_date: today, status: "todo" }, { id: "3", title: "c", due_date: "2026-11-20", status: "todo" },
    { id: "4", title: "d", due_date: "2027-03-01", status: "todo" }, { id: "5", title: "e", due_date: null, status: "todo" },
  ] }, { includeUndated: true });
  const g = groupDeadlines(items, today);
  assert.equal(countGroups(g), items.length, "every item is in exactly one group");
  assert.deepEqual([g.overdue.length, g.today.length, g.next7.length, g.next30.length, g.later.length, g.none.length], [1, 1, 1, 0, 1, 1]);
  assert.equal(urgencyOf(null, today), "none"); assert.equal(urgencyOf("2026-11-17", today), "due_soon"); assert.equal(urgencyOf("2026-11-18", today), "upcoming");
  const research = buildDeadlineItems({ scholarships: [{ id: "s1", name: "old", application_deadline: "2026-09-01" }, { id: "s2", name: "recent", application_deadline: "2026-11-01" }] });
  assert.ok(isStalePassed(research[0], today) && !isStalePassed(research[1], today), "passed research dates fade after 30 days");
  assert.equal(groupDeadlines(research, today).overdue.length, 1);
});

test("calendar grouping: multi-day items span days, ordering is stable", () => {
  const items = buildDeadlineItems({
    tasks: [{ id: "t", title: "Task", due_date: "2026-11-14", status: "todo" }],
    events: [{ id: "c", title: "Conf", all_day: true, start_date: "2026-11-13", end_date: "2026-11-15" }, { id: "i", title: "Call", starts_at: "2026-11-14T05:00:00Z", all_day: false }],
    scholarships: [{ id: "s", name: "Sch", application_deadline: "2026-11-14" }],
  }, { timeZone: TZ });
  const map = groupByDay(items, "2026-11-12", "2026-11-16");
  assert.deepEqual([...map.keys()], ["2026-11-12", "2026-11-13", "2026-11-14", "2026-11-15", "2026-11-16"]);
  assert.deepEqual(map.get("2026-11-12"), []);
  assert.equal(map.get("2026-11-13")?.length, 1); assert.equal(map.get("2026-11-15")?.length, 1);
  assert.deepEqual(map.get("2026-11-14")?.map((i) => i.id), ["ss", "tt", "ec", "ei"], "all-day first (by kind order), then timed");
  const day14 = sortDay(map.get("2026-11-14")!).map((i) => i.kind);
  assert.equal(day14[day14.length - 1], "event", "timed items come after all-day items");
  assert.ok(occursOn(items.find((i) => i.id === "ec")!, "2026-11-15") && !occursOn(items.find((i) => i.id === "ec")!, "2026-11-16"));
  const clipped = groupByDay(items, "2026-11-14", "2026-11-14");
  assert.equal(clipped.get("2026-11-14")?.some((i) => i.id === "ec"), true, "a multi-day item that started before the range still shows");
});

test("task states, completion semantics and counts", () => {
  const today = "2026-11-14";
  assert.equal(taskState({ status: "todo", due_date: "2026-11-13" }, today), "overdue");
  assert.equal(taskState({ status: "in_progress", due_date: today }, today), "today");
  assert.equal(taskState({ status: "todo", due_date: "2026-11-15" }, today), "upcoming");
  assert.equal(taskState({ status: "todo", due_date: null }, today), "no_date");
  assert.equal(taskState({ status: "completed", due_date: "2020-01-01" }, today), "completed", "completed is never overdue");
  assert.equal(taskState({ status: "cancelled", due_date: "2020-01-01" }, today), "cancelled");
  assert.equal(toggledStatus("todo"), "completed"); assert.equal(toggledStatus("in_progress"), "completed"); assert.equal(toggledStatus("completed"), "todo");
  assert.ok(canChangeTaskStatus("todo", "completed").ok && canChangeTaskStatus("cancelled", "todo").ok);
  assert.ok(!canChangeTaskStatus("todo", "todo").ok && !canChangeTaskStatus("todo", "done").ok);
  assert.ok(isOpenTask("todo") && !isOpenTask("completed"));
  assert.deepEqual(taskCounts([{ status: "todo", due_date: "2026-11-01" }, { status: "completed", due_date: "2026-11-01" }, { status: "todo", due_date: today }, { status: "cancelled", due_date: null }], today), { open: 2, overdue: 1, today: 1, completed: 1 });
});

test("task validation", () => {
  assert.ok(!parseTask({}).ok && !parseTask({ title: "  " }).ok);
  const ok = parseTask({ title: " Write SOP ", due_date: "2026-12-01", due_time: "09:30", application_id: UID });
  assert.ok(ok.ok && ok.values.title === "Write SOP" && ok.values.status === "todo" && ok.values.priority === "medium" && ok.values.due_time === "09:30");
  assert.ok(!parseTask({ title: "x", due_time: "09:30" }).ok, "time needs a date");
  assert.ok(!parseTask({ title: "x", due_date: "2026-12-01", due_time: "25:00" }).ok);
  assert.ok(!parseTask({ title: "x", priority: "critical" }).ok && parseTask({ title: "x", priority: "urgent" }).ok);
  assert.ok(!parseTask({ title: "x", status: "done" }).ok && !parseTask({ title: "x", application_id: "nope" }).ok);
  assert.ok(!parseTask({ title: "x".repeat(301) }).ok && !parseTask({ title: "x", due_date: "2026-02-30" }).ok);
});

test("event validation: all-day vs timed, end after start, timezone conversion", () => {
  const timed = parseEvent({ title: "Interview", start_date: "2026-11-13", start_time: "09:00", end_time: "10:00" });
  assert.ok(timed.ok && timed.values.starts_at === "2026-11-13T04:00:00.000Z" && timed.values.ends_at === "2026-11-13T05:00:00.000Z" && timed.values.start_date === null);
  const allDay = parseEvent({ title: "Webinar", all_day: "on", start_date: "2026-11-13", end_date: "2026-11-15" });
  assert.ok(allDay.ok && allDay.values.all_day && allDay.values.start_date === "2026-11-13" && allDay.values.end_date === "2026-11-15" && allDay.values.starts_at === null);
  const same = parseEvent({ title: "x", all_day: "on", start_date: "2026-11-13", end_date: "2026-11-13" });
  assert.ok(same.ok && same.values.end_date === null, "same-day end is normalized away");
  assert.ok(!parseEvent({ title: "x", start_date: "2026-11-13", start_time: "10:00", end_time: "09:00" }).ok, "end before start");
  assert.ok(!parseEvent({ title: "x", all_day: "on", start_date: "2026-11-13", end_date: "2026-11-12" }).ok);
  assert.ok(!parseEvent({ title: "x", start_date: "2026-11-13" }).ok, "timed needs a start time");
  assert.ok(!parseEvent({ title: "x", start_date: "2026-11-13", start_time: "10:00", end_date: "2026-11-14" }).ok, "end date needs an end time");
  const overnight = parseEvent({ title: "x", start_date: "2026-11-13", start_time: "23:00", end_date: "2026-11-14", end_time: "01:00" });
  assert.ok(overnight.ok && overnight.values.ends_at! > overnight.values.starts_at!);
  assert.ok(!parseEvent({ title: "x", start_date: "2026-11-13", start_time: "10:00", meeting_url: "javascript:alert(1)" }).ok);
  assert.ok(!parseEvent({ title: "", start_date: "2026-11-13", start_time: "10:00" }).ok);
});

test("reminder validation: source and schedule", () => {
  assert.ok(!parseReminder({}).ok);
  assert.ok(!parseReminder({ source_type: "dragon", source_id: UID, offsets: "1" }).ok, "unknown source type");
  assert.ok(!parseReminder({ source_type: "task", source_id: "x", offsets: "1" }).ok, "malformed source id");
  assert.ok(!parseReminder({ source_type: "task", source_id: UID, offsets: "" }).ok);
  assert.ok(!parseReminder({ source_type: "task", source_id: UID, offsets: "2" }).ok, "only supported offsets");
  const ok = parseReminder({ source_type: "application", source_id: UID, offsets: "7,3,3,0" });
  assert.ok(ok.ok && ok.values.offsets.length === 3);
  const custom = parseReminder({ source_type: "event", source_id: UID, schedule: "custom", remind_date: "2026-11-13", remind_time: "09:00" });
  assert.ok(custom.ok && custom.values.remind_at === "2026-11-13T04:00:00.000Z");
  assert.ok(!parseReminder({ source_type: "event", source_id: UID, schedule: "custom" }).ok);
});

const rem = (o: Partial<ReminderView>): ReminderView => ({
  id: "r", offset_days: 3, remind_at: null, enabled: true, acknowledged_at: null, dismissed_at: null,
  sourceType: "application", sourceTitle: "A", sourceDate: "2026-11-20", sourceClosed: false, sourceEnd: null, href: "/x", ...o,
});
test("reminder scheduling and state (offsets follow the source date)", () => {
  const now = new Date("2026-11-16T10:00:00Z"); // 16 Nov in Karachi
  assert.equal(triggerDay(rem({}), TZ), "2026-11-17");
  assert.equal(reminderState(rem({}), now, TZ), "scheduled");
  assert.equal(reminderState(rem({ sourceDate: "2026-11-19" }), now, TZ), "due", "deadline moved earlier: now due");
  assert.equal(reminderState(rem({ sourceDate: "2026-12-30" }), now, TZ), "scheduled", "deadline moved later: rescheduled");
  assert.equal(reminderState(rem({ offset_days: 0, sourceDate: "2026-11-16" }), now, TZ), "due", "at the deadline, on the day");
  assert.equal(reminderState(rem({ sourceDate: null }), now, TZ), "no_date");
  assert.equal(reminderState(rem({ sourceDate: "2026-11-19", acknowledged_at: "2026-11-16T00:00:00Z" }), now, TZ), "acknowledged");
  assert.equal(reminderState(rem({ sourceDate: "2026-11-19", dismissed_at: "2026-11-16T00:00:00Z" }), now, TZ), "dismissed");
  assert.equal(reminderState(rem({ sourceDate: "2026-11-19", enabled: false }), now, TZ), "disabled");
  assert.equal(reminderState(rem({ sourceDate: "2026-11-19", sourceClosed: true }), now, TZ), "closed");
  assert.equal(reminderState(rem({ sourceType: null }), now, TZ), "orphan");
  assert.equal(reminderState(rem({ sourceType: "scholarship", sourceDate: "2026-11-10", offset_days: 7 }), now, TZ), "closed", "scholarship deadline passed");
  assert.equal(reminderState(rem({ sourceType: "task", sourceDate: "2026-11-10", offset_days: 1 }), now, TZ), "due", "an overdue open task keeps reminding");
  assert.equal(reminderState(rem({ offset_days: null, remind_at: "2026-11-16T09:00:00Z" }), now, TZ), "due");
  assert.equal(reminderState(rem({ offset_days: null, remind_at: "2026-11-16T11:00:00Z" }), now, TZ), "scheduled");
  assert.equal(reminderState(rem({ sourceType: "event", offset_days: 1, sourceDate: "2026-11-17", sourceEnd: "2026-11-15T00:00:00Z" }), now, TZ), "closed", "event already over");
});

test("reminder deduplication and closed sources", () => {
  assert.deepEqual(missingOffsets([3], [3, 7]), [7]); assert.deepEqual(missingOffsets([1, 3, 7], [3]), []); assert.deepEqual(missingOffsets([null], [1]), [1]);
  assert.ok(sourceClosed("task", { status: "completed" }) && !sourceClosed("task", { status: "todo" }));
  assert.ok(sourceClosed("requirement", { is_complete: true }) && sourceClosed("requirement", { is_complete: false, app_status: "submitted" }) && !sourceClosed("requirement", { is_complete: false, app_status: "preparing" }));
  assert.ok(sourceClosed("application", { status: "withdrawn" }) && !sourceClosed("application", { status: "researching" }) && !sourceClosed("scholarship", {}));
});
