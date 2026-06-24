
# Lembretes Semanais de Solicitações em Aberto

## Objetivo

Enviar, toda segunda-feira de manhã, um **Slack DM** para cada gestor (e um resumo global para diretores) listando as solicitações pendentes da sua equipe, com sinalização RAG baseada na proximidade da **data de início** do período solicitado.

## Regras de negócio

**Solicitações consideradas "em aberto":**
`status IN ('PENDENTE', 'AGUARDANDO_GESTOR', 'AGUARDANDO_DIRETOR', 'INFORMACOES_ADICIONAIS')`

**Sinalização RAG** (dias até `inicio` a partir de hoje):
- 🔴 **Red** — faltam **≤ 7 dias** (ou já passou)
- 🟡 **Amber** — faltam **8–15 dias**
- 🟢 **Green** — faltam **> 15 dias**

**Destinatários:**
- **Gestor direto** de cada solicitante: recebe apenas a lista da sua equipe.
- **Todos os diretores ativos** (`papel = 'DIRETOR'` e `ativo = true`): recebem um digest consolidado com **solicitante + gestor responsável** de cada item.

**Canal:** somente Slack DM (via `users.lookupByEmail` → `chat.postMessage`), respeitando `notification_preferences.system_alerts_slack`.

## Implementação

### 1. Edge Function `send-weekly-open-requests-digest`
Nova função em `supabase/functions/send-weekly-open-requests-digest/index.ts`.

Fluxo:
1. Buscar todas as `requests` em aberto com `requester` (nome, gestor_id) join `people`.
2. Calcular `daysUntilStart = inicio - today` e classificar RAG.
3. **Por gestor**: agrupar requests por `requester.gestor_id`, buscar email do gestor, montar mensagem ordenada por urgência (Red → Amber → Green) e enviar DM.
4. **Por diretor**: para cada diretor ativo, enviar DM com todas as requests, incluindo nome do solicitante, nome do gestor responsável, data de abertura e sinalização RAG.
5. Reutilizar helpers de `_shared/notify-helpers.ts` (`lookupSlackUserByEmail`, `sendSlackDM`, `getPrefs`).
6. Audit log com `acao = 'WEEKLY_OPEN_REQUESTS_DIGEST'`.

Formato da mensagem (gestor):
```
:bell: *Solicitações em aberto da sua equipe* (3)

🔴 Maria Silva — Férias 01/jul a 15/jul (aberta em 20/jun)
🟡 João Souza — Day-off 08/jul (aberta em 22/jun)
🟢 Ana Costa — Férias 20/jul a 03/ago (aberta em 23/jun)

Acesse: <link>/inbox
```

Formato diretor (acrescenta gestor):
```
🔴 Maria Silva → gestor: Pedro Lima — Férias 01/jul a 15/jul (aberta em 20/jun)
```

### 2. Agendamento (pg_cron + pg_net)
Via `supabase--insert` (não migration), agendar execução **segunda-feira 09:00 (horário do servidor)**:

```sql
select cron.schedule(
  'weekly-open-requests-digest',
  '0 9 * * 1',
  $$ select net.http_post(
       url:='https://uhphxyhffpbnmsrlggbe.supabase.co/functions/v1/send-weekly-open-requests-digest',
       headers:='{"Content-Type":"application/json","apikey":"<ANON_KEY>"}'::jsonb,
       body:='{}'::jsonb
     ); $$
);
```

Requer extensions `pg_cron` e `pg_net` habilitadas (verificar; habilitar via migration se necessário).

### 3. Botão de teste manual (opcional)
Em `src/pages/Admin.tsx`, adicionar botão "Enviar digest semanal agora" que invoca a edge function via `supabase.functions.invoke`, visível apenas para admins/diretores. Permite validar sem esperar segunda-feira.

## Fora de escopo
- Email (apenas Slack, conforme solicitado).
- Configuração de dia/hora do envio pelo usuário (fixo segunda 09:00).
- Reminders diários — só semanal.

## Arquivos

**Criar:**
- `supabase/functions/send-weekly-open-requests-digest/index.ts`

**Editar (opcional):**
- `src/pages/Admin.tsx` — botão de disparo manual

**SQL via insert tool:**
- `cron.schedule(...)` para agendamento semanal
