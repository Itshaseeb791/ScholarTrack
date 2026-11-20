import type { FieldDef } from "@/components/records/record-form";
import { CURRENCIES, DEGREE_TYPES, FUNDING_TYPES_BASE, FUNDING_TYPES_EXTRA, UNI_TYPES } from "./validate";
import { STARTER_REQUIREMENTS, STATUSES } from "../applications";
import { TASK_PRIORITIES, TASK_STATUSES } from "../tasks";
import { EVENT_TYPES } from "../events";

const currencyOptions = CURRENCIES.map((c) => [c, c] as const);

export const universityFields = (extras: boolean): FieldDef[] => [
  { name: "name", label: "University name", required: true, placeholder: "e.g. Technical University of Munich", wide: true },
  { name: "country", label: "Country", required: true, placeholder: "e.g. Germany" },
  { name: "city", label: "City", placeholder: "e.g. Munich" },
  { name: "website", label: "Official website", type: "url", placeholder: "https://www.example.edu", wide: true },
  ...(extras ? [
    { name: "university_type", label: "Type", type: "select", options: UNI_TYPES, empty: "Not specified" } as FieldDef,
    { name: "is_preferred", label: "Mark as preferred", type: "checkbox" } as FieldDef,
  ] : []),
  { name: "notes", label: "Notes", type: "textarea", placeholder: "Anything worth remembering" },
];

export const programFields = (universities: { id: string; name: string; country: string }[]): FieldDef[] => [
  { name: "university_id", label: "University", type: "select", required: true, empty: "Choose a university", wide: true, options: universities.map((u) => [u.id, `${u.name} (${u.country})`] as const) },
  { name: "name", label: "Program name", required: true, placeholder: "e.g. MSc Computer Science", wide: true },
  { name: "degree_type", label: "Degree type", type: "select", options: DEGREE_TYPES, empty: "Master's (general)" },
  { name: "field_of_study", label: "Field of study", placeholder: "e.g. Computer Science" },
  { name: "intake", label: "Intake term", placeholder: "e.g. Fall 2027" },
  { name: "duration", label: "Duration", placeholder: "e.g. 2 years" },
  { name: "tuition_fee", label: "Tuition fee", type: "number", placeholder: "Leave empty if unknown", hint: "Per year or total: note which in Requirements." },
  { name: "currency", label: "Currency", type: "select", options: currencyOptions, empty: "Not set" },
  { name: "application_deadline", label: "Application deadline", type: "date", hint: "Leave empty if not announced." },
  { name: "official_url", label: "Official program URL", type: "url", placeholder: "https://…" },
  { name: "requirements", label: "Admission & language requirements", type: "textarea", placeholder: "Language of instruction, IELTS/TOEFL scores, GPA, documents…" },
];

export const scholarshipFields = (extras: boolean): FieldDef[] => [
  { name: "name", label: "Scholarship name", required: true, placeholder: "e.g. DAAD Study Scholarship", wide: true },
  { name: "provider", label: "Provider / funding organization", placeholder: "e.g. DAAD" },
  { name: "country", label: "Country or region", placeholder: "e.g. Germany" },
  { name: "official_url", label: "Official website / application link", type: "url", placeholder: "https://…", wide: true },
  { name: "funding_type", label: "Funding type", type: "select", options: extras ? FUNDING_TYPES_EXTRA : FUNDING_TYPES_BASE, empty: "Not specified" },
  { name: "funding_amount", label: "Funding amount", type: "number", placeholder: "Leave empty if variable" },
  { name: "currency", label: "Currency", type: "select", options: currencyOptions, empty: "Not set" },
  ...(extras ? [{ name: "opening_date", label: "Opening date", type: "date" } as FieldDef] : []),
  { name: "application_deadline", label: "Application deadline", type: "date" },
  { name: "eligibility_requirements", label: "Eligibility, academic & language requirements, documents", type: "textarea", placeholder: "Who can apply, minimum GPA, IELTS, required documents…" },
  { name: "notes", label: "Notes", type: "textarea" },
];

export const applicationFields = (
  groups: { label: string; options: readonly (readonly [string, string])[] }[], creating: boolean,
): FieldDef[] => [
  { name: "program_id", label: "Program", type: "select", required: true, empty: "Choose a program", wide: true, groups, hint: "Programs are grouped by university; the university follows from the program." },
  { name: "status", label: "Status", type: "select", options: STATUSES.slice(1).map((x) => [x[0], x[1]] as const), empty: "Researching" },
  { name: "intake", label: "Intake", placeholder: "e.g. Fall 2027" },
  { name: "application_deadline", label: "Application deadline", type: "date", hint: "Optional. Overrides the program deadline for this application only." },
  { name: "expected_response_date", label: "Expected response date", type: "date" },
  { name: "portal_url", label: "Application portal URL", type: "url", placeholder: "https://…", wide: true },
  { name: "reference_number", label: "Reference number", placeholder: "Portal or application ID" },
  { name: "application_fee", label: "Application fee", type: "number", placeholder: "Leave empty if none or unknown" },
  { name: "currency", label: "Currency", type: "select", options: currencyOptions, empty: "Not set" },
  { name: "submission_date", label: "Submission date", type: "date", hint: "Filled in automatically when you mark it Submitted, if empty." },
  { name: "decision_date", label: "Decision date", type: "date" },
  ...(creating ? [{ name: "starter_requirements", label: "Starter checklist (optional, edit or delete later)", type: "checks", wide: true, options: STARTER_REQUIREMENTS.map((x) => [x, x] as const) } as FieldDef] : []),
  { name: "notes", label: "Notes", type: "textarea", placeholder: "Anything specific to this application" },
];

type Opts = readonly (readonly [string, string])[];
export const taskFields = (applications: Opts): FieldDef[] => [
  { name: "title", label: "Task", required: true, placeholder: "e.g. Ask Prof. Khan for a recommendation letter", wide: true },
  { name: "priority", label: "Priority", type: "select", options: TASK_PRIORITIES, empty: "Medium" },
  { name: "status", label: "Status", type: "select", options: TASK_STATUSES.slice(1), empty: "To do" },
  { name: "due_date", label: "Due date", type: "date" },
  { name: "due_time", label: "Due time (optional)", type: "time", hint: "Needs a due date. Uses the app timezone (Asia/Karachi)." },
  { name: "application_id", label: "Related application (optional)", type: "select", options: applications, empty: "Not linked to an application", wide: true },
  { name: "description", label: "Description", type: "textarea", placeholder: "Details, links, next steps" },
];

export const eventFields = (applications: Opts): FieldDef[] => [
  { name: "title", label: "Title", required: true, placeholder: "e.g. TUM admission interview", wide: true },
  { name: "event_type", label: "Category", type: "select", options: EVENT_TYPES.slice(0, -1), empty: "Other" },
  { name: "all_day", label: "All-day event (ignores the times below)", type: "checkbox" },
  { name: "start_date", label: "Start date", type: "date", required: true },
  { name: "start_time", label: "Start time", type: "time", hint: "Required unless all-day. Asia/Karachi." },
  { name: "end_date", label: "End date (optional)", type: "date" },
  { name: "end_time", label: "End time (optional)", type: "time" },
  { name: "location", label: "Location", placeholder: "Room, address or city" },
  { name: "meeting_url", label: "Meeting link", type: "url", placeholder: "https://…" },
  { name: "application_id", label: "Related application (optional)", type: "select", options: applications, empty: "Not linked to an application", wide: true },
  { name: "notes", label: "Notes", type: "textarea" },
];
