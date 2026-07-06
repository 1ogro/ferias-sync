import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForCaller } from "../supabase";

export default defineTool({
  name: "list_colleagues",
  title: "Listar colegas",
  description: "Lista pessoas ativas do time (nome, cargo, papel, time, localidade). Aceita filtro opcional por nome/email.",
  inputSchema: {
    search: z.string().trim().optional().describe("Filtro parcial por nome ou email."),
    limit: z.number().int().min(1).max(200).default(50).describe("Máximo de resultados (padrão 50)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ search, limit }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Não autenticado." }], isError: true };
    }
    const sb = supabaseForCaller(ctx);
    let q = sb
      .from("people")
      .select("id, nome, email, cargo, papel, sub_time, local")
      .eq("ativo", true)
      .order("nome", { ascending: true })
      .limit(limit);
    if (search) q = q.or(`nome.ilike.%${search}%,email.ilike.%${search}%`);
    const { data, error } = await q;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      structuredContent: { count: data?.length ?? 0, people: data ?? [] },
    };
  },
});
