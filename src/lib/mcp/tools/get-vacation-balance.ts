import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForCaller, getCallerPerson } from "../supabase";

export default defineTool({
  name: "get_vacation_balance",
  title: "Consultar saldo de férias",
  description:
    "Retorna o saldo de férias da pessoa vinculada ao usuário (ou de outra pessoa se `person_id` for informado — sujeito às políticas de acesso).",
  inputSchema: {
    person_id: z.string().trim().optional().describe("ID da pessoa (opcional). Padrão: o próprio usuário."),
    year: z.number().int().min(2000).max(2100).optional().describe("Ano de referência (opcional)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ person_id, year }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Não autenticado." }], isError: true };
    }
    let targetId = person_id;
    if (!targetId) {
      const { person } = await getCallerPerson(ctx);
      if (!person) {
        return { content: [{ type: "text", text: "Sem perfil vinculado." }], isError: true };
      }
      targetId = person.id;
    }
    const sb = supabaseForCaller(ctx);
    let q = sb.from("vacation_balances").select("*").eq("person_id", targetId);
    if (year) q = q.eq("year", year);
    q = q.order("year", { ascending: false });
    const { data, error } = await q;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      structuredContent: { person_id: targetId, balances: data ?? [] },
    };
  },
});
