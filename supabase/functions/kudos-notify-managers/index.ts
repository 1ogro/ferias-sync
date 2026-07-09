// kudos-notify-managers — notifies the recipient's direct manager and all
// active directors when a kudo is registered. Supports batched invocation
// (`kudo_ids`) so a multi-recipient kudo produces one DM per notified person.
// Idempotent per (sorted kudo_ids, recipient).
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { notifyRecipient } from "../_shared/notify-helpers.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const CATEGORY_LABEL: Record<string, string> = {
  teamwork: "🤝 Trabalho em equipe",
  innovation: "💡 Inovação",
  delivery: "🚀 Entrega",
  leadership: "🏆 Liderança",
  customer: "❤️ Foco no cliente",
};

function joinPtBr(names: string[]): string {
  if (names.length === 0) return "";
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} e ${names[1]}`;
  return `${names.slice(0, -1).join(", ")} e ${names[names.length - 1]}`;
}

async function sha1Short(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest("SHA-1", data);
  return Array.from(new Uint8Array(buf))
    .slice(0, 8)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({}));
    let ids: string[] = [];
    if (Array.isArray(body?.kudo_ids)) {
      ids = body.kudo_ids.filter((x: any) => typeof x === "string");
    } else if (typeof body?.kudo_id === "string") {
      ids = [body.kudo_id];
    }
    ids = Array.from(new Set(ids));
    if (ids.length === 0) {
      return new Response(JSON.stringify({ error: "kudo_id or kudo_ids required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: kudos } = await admin
      .from("kudos")
      .select("id, from_person_id, to_person_id, category, message")
      .in("id", ids);
    if (!kudos || kudos.length === 0) {
      return new Response(JSON.stringify({ error: "kudos not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Group by (from, category, message) — usually a single group.
    const groups = new Map<string, any[]>();
    for (const k of kudos) {
      const key = `${k.from_person_id}::${k.category}::${k.message}`;
      const arr = groups.get(key) || [];
      arr.push(k);
      groups.set(key, arr);
    }

    const summary: any[] = [];
    for (const [, groupKudos] of groups) {
      const sender = groupKudos[0];
      const toIds = Array.from(new Set(groupKudos.map((k) => k.to_person_id)));
      const groupIds = groupKudos.map((k) => k.id).sort();

      const { data: toPeople } = await admin
        .from("people").select("id, nome, gestor_id, ativo").in("id", toIds);
      const activeTo = (toPeople || []).filter((p: any) => p.ativo);
      if (activeTo.length === 0) {
        summary.push({ group: groupIds, skipped: "no_active_recipients" });
        continue;
      }

      const { data: from } = await admin.from("people").select("id, nome").eq("id", sender.from_person_id).maybeSingle();

      // Build recipient set: managers of each recipient + all active directors
      const recipientIds = new Set<string>();
      for (const p of activeTo) if (p.gestor_id) recipientIds.add(p.gestor_id);
      const { data: directors } = await admin
        .from("people").select("id").eq("ativo", true).eq("papel", "DIRETOR");
      (directors || []).forEach((d: any) => recipientIds.add(d.id));
      // Exclude sender and the kudo recipients themselves
      recipientIds.delete(sender.from_person_id);
      for (const p of activeTo) recipientIds.delete(p.id);
      if (recipientIds.size === 0) {
        summary.push({ group: groupIds, skipped: "no_notify_recipients" });
        continue;
      }

      const { data: recipients } = await admin
        .from("people").select("id, nome, email, ativo").in("id", Array.from(recipientIds));
      const active = (recipients || []).filter((r: any) => r.ativo && r.email);

      const categoryLabel = CATEGORY_LABEL[sender.category] || "🎉 Kudo";
      const toNames = activeTo.map((p: any) => p.nome);
      const toLabel = joinPtBr(toNames.map((n: string) => `*${n}*`));
      const isMulti = activeTo.length > 1;
      const slackText = isMulti
        ? `${categoryLabel}\n*${from?.nome || "Alguém"}* deu kudos para ${toLabel}\n> ${sender.message}`
        : `${categoryLabel}\n*${from?.nome || "Alguém"}* deu kudos para *${toNames[0]}*\n> ${sender.message}`;

      // Idempotency key — may be long if many kudos; hash when >200 chars.
      const rawKey = groupIds.join(",");
      const keyBase = rawKey.length > 200 ? `hash:${await sha1Short(rawKey)}:${groupIds.length}` : rawKey;

      const results: any[] = [];
      for (const r of active) {
        const auditKey = `${keyBase}:${r.id}`;
        const { data: dup } = await admin
          .from("audit_logs").select("id")
          .eq("entidade", "kudos")
          .eq("entidade_id", auditKey)
          .eq("acao", "KUDOS_NOTIFY")
          .maybeSingle();
        if (dup) { results.push({ id: r.id, skipped: true }); continue; }

        const emailSubject = isMulti
          ? `🎉 ${from?.nome || "Alguém"} deu kudos para ${activeTo.length} pessoas`
          : `🎉 ${from?.nome || "Alguém"} deu um kudo para ${toNames[0]}`;
        const namesHtml = isMulti
          ? `<ul style="margin:8px 0 12px 20px;">${toNames.map((n: string) => `<li><strong>${n}</strong></li>`).join("")}</ul>`
          : `<p><strong>${toNames[0]}</strong></p>`;
        const emailHtml = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color:#16a34a;">${categoryLabel}</h2>
            <p>Olá <strong>${r.nome}</strong>,</p>
            <p><strong>${from?.nome || "Alguém"}</strong> reconheceu ${isMulti ? "as seguintes pessoas" : "a pessoa abaixo"} com ${isMulti ? "kudos" : "um kudo"}:</p>
            ${namesHtml}
            <blockquote style="border-left:3px solid #16a34a;padding:8px 12px;background:#f0fdf4;margin:12px 0;">${sender.message}</blockquote>
            <p style="color:#666;font-size:12px;margin-top:24px;">Este é um email automático, por favor não responda.</p>
          </div>`;

        await notifyRecipient(
          admin,
          { person_id: r.id, email: r.email, nome: r.nome },
          { slackText, emailSubject, emailHtml }
        );

        await admin.from("audit_logs").insert({
          entidade: "kudos",
          entidade_id: auditKey,
          acao: "KUDOS_NOTIFY",
          actor_id: sender.from_person_id,
          payload: { kudo_ids: groupIds, recipient_id: r.id, to_person_ids: activeTo.map((p: any) => p.id) },
        });
        results.push({ id: r.id, sent: true });
      }
      summary.push({ group: groupIds, results });
    }

    return new Response(JSON.stringify({ ok: true, summary }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("kudos-notify-managers error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
