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
    const today = new Date();
    const in60 = new Date(today.getTime() + 60 * 24 * 60 * 60 * 1000);
    const iso = (d: Date) => d.toISOString().slice(0, 10);
    const start = start_date || iso(today);
    const end = end_date || iso(in60);

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
