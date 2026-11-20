// Pure validation shared by every Server Action and the unit tests. No imports on purpose.
import { STATUS_VALUES } from "../applications.ts";
import { TASK_PRIORITY_VALUES, TASK_STATUS_VALUES } from "../tasks.ts";
import { EVENT_TYPE_VALUES } from "../events.ts";
import { OFFSET_VALUES, SOURCE_TYPES, type SourceType } from "../reminders.ts";
import { isTimeOnly, zonedInstant } from "../time.ts";
export type Input = Record<string, string | undefined>;
export type Errors = Record<string, string>;
export type Parsed<T> = { ok: true; values: T } | { ok: false; errors: Errors };

export const CURRENCIES = ["USD", "EUR", "GBP", "PKR", "CAD", "AUD", "AED", "CHF", "SEK", "NOK", "DKK", "JPY", "CNY", "KRW", "SGD", "TRY", "NZD", "HKD", "MYR", "SAR", "QAR"] as const;
export const DEGREE_TYPES = [["masters", "Master's (general)"], ["msc", "MSc"], ["ma", "MA"], ["meng", "MEng"], ["mba", "MBA"], ["llm", "LLM"], ["other", "Other"]] as const;
export const FUNDING_TYPES_BASE = [["full", "Fully funded"], ["partial", "Partially funded"], ["other", "Other"]] as const;
export const FUNDING_TYPES_EXTRA = [["full", "Fully funded"], ["partial", "Partially funded"], ["tuition_waiver", "Tuition waiver"], ["stipend", "Stipend"], ["other", "Other"]] as const;
export const UNI_TYPES = [["public", "Public"], ["private", "Private"]] as const;

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v: unknown): v is string => typeof v === "string" && UUID_RE.test(v);

const clean = (v: string | undefined) => (v ?? "").replace(/\r\n/g, "\n").trim();

export function isRealDate(v: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(v + "T00:00:00Z");
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v && +v.slice(0, 4) >= 1900 && +v.slice(0, 4) <= 2200;
}

/** Normalizes a URL: bare domains get https://; only http(s) is accepted. */
export function normalizeUrl(v: string): string | null {
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(v) ? v : /^[a-z][a-z0-9+.-]*:/i.test(v) ? v : "https://" + v;
  try {
    const u = new URL(withScheme);
    if ((u.protocol !== "http:" && u.protocol !== "https:") || !u.hostname.includes(".")) return null;
    return u.toString();
  } catch { return null; }
}

class Collector {
  errors: Errors = {};
  input: Input;
  constructor(input: Input) { this.input = input; }
  text(key: string, label: string, max: number, required = false): string | null {
    const v = clean(this.input[key]);
    if (!v) { if (required) this.errors[key] = `${label} is required.`; return null; }
    if (v.length > max) { this.errors[key] = `${label} must be ${max} characters or fewer.`; return null; }
    return v;
  }
  url(key: string, label: string): string | null {
    const v = clean(this.input[key]);
    if (!v) return null;
    if (v.length > 500) { this.errors[key] = `${label} must be 500 characters or fewer.`; return null; }
    const n = normalizeUrl(v);
    if (!n) this.errors[key] = `${label} must be a valid web address (https://…).`;
    return n;
  }
  date(key: string, label: string): string | null {
    const v = clean(this.input[key]);
    if (!v) return null;
    if (!isRealDate(v)) { this.errors[key] = `${label} must be a valid date.`; return null; }
    return v;
  }
  money(key: string, label: string): number | null {
    const v = clean(this.input[key]).replace(/,/g, "");
    if (!v) return null;
    const n = Number(v);
    if (!/^\d+(\.\d{1,2})?$/.test(v) || !Number.isFinite(n) || n > 999_999_999_999) {
      this.errors[key] = `${label} must be a positive number (up to 2 decimals).`; return null;
    }
    return n;
  }
  choice<T extends string>(key: string, label: string, allowed: readonly T[], required = false): T | null {
    const v = clean(this.input[key]);
    if (!v) { if (required) this.errors[key] = `${label} is required.`; return null; }
    if (!(allowed as readonly string[]).includes(v)) { this.errors[key] = `Choose a valid ${label.toLowerCase()}.`; return null; }
    return v as T;
  }
  /** Amount needs a currency (DB CHECK); validate both here so the user sees a field error. */
  amountWithCurrency(amountKey: string, label: string) {
    const amount = this.money(amountKey, label);
    const currency = this.choice("currency", "Currency", CURRENCIES);
    if (amount !== null && !currency && !this.errors.currency) this.errors.currency = "Choose a currency for this amount.";
    return { amount, currency };
  }
  result<T>(values: T): Parsed<T> { return Object.keys(this.errors).length ? { ok: false, errors: this.errors } : { ok: true, values }; }
}

export function parseUniversity(input: Input, extras = false) {
  const c = new Collector(input);
  const v: Record<string, unknown> = {
    name: c.text("name", "Name", 300, true), country: c.text("country", "Country", 100, true),
    city: c.text("city", "City", 100), website: c.url("website", "Website"), notes: c.text("notes", "Notes", 5000),
  };
  if (extras) {
    v.university_type = c.choice("university_type", "Type", UNI_TYPES.map((t) => t[0]));
    v.is_preferred = clean(input.is_preferred) === "on" || clean(input.is_preferred) === "true";
  }
  return c.result(v);
}

export function parseProgram(input: Input) {
  const c = new Collector(input);
  const university_id = clean(input.university_id);
  if (!isUuid(university_id)) c.errors.university_id = "Choose a university.";
  const { amount, currency } = c.amountWithCurrency("tuition_fee", "Tuition fee");
  return c.result({
    university_id, name: c.text("name", "Program name", 300, true),
    degree_type: c.choice("degree_type", "Degree type", DEGREE_TYPES.map((d) => d[0])) ?? "masters",
    field_of_study: c.text("field_of_study", "Field of study", 200), intake: c.text("intake", "Intake", 100),
    duration: c.text("duration", "Duration", 100), tuition_fee: amount, currency,
    application_deadline: c.date("application_deadline", "Application deadline"),
    official_url: c.url("official_url", "Program URL"), requirements: c.text("requirements", "Requirements", 5000),
  });
}

/** Only the name is required, so a quick-add record can be completed later. */
export function parseScholarship(input: Input, extras = false) {
  const c = new Collector(input);
  const { amount, currency } = c.amountWithCurrency("funding_amount", "Funding amount");
  const v: Record<string, unknown> = {
    name: c.text("name", "Scholarship name", 300, true), provider: c.text("provider", "Provider", 300),
    country: c.text("country", "Country", 100),
    funding_type: c.choice("funding_type", "Funding type", (extras ? FUNDING_TYPES_EXTRA : FUNDING_TYPES_BASE).map((f) => f[0])),
    funding_amount: amount, currency, eligibility_requirements: c.text("eligibility_requirements", "Eligibility", 5000),
    application_deadline: c.date("application_deadline", "Application deadline"),
    official_url: c.url("official_url", "Official link"), notes: c.text("notes", "Notes", 5000),
  };
  if (extras) {
    v.opening_date = c.date("opening_date", "Opening date");
    if (v.opening_date && v.application_deadline && (v.opening_date as string) > (v.application_deadline as string))
      c.errors.opening_date = "Opening date must be on or before the deadline.";
  }
  return c.result(v);
}

// ---- Phase 6: applications ------------------------------------------------------------------------
export function parseApplication(input: Input) {
  const c = new Collector(input);
  const program_id = clean(input.program_id);
  if (!isUuid(program_id)) c.errors.program_id = "Choose a program.";
  const { amount, currency } = c.amountWithCurrency("application_fee", "Application fee");
  const status = c.choice("status", "Status", STATUS_VALUES) ?? "researching";
  const v = {
    program_id, status, application_deadline: c.date("application_deadline", "Deadline"),
    portal_url: c.url("portal_url", "Application portal"), reference_number: c.text("reference_number", "Reference number", 100),
    application_fee: amount, currency, intake: c.text("intake", "Intake", 100),
    submission_date: c.date("submission_date", "Submission date"), decision_date: c.date("decision_date", "Decision date"),
    expected_response_date: c.date("expected_response_date", "Expected response date"), notes: c.text("notes", "Notes", 5000),
  };
  if (v.submission_date && v.decision_date && v.decision_date < v.submission_date)
    c.errors.decision_date = "Decision date cannot be before the submission date.";
  return c.result(v);
}

export function parseRequirement(input: Input) {
  const c = new Collector(input);
  return c.result({ title: c.text("title", "Requirement", 300, true), notes: c.text("notes", "Notes", 2000), due_date: c.date("due_date", "Due date") });
}

export function parseStatusChange(input: Input) {
  const c = new Collector(input);
  return c.result({ status: c.choice("status", "Status", STATUS_VALUES, true), note: c.text("note", "Note", 1000) });
}

// ---- Phase 7: tasks, events, reminders ------------------------------------------------------------------
export function parseTask(input: Input) {
  const c = new Collector(input);
  const due_date = c.date("due_date", "Due date");
  const due_time = clean(input.due_time) || null;
  if (due_time && !isTimeOnly(due_time)) c.errors.due_time = "Time must look like 14:30.";
  else if (due_time && !due_date) c.errors.due_time = "Set a due date to use a due time.";
  const application_id = clean(input.application_id) || null;
  if (application_id && !isUuid(application_id)) c.errors.application_id = "Choose a valid application.";
  return c.result({
    title: c.text("title", "Title", 300, true), description: c.text("description", "Description", 5000),
    status: c.choice("status", "Status", TASK_STATUS_VALUES) ?? "todo", priority: c.choice("priority", "Priority", TASK_PRIORITY_VALUES) ?? "medium",
    due_date, due_time: due_time && isTimeOnly(due_time) && due_date ? due_time : null, application_id,
  });
}

/** Timed events convert the wall-clock input to an instant in the app timezone here, on the server. */
export function parseEvent(input: Input, timeZone = "Asia/Karachi") {
  const c = new Collector(input);
  const all_day = ["on", "true", "1"].includes(clean(input.all_day));
  const start_date = c.date("start_date", "Start date");
  if (!start_date && !c.errors.start_date) c.errors.start_date = "Start date is required.";
  const start_time = clean(input.start_time), end_time = clean(input.end_time);
  const end_date = c.date("end_date", "End date");
  const application_id = clean(input.application_id) || null;
  if (application_id && !isUuid(application_id)) c.errors.application_id = "Choose a valid application.";
  const common = {
    title: c.text("title", "Title", 300, true), event_type: c.choice("event_type", "Category", EVENT_TYPE_VALUES) ?? "other",
    location: c.text("location", "Location", 300), meeting_url: c.url("meeting_url", "Meeting link"), notes: c.text("notes", "Notes", 5000), application_id,
  };
  let times: { all_day: boolean; start_date: string | null; end_date: string | null; starts_at: string | null; ends_at: string | null } =
    { all_day, start_date: null, end_date: null, starts_at: null, ends_at: null };
  if (start_date) {
    if (all_day) {
      if (end_date && end_date < start_date) c.errors.end_date = "The end must not be before the start.";
      times = { all_day: true, start_date, end_date: end_date && end_date !== start_date ? end_date : null, starts_at: null, ends_at: null };
    } else {
      if (!start_time) c.errors.start_time = "Start time is required (or choose all-day).";
      else if (!isTimeOnly(start_time)) c.errors.start_time = "Time must look like 14:30.";
      if (end_time && !isTimeOnly(end_time)) c.errors.end_time = "Time must look like 14:30.";
      if (end_date && !end_time) c.errors.end_time = "Add an end time for the end date.";
      if (!c.errors.start_time && !c.errors.end_time && !c.errors.end_date) {
        const starts = zonedInstant(start_date, start_time, timeZone);
        let ends: Date | null = null;
        if (end_time) ends = zonedInstant(end_date ?? start_date, end_time, timeZone);
        if (ends && ends < starts) c.errors.end_time = "The end must not be before the start.";
        times = { all_day: false, start_date: null, end_date: null, starts_at: starts.toISOString(), ends_at: ends ? ends.toISOString() : null };
      }
    }
  }
  return c.result({ ...common, ...times });
}

export function parseReminder(input: Input, timeZone = "Asia/Karachi") {
  const c = new Collector(input);
  const source_type = clean(input.source_type) as SourceType;
  const source_id = clean(input.source_id);
  if (!(SOURCE_TYPES as readonly string[]).includes(source_type)) c.errors.source_type = "Choose what the reminder is for.";
  if (!isUuid(source_id)) c.errors.source_id = "Choose what the reminder is for.";
  const schedule = clean(input.schedule) === "custom" ? "custom" : "offset";
  let offsets: number[] = [], remind_at: string | null = null;
  if (schedule === "offset") {
    offsets = [...new Set(clean(input.offsets).split(",").filter(Boolean).map(Number))];
    if (offsets.length === 0) c.errors.offsets = "Choose at least one reminder time.";
    else if (offsets.some((n) => !OFFSET_VALUES.includes(n))) c.errors.offsets = "Choose valid reminder times.";
  } else {
    const d = c.date("remind_date", "Date"), t = clean(input.remind_time) || "09:00";
    if (!d && !c.errors.remind_date) c.errors.remind_date = "Date is required.";
    if (!isTimeOnly(t)) c.errors.remind_time = "Time must look like 14:30.";
    if (d && isTimeOnly(t)) remind_at = zonedInstant(d, t, timeZone).toISOString();
  }
  return c.result({ source_type, source_id, schedule, offsets, remind_at });
}
