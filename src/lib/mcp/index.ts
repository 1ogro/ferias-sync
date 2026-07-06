import { auth, defineMcp } from "@lovable.dev/mcp-js";
import whoamiTool from "./tools/whoami";
import listColleaguesTool from "./tools/list-colleagues";
import getVacationBalanceTool from "./tools/get-vacation-balance";
import listMyRequestsTool from "./tools/list-my-requests";
import listUpcomingAbsencesTool from "./tools/list-upcoming-absences";
import listRecentKudosTool from "./tools/list-recent-kudos";

// The OAuth issuer must be the direct Supabase host, built from the project ref.
// Vite inlines this literal at build time (import-safe — no runtime env read).
const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "ferias-sync-mcp",
  title: "Férias Sync — Gestão de pessoas",
  version: "0.1.0",
  instructions:
    "Ferramentas do Férias Sync para consultar dados do próprio usuário e do time: perfil, colegas, saldos e solicitações de férias, ausências futuras e kudos recentes. Todas as leituras respeitam as políticas de acesso (RLS) do usuário autenticado.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [
    whoamiTool,
    listColleaguesTool,
    getVacationBalanceTool,
    listMyRequestsTool,
    listUpcomingAbsencesTool,
    listRecentKudosTool,
  ],
});
