import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForCaller, getCallerPerson } from "../supabase";

export default defineTool({
  name: "list_my_requests",
  title: "Minhas solicitações de férias",
  description: "Lista as solicitações de férias do usuário autenticado com status e datas.",
  inputSchema: {
    status: z.string().trim().optional().describe("Filtrar por status (ex.: EM_ANALISE_GESTOR, APROVADO, REPROVADO)."),
    limit: z.number().int().min(1).max(100).default(25),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ status, limit }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Não autenticado." }], isError: true };
    }
    const { person } = await getCallerPerson(ctx);
    if (!person) {
      return { content: [{ type: "text", text: "Sem perfil vinculado." }], isError: true };
    }
    const sb = supabaseForCaller(ctx);
    let q = sb
      .from("requests")
      .select("*")
      .eq("solicitante_id", person.id)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (status) q = q.eq("status", status);
    const { data, error } = await q;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      structuredContent: { count: data?.length ?? 0, requests: data ?? [] },
    };
  },
});
