import test from "node:test";
import assert from "node:assert/strict";
import { isRealDate, isUuid, normalizeUrl, parseProgram, parseScholarship, parseUniversity } from "../src/lib/records/validate.ts";
import { buildHref, escapeLike, parseListParams, sanitizeSearch } from "../src/lib/records/params.ts";
import { addDays, dateInZone, formatDateOnly } from "../src/lib/time.ts";

const UID = "123e4567-e89b-42d3-a456-426614174000";

test("university: required fields, url normalization, length", () => {
  assert.equal(parseUniversity({ name: " ", country: "" }).ok, false);
  const r = parseUniversity({ name: " TU Munich ", country: "Germany", website: "tum.de" });
  assert.ok(r.ok && r.values.name === "TU Munich" && r.values.website === "https://tum.de/");
  const bad = parseUniversity({ name: "x".repeat(301), country: "DE", website: "javascript:alert(1)" });
  assert.ok(!bad.ok && bad.errors.name && bad.errors.website);
  assert.ok(!("is_preferred" in (parseUniversity({ name: "a", country: "b" }) as { values: object }).values));
  const ex = parseUniversity({ name: "a", country: "b", is_preferred: "on", university_type: "public" }, true);
  assert.ok(ex.ok && ex.values.is_preferred === true && ex.values.university_type === "public");
  assert.ok(!parseUniversity({ name: "a", country: "b", university_type: "x" }, true).ok);
});

test("urls: only http(s) with a host", () => {
  assert.equal(normalizeUrl("ftp://a.com"), null);
  assert.equal(normalizeUrl("data:text/html,x"), null);
  assert.equal(normalizeUrl("localhost"), null);
  assert.equal(normalizeUrl("http://a.edu/path?x=1"), "http://a.edu/path?x=1");
});

test("dates: real calendar days only", () => {
  assert.ok(isRealDate("2026-02-28") && isRealDate("2028-02-29"));
  assert.ok(!isRealDate("2026-02-30") && !isRealDate("2026-13-01") && !isRealDate("26-01-01") && !isRealDate("1800-01-01"));
  assert.equal(parseProgram({ university_id: UID, name: "n", application_deadline: "2026-02-31" }).ok, false);
});

test("date-only values never shift by timezone", () => {
  assert.equal(formatDateOnly("2026-12-31"), "31 Dec 2026");
  assert.equal(addDays("2026-12-31", 1), "2027-01-01");
  // 20:00 UTC on 12 Nov is already 13 Nov in Karachi (UTC+5).
  assert.equal(dateInZone("2026-11-12T20:00:00Z", "Asia/Karachi"), "2026-11-13");
});

test("program: foreign key shape, tuition needs currency, defaults", () => {
  assert.ok(!parseProgram({ name: "MSc", university_id: "nope" }).ok);
  const noCur = parseProgram({ name: "MSc", university_id: UID, tuition_fee: "1000" });
  assert.ok(!noCur.ok && noCur.errors.currency);
  assert.ok(!parseProgram({ name: "MSc", university_id: UID, tuition_fee: "-5", currency: "EUR" }).ok);
  assert.ok(!parseProgram({ name: "MSc", university_id: UID, tuition_fee: "5", currency: "XXX" }).ok);
  const ok = parseProgram({ name: "MSc", university_id: UID });
  assert.ok(ok.ok && ok.values.tuition_fee === null && ok.values.degree_type === "masters" && ok.values.application_deadline === null);
  const full = parseProgram({ name: "MSc", university_id: UID, tuition_fee: "1,500.50", currency: "EUR" });
  assert.ok(full.ok && full.values.tuition_fee === 1500.5);
});

test("scholarship: name-only quick add, funding rules, extras", () => {
  const q = parseScholarship({ name: "DAAD" });
  assert.ok(q.ok && q.values.funding_amount === null && q.values.official_url === null);
  assert.ok(!parseScholarship({ name: "" }).ok);
  assert.ok(!parseScholarship({ name: "x", funding_amount: "10" }).ok);
  assert.ok(!parseScholarship({ name: "x", funding_type: "stipend" }).ok); // not allowed before the migration
  assert.ok(parseScholarship({ name: "x", funding_type: "stipend" }, true).ok);
  const bad = parseScholarship({ name: "x", opening_date: "2026-05-02", application_deadline: "2026-05-01" }, true);
  assert.ok(!bad.ok && bad.errors.opening_date);
});

test("search sanitization blocks filter syntax", () => {
  assert.equal(sanitizeSearch("a,b),(c%_*\\"), "a b c");
  assert.equal(sanitizeSearch("x".repeat(200)).length, 80);
  assert.equal(escapeLike("50%_off\\"), "50\\%\\_off\\\\");
});

test("list params: whitelist sort, clamp page, keep only known filters", () => {
  const p = parseListParams({ q: " MIT ", sort: "evil", page: "-4", country: "Germany", junk: "1" }, ["name", "recent"], ["country"]);
  assert.deepEqual([p.q, p.sort, p.page, p.from, p.to, p.filters], ["MIT", "name", 1, 0, 19, { country: "Germany" }]);
  assert.equal(parseListParams({ page: "3", sort: "recent" }, ["name", "recent"], []).from, 40);
  assert.equal(buildHref("/x", { q: "a", page: "2" }, { page: null, country: "DE" }), "/x?q=a&country=DE");
});

test("uuid check", () => { assert.ok(isUuid(UID) && !isUuid("1; drop table") && !isUuid(undefined)); });
