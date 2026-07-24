import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForCaller } from "../supabase";

export default defineTool({
  name: "list_upcoming_absences",
  title: "Ausências futuras",
  description:
    "Lista solicitações de férias APROVADAS que se sobrepõem à janela informada (padrão: próximos 60 dias).",
  inputSchema: {
    start_date: z.string().trim().optional().describe("Data inicial no formato YYYY-MM-DD (padrão: hoje)."),
    end_date: z.string().trim().optional().describe("Data final no formato YYYY-MM-DD (padrão: hoje + 60 dias)."),
    limit: z.number().int().min(1).max(200).default(100),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ start_date, end_date, limit }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Não autenticado." }], isError: true };
    }
    // "hoje" em SP (evita off-by-one entre 21h e 24h BRT quando o servidor está em UTC)
    const spFmt = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Sao_Paulo",
      year: "numeric", month: "2-digit", day: "2-digit",
    });
    const todayIsoSP = spFmt.format(new Date());
    const addDays = (iso: string, n: number) => {
      const [y, m, d] = iso.split("-").map(Number);
      const dt = new Date(Date.UTC(y, m - 1, d));
      dt.setUTCDate(dt.getUTCDate() + n);
      return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
    };
    const start = start_date || todayIsoSP;
    const end = end_date || addDays(todayIsoSP, 60);

    const sb = supabaseForCaller(ctx);
    const { data, error } = await sb
      .from("requests")
      .select("id, solicitante_id, data_inicio, data_fim, dias_solicitados, status, tipo")
      .eq("status", "APROVADO")
      .lte("data_inicio", end)
      .gte("data_fim", start)
      .order("data_inicio", { ascending: true })
      .limit(limit);
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      structuredContent: { window: { start, end }, count: data?.length ?? 0, absences: data ?? [] },
    };
  },
});
