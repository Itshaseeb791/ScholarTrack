// Pure list-query helpers: sanitize URL params into a bounded, whitelisted query description.
export const PAGE_SIZE = 20;
export type RawParams = Record<string, string | string[] | undefined>;

export const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

/** PostgREST `or()` uses , ( ) as syntax and ilike uses % _ \ *: strip them so text cannot alter the filter. */
export function sanitizeSearch(q: string): string {
  return q.replace(/[,()%*\\:"'`;]/g, " ").replace(/_/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
}
/** Escape LIKE wildcards for exact, case-insensitive matches (duplicate detection). */
export const escapeLike = (s: string) => s.replace(/[\\%_]/g, (m) => "\\" + m);

export function parseListParams(raw: RawParams, sorts: readonly string[], filterKeys: readonly string[]) {
  const page = Math.max(1, Math.min(10_000, parseInt(first(raw.page), 10) || 1));
  const sortRaw = first(raw.sort);
  const filters: Record<string, string> = {};
  for (const k of filterKeys) { const v = first(raw[k]).trim().slice(0, 100); if (v) filters[k] = v; }
  return {
    q: sanitizeSearch(first(raw.q)), page, sort: sorts.includes(sortRaw) ? sortRaw : sorts[0], filters,
    from: (page - 1) * PAGE_SIZE, to: page * PAGE_SIZE - 1,
  };
}
export type ListParams = ReturnType<typeof parseListParams>;
export const hasActiveFilters = (p: ListParams) => Boolean(p.q) || Object.keys(p.filters).length > 0;

export function buildHref(base: string, current: Record<string, string>, patch: Record<string, string | null>) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...current, ...patch })) if (v) sp.set(k, v);
  const s = sp.toString();
  return s ? `${base}?${s}` : base;
}
