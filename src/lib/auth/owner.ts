import "server-only";

export function getOwnerId() {
  const id = process.env.SUPABASE_OWNER_ID;
  return id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
    ? id.toLowerCase()
    : null;
}
