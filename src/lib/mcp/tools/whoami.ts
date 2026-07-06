import { defineTool } from "@lovable.dev/mcp-js";
import { getCallerPerson } from "../supabase";

export default defineTool({
  name: "whoami",
  title: "Quem sou eu",
  description: "Retorna o perfil da pessoa vinculada ao usuário autenticado (nome, cargo, papel, time).",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (_input, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Não autenticado." }], isError: true };
    }
    const { person } = await getCallerPerson(ctx);
    if (!person) {
      return {
        content: [{ type: "text", text: "Usuário autenticado mas sem perfil de pessoa vinculado." }],
        structuredContent: { user_id: ctx.getUserId(), email: ctx.getUserEmail() },
      };
    }
    return {
      content: [{ type: "text", text: JSON.stringify(person, null, 2) }],
      structuredContent: { person },
    };
  },
});
