import type { FieldDef } from "@/components/records/record-form";
import { CURRENCIES, DEGREE_TYPES, FUNDING_TYPES_BASE, FUNDING_TYPES_EXTRA, UNI_TYPES } from "./validate";

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
