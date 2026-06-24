// Pulse export — gera CSV/XLSX das respostas de uma survey
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import * as XLSX from "https://esm.sh/xlsx@0.18.5";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function toCSV(rows: string[][]): string {
  const escape = (v: string) => {
    if (v == null) return "";
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return rows.map((r) => r.map(escape).join(",")).join("\n");
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: claims, error: authErr } = await userClient.auth.getClaims(token);
    if (authErr || !claims?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const url = new URL(req.url);
    const surveyId = url.searchParams.get("survey_id");
    const format = (url.searchParams.get("format") || "csv").toLowerCase();
    if (!surveyId) {
      return new Response(JSON.stringify({ error: "survey_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Use the user client so RLS applies (only owner / admin reads)
    const admin = createClient(supabaseUrl, supabaseServiceKey);

    const { data: survey, error: sErr } = await userClient
      .from("pulse_surveys").select("*").eq("id", surveyId).maybeSingle();
    if (sErr || !survey) {
      return new Response(JSON.stringify({ error: "Survey não encontrada ou sem acesso" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: questions } = await admin
      .from("pulse_questions").select("*").eq("survey_id", surveyId).order("position");

    const { data: responses } = await admin
      .from("pulse_responses")
      .select("id, run_id, question_id, respondent_id, scale_value, text_value, submitted_at, pulse_runs!inner(survey_id, dispatched_at)")
      .eq("pulse_runs.survey_id", surveyId);

    // Map respondent_id → name OR anonymous label
    let respLabel: (id: string) => string;
    if (survey.anonymous) {
      const map = new Map<string, string>();
      let n = 1;
      respLabel = (id: string) => {
        if (!map.has(id)) map.set(id, `R${n++}`);
        return map.get(id)!;
      };
    } else {
      const ids = [...new Set((responses || []).map((r: any) => r.respondent_id))];
      const { data: people } = await admin.from("people").select("id, nome").in("id", ids);
      const peopleMap = new Map((people || []).map((p: any) => [p.id, p.nome]));
      respLabel = (id: string) => peopleMap.get(id) || id;
    }
    const qMap = new Map((questions || []).map((q: any) => [q.id, q]));

    const header = ["Data", "Respondente", "Pergunta", "Tipo", "Valor (1-5)", "Texto"];
    const rows: string[][] = [header];
    for (const r of (responses || []) as any[]) {
      const q = qMap.get(r.question_id) as any;
      rows.push([
        new Date(r.submitted_at).toISOString(),
        respLabel(r.respondent_id),
        q?.question_text || "",
        q?.question_type || "",
        r.scale_value != null ? String(r.scale_value) : "",
        r.text_value || "",
      ]);
    }

    const fileBase = `pulse_${survey.title.replace(/[^a-z0-9]+/gi, "_").toLowerCase()}`;
    if (format === "xlsx") {
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet(rows);
      XLSX.utils.book_append_sheet(wb, ws, "Respostas");
      const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" });
      return new Response(buf, {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="${fileBase}.xlsx"`,
        },
      });
    } else {
      return new Response(toCSV(rows), {
        headers: {
          ...corsHeaders,
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="${fileBase}.csv"`,
        },
      });
    }
  } catch (err: any) {
    console.error("pulse-export error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
