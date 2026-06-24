// kudos-notify-managers — notifies the recipient's direct manager and all
// active directors when a kudo is registered. Idempotent per (kudo_id, recipient).
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

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { kudo_id } = await req.json().catch(() => ({}));
    if (!kudo_id) {
      return new Response(JSON.stringify({ error: "kudo_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: kudo } = await admin
      .from("kudos")
      .select("id, from_person_id, to_person_id, category, message")
      .eq("id", kudo_id).maybeSingle();
    if (!kudo) return new Response(JSON.stringify({ error: "kudo not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { data: to } = await admin.from("people").select("id, nome, gestor_id").eq("id", kudo.to_person_id).maybeSingle();
    const { data: from } = await admin.from("people").select("id, nome").eq("id", kudo.from_person_id).maybeSingle();
    if (!to) return new Response(JSON.stringify({ error: "recipient missing" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    // Build recipient set: direct manager + all active directors
    const recipientIds = new Set<string>();
    if (to.gestor_id) recipientIds.add(to.gestor_id);
    const { data: directors } = await admin
      .from("people").select("id").eq("ativo", true).eq("papel", "DIRETOR");
    (directors || []).forEach((d: any) => recipientIds.add(d.id));
    // Exclude self and sender to avoid noisy duplicates
    recipientIds.delete(kudo.to_person_id);
    recipientIds.delete(kudo.from_person_id);
    if (recipientIds.size === 0) {
      return new Response(JSON.stringify({ skipped: "no_recipients" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: recipients } = await admin
      .from("people").select("id, nome, email, ativo").in("id", Array.from(recipientIds));
    const active = (recipients || []).filter((r: any) => r.ativo && r.email);

    const categoryLabel = CATEGORY_LABEL[kudo.category] || "🎉 Kudo";
    const slackText =
      `${categoryLabel}\n*${from?.nome || "Alguém"}* deu kudos para *${to.nome}*\n> ${kudo.message}`;

    const results: any[] = [];
    for (const r of active) {
      // Idempotency per (kudo_id, recipient)
      const auditKey = `${kudo_id}:${r.id}`;
      const { data: dup } = await admin
        .from("audit_logs").select("id")
        .eq("entidade", "kudos")
        .eq("entidade_id", auditKey)
        .eq("acao", "KUDOS_NOTIFY")
        .maybeSingle();
      if (dup) { results.push({ id: r.id, skipped: true }); continue; }

      const emailSubject = `🎉 ${from?.nome || "Alguém"} deu um kudo para ${to.nome}`;
      const emailHtml = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color:#16a34a;">${categoryLabel}</h2>
          <p>Olá <strong>${r.nome}</strong>,</p>
          <p><strong>${from?.nome || "Alguém"}</strong> reconheceu <strong>${to.nome}</strong> com um kudo.</p>
          <blockquote style="border-left:3px solid #16a34a;padding:8px 12px;background:#f0fdf4;margin:12px 0;">${kudo.message}</blockquote>
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
        actor_id: kudo.from_person_id,
        payload: { kudo_id, recipient_id: r.id, to_person_id: to.id },
      });
      results.push({ id: r.id, sent: true });
    }

    return new Response(JSON.stringify({ ok: true, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("kudos-notify-managers error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
