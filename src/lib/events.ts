// Custom calendar event categories (stored in events.event_type; the Phase 7 migration widens the Phase 3 list).
export const EVENT_TYPES = [
  ["interview", "Interview"], ["exam", "Exam"], ["appointment", "Appointment"], ["webinar", "Webinar"],
  ["consultation", "Consultation"], ["study", "Study session"], ["deadline", "Deadline"], ["other", "Other"],
] as const;
export const EVENT_TYPE_VALUES = EVENT_TYPES.map((t) => t[0]) as readonly string[];
export const eventTypeLabel = (v: unknown) => EVENT_TYPES.find((t) => t[0] === v)?.[1] ?? "Event";
