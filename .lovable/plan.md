
## Objetivo

1. Permitir, em cada survey, configurar notificação ao gestor direto quando a resposta cair em faixas "positiva" e/ou "negativa" definidas por survey.
2. Quando alguém recebe um kudo, notificar automaticamente o gestor direto + todos os diretores ativos.

Canais de envio: Slack DM + Email, respeitando `notification_preferences` de cada destinatário.

---

## Mudanças no banco (`pulse_surveys`)

Novos campos opcionais por survey:

- `notify_manager_on_negative boolean default false`
- `notify_manager_on_positive boolean default false`
- `notify_negative_threshold int` (notifica quando `scale_value <=` este valor; default `2`)
- `notify_positive_threshold int` (notifica quando `scale_value >=` este valor; default `4`)
- `notify_include_text_responses boolean default false` — se ativo, dispara também em respostas de texto (sem classificar; tratado como "feedback negativo a revisar" se a survey marcou negativa).

Sem mudança de tabela para kudos: a regra "gestor + diretores" é fixa no servidor.

## UI — `PulseFormDialog`

Nova seção colapsável **"Notificações ao gestor"** (visível para `kind` ∈ {`self`,`peer`}; oculta em `kudos`):

- Switch **Notificar em respostas negativas** + input numérico "limite" (1–5, padrão 2, texto: "Quando a resposta for ≤ X").
- Switch **Notificar em respostas positivas** + input numérico (1–5, padrão 4, texto: "Quando a resposta for ≥ X").
- Checkbox **Incluir respostas de texto** (apenas se "negativas" estiver ativo).
- Nota de privacidade: "Em surveys anônimas, o alerta é enviado sem revelar o respondente."

Estado e payload no `handleSubmit` propagam os novos campos.

## Lógica de disparo — pulses

Centralizar em um único caminho no backend para que respostas vindas tanto do Slack quanto da UI sigam a mesma regra.

- Criar Edge Function **`pulse-response-notify`** (invocada com idempotência por `response_id`).
- Chamadas:
  - `supabase/functions/slack-interactions/index.ts`: após gravar `pulse_responses` (blocos `pulse_answer:` e `view_submission` de texto), `invoke('pulse-response-notify', { response_id })` (fire-and-forget).
  - Hook UI equivalente (se houver submissão de respostas direta na app — verificar `usePulses`; se não existir, ignorar).
- Função:
  1. Carrega resposta + survey + pergunta + respondente + gestor do respondente.
  2. Decide se classifica como negativa/positiva conforme flags e limites da survey (apenas `scale_*`; texto entra só se `notify_include_text_responses` + flag negativa).
  3. Se sim, monta payload:
     - Título: "Resposta negativa em '<survey>'" / "Resposta positiva..."
     - Survey/pergunta + valor (1-5).
     - Identidade: nome do respondente se `anonymous = false`; em caso de anônima, texto "Respondente anônimo (#R<n>)" usando o `anonymous_label` existente.
  4. Para o gestor direto (`people.gestor_id`):
     - Slack DM via lookup por email (helper já usado em `slack-interactions`/`kudos-send`).
     - Email via `send-transactional-email` com template novo `pulse-response-alert`.
     - Cada canal é enviado somente se `notification_preferences` do gestor permitir (consulta tabela existente).
  5. Grava `audit_logs` (`acao = 'PULSE_NOTIFY_MANAGER'`).

## Lógica de disparo — kudos

- Editar `supabase/functions/kudos-send/index.ts` e o branch `kudos_submit:` em `slack-interactions/index.ts` para, após inserir em `public.kudos`, chamar `invoke('kudos-notify-managers', { kudo_id })`.
- Nova Edge Function **`kudos-notify-managers`**:
  1. Carrega o kudo + destinatário (`to_person_id`) + remetente.
  2. Resolve destinatários:
     - Gestor direto (`people.gestor_id` do destinatário, se ativo).
     - Todos com `papel = 'DIRETOR' AND ativo = true`.
     - Deduplica e remove o próprio destinatário e o remetente.
  3. Envia para cada um:
     - Slack DM (se preferência permitir): "🎉 <Remetente> deu um kudo para <Destinatário> (<categoria>): \"<mensagem>\"".
     - Email (template novo `kudo-notification`) se preferência permitir.
  4. Idempotência por `kudo_id + recipient_person_id`.
  5. Audit log `acao = 'KUDOS_NOTIFY'`.

## Templates de email (React Email)

Adicionar em `supabase/functions/_shared/transactional-email-templates/`:

- `pulse-response-alert.tsx` — props: survey title, question, value, sentiment ("positive"/"negative"), respondent label.
- `kudo-notification.tsx` — props: from name, to name, category, message.

Registrar ambos em `registry.ts` e fazer deploy de `send-transactional-email`.

## Detalhes técnicos

- Reaproveitar o padrão fire-and-forget já documentado em `mem://arch/padrao-notificacoes-assincronas`.
- Consultas devem usar service role dentro das edge functions; nenhuma alteração de RLS necessária além dos novos campos em `pulse_surveys` (já cobertos pelas policies atuais da tabela).
- `notification_preferences`: respeitar campos existentes (Slack/Email habilitados por categoria — adicionar/usar categoria existente "alertas gerenciais" se já houver; caso contrário, usar Slack/Email globais já presentes).

## Itens fora do escopo desta entrega

- Não muda regras de exibição na UI de resultados (já feito em entregas anteriores).
- Não cria configuração de notificação de kudos — é automático e fixo conforme combinado.
