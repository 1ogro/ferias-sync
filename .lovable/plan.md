
## Objetivo

Painel administrativo para visualizar todas as notificações do sistema (Slack, Email, DMs internos, Kudos, Pulses, lembretes) com:
- **Gatilho / dependência** (evento no app, cron schedule, ação de usuário).
- **Público-alvo** (quem recebe: colaborador, gestor, diretor, admin, canal público).
- **Canal** (Slack DM, Slack canal, Email, ou combinação).
- Status (ativo / inativo) e link para o log da edge function correspondente.

## Escopo

Não é feed de notificações por usuário — é um **catálogo estático** do que o sistema envia, para consulta por admins/diretores (útil pra auditoria, treinamento, debugging).

## Plano

### 1. Catálogo curado em código

Criar `src/lib/notificationsCatalog.ts` com a lista completa de todas as notificações do sistema, cada uma com:

```ts
{
  id: string;                   // "vacation-approved-collaborator"
  nome: string;                 // "Solicitação de férias aprovada"
  descricao: string;            // frase curta
  categoria: "Férias" | "Engajamento" | "Cadastro" | "Aniversários" | "Pulses" | "Autenticação" | "Admin";
  gatilho: {
    tipo: "evento" | "cron" | "manual";
    detalhe: string;            // "Diretor aprova pedido" | "Diariamente 09:00 seg-sex"
    cronExpr?: string;          // se cron
  };
  publico: string[];            // ["Colaborador"], ["Gestor", "Diretor"], ...
  canais: ("slack_dm" | "slack_canal" | "email")[];
  edgeFunction: string;         // "send-scheduled-reminders"
  ativo: boolean;
}
```

Cobre os fluxos identificados na exploração:

- **Férias / Solicitações:**
  - Pedido criado → gestor (Slack + Email) — `slack-notification`, `send-notification-email`
  - Aprovação intermediária/final → colaborador (Slack DM + Email) — `notify-approved-collaborator`
  - Lembrete diário de pedidos pendentes >3 dias → gestor (Slack) — `send-scheduled-reminders` (cron seg-sex 09:00)
  - Alertas mensais de férias → colaborador (Slack + Email) — `send-scheduled-reminders MONTHLY_VACATION_ALERTS` (dia 1 08:00)
  - Lembrete semanal do diretor → diretor (Slack) — `send-scheduled-reminders WEEKLY_DIRECTOR` (seg 10:00)
  - Digest semanal de pedidos abertos → gestores (Email) — `send-weekly-open-requests-digest` (seg 09:00)
- **Cadastro:**
  - Colaborador pendente aprovado → colaborador (Email/Slack) — `notify-approved-collaborator`
  - Lembretes semanal/fim-de-mês para completar cadastro — `send-registration-reminders` (seg 12:00 / dias 28-31 13:00)
  - Admin invite / recuperação de senha — `send-password-reset-slack`, `admin-auth-management`
- **Aniversários / Contrato:**
  - Aniversários do mês → canal (Slack) — `send-birthday-digest` (dias 1,10,20,30 12:00)
  - Aniversário de contrato diário → canal + colaborador — `send-daily-anniversaries` (diário 12:00)
  - Checkpoints de anuênio (accrual) → colaborador + gestor — `send-contract-anniversary-notifications` (dias 1,10,20,30 12:00)
  - Accrual de férias por aniversário → sistema (job silencioso) — `apply-contract-anniversary-accrual` (diário 06:00)
- **Engajamento:**
  - Kudos enviado → destinatário (Slack DM) e opcionalmente canal — `kudos-send`, `slack-interactions kudos_submit`
  - Kudos para gestores do destinatário → gestores/diretores (Slack DM) — `kudos-notify-managers`
  - Relatório mensal de engajamento → diretores/canal (Slack) — `engagement-monthly-report` (dia 1 09:00)
  - `/biscoito` slash command → Slack modal — `slack-slash-biscoito`
- **Pulses:**
  - Envio de pulse → destinatários (Slack DM) — `pulse-dispatch` (cada 15min)
  - Lembretes de pulse não respondido → destinatários (Slack DM) — `pulse-reminders` (cada 15min)
  - Resposta de pulse recebida → PO / diretor (Slack) — `pulse-response-notify`

### 2. Página `/admin/notificacoes`

Nova rota, protegida por `ProtectedRoute` restrita a `is_admin` ou `papel = DIRETOR`. Layout:

- Barra de filtros no topo: **Categoria**, **Canal**, **Público**, campo de busca.
- Tabela responsiva (em mobile vira cards) com colunas: Nome, Categoria, Gatilho, Público, Canais (badges coloridos), Edge Function (link para logs).
- Cada linha expansível mostra: descrição completa, cron expression legível (com `cronstrue-pt-br` ou tradução manual — sem dependência nova, faço um helper simples pros ~15 crons), link direto para o log da função no Supabase, e link para o código-fonte no repo (opcional).
- Header do painel com contagem por canal (X notificações Slack, Y Email, Z ambos) e badge indicando quais estão inativas.

### 3. Entrada no menu / navegação

Adicionar item **"Notificações do sistema"** em Admin (`src/pages/Admin.tsx`) — apenas para admins/diretores, ao lado dos outros painéis administrativos existentes.

### 4. Sem alterações no backend

O catálogo é código de frontend. Não muda o banco, edge functions ou permissões existentes. Nenhuma migration.

## Detalhes técnicos

Arquivos novos:
- `src/lib/notificationsCatalog.ts` — catálogo tipado.
- `src/pages/AdminNotifications.tsx` — página com filtros e tabela.
- `src/components/admin/NotificationsCatalogTable.tsx` — tabela/cards + linhas expansíveis.
- `src/lib/cronHumanize.ts` — pequeno helper para traduzir os cron expressions do catálogo em português (sem lib externa).

Arquivos editados:
- `src/App.tsx` — nova rota `/admin/notificacoes` protegida.
- `src/pages/Admin.tsx` — link/card para o novo painel.

Sem novas dependências, sem mudança de schema, sem mexer em fluxos existentes. Se no futuro alguma notificação for adicionada/removida, basta atualizar o catálogo.
