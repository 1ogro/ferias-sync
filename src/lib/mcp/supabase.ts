// Helper: build a Supabase client scoped to the caller's OAuth token so
// RLS runs as the signed-in user. Server-only, called from tool handlers.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { ToolContext } from "@lovable.dev/mcp-js";

export function supabaseForCaller(ctx: ToolContext): SupabaseClient {
  const url = process.env.SUPABASE_URL!;
  const anon = process.env.SUPABASE_PUBLISHABLE_KEY!;
  return createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Resolve the `people` row for the signed-in user via profiles.person_id. */
export async function getCallerPerson(ctx: ToolContext) {
  const sb = supabaseForCaller(ctx);
  const { data: prof, error: profErr } = await sb
    .from("profiles")
    .select("person_id")
    .eq("user_id", ctx.getUserId())
    .maybeSingle();
  if (profErr) throw new Error(`profiles: ${profErr.message}`);
  if (!prof?.person_id) return { sb, person: null as null };
  const { data: person, error: personErr } = await sb
    .from("people")
    .select("id, nome, email, papel, cargo, sub_time, local, ativo, is_admin")
    .eq("id", prof.person_id)
    .maybeSingle();
  if (personErr) throw new Error(`people: ${personErr.message}`);
  return { sb, person };
}
