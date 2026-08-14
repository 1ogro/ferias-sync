# Gerente como última instância de aprovação do seu time

O gerente que pertence a um time (`sub_time`) passa a ser o aprovador final de todos os colaboradores e gestores daquele time. O diretor sai do fluxo de escalação desses times: continua vendo tudo e podendo aprovar (override), e recebe apenas uma cópia informativa das notificações.

## Regras

- **Escalação com gerente no time**: Colaborador → Gestor direto (1º nível) → Gerente do time (decisão final).
- **Gestor do time**: sua própria solicitação vai direto para o gerente do time (decisão final).
- **Gerente**: a solicitação do próprio gerente escala para o diretor.
- **Time sem gerente**: fluxo atual permanece (Gestor → Diretor).
- **Diretor/admin**: pode aprovar qualquer solicitação em qualquer etapa (override), continua com visão total na Caixa de Entrada.
- **Status**: sem mudança no banco. O estado final continua sendo `EM_ANALISE_DIRETOR`; a interface exibe "Em Análise - Gerente" quando o time do solicitante tem gerente.

## Notificações

- Ao escalar, o **gerente do time** recebe DM no Slack e e-mail como responsável pela decisão.
- Os **diretores** recebem cópia informativa (mesmo canal), marcada como acompanhamento, sem CTA de responsável.
- Quando o time não tem gerente, tudo permanece como hoje (só diretores).

```text
Colaborador  --> Gestor direto --> Gerente do time  => APROVADO_FINAL
(time com gerente)                 (diretor: cópia + override)

Colaborador  --> Gestor direto --> Diretor          => APROVADO_FINAL
(time sem gerente)
```

## Detalhes técnicos

**Nova helper compartilhada** (`src/lib/approvalRouting.ts` + espelho em `supabase/functions/_shared/`):
- `resolveFinalApprover(personId)`: busca `sub_time` do solicitante e retorna o gerente ativo (`papel = 'GERENTE'`) daquele time, exceto quando o solicitante é o próprio gerente (nesse caso retorna `null` → diretoria).

**Frontend**
- `src/pages/Inbox.tsx`: `canApprove` passa a incluir o gerente do time do solicitante; ao aprovar em nível de gestor, escala para `EM_ANALISE_DIRETOR` e notifica o gerente do time como responsável, com cópia aos diretores; o `level` registrado em `approvals` vira `GERENTE_2` quando quem decide é o gerente do time.
- `src/pages/RequestDetail.tsx`: mesma regra de permissão e de escalação; textos do card de decisão ajustados.
- `src/components/StatusBadge.tsx` e `src/lib/types.ts`: rótulo dinâmico "Em Análise - Gerente" quando o time do solicitante tem gerente (helper de label recebe o time/gerente resolvido).
- `src/components/RequestTimeline.tsx`: exibir corretamente o nível `GERENTE_2`.
- `src/components/NewRequestForm.tsx` / `src/pages/EditRequest.tsx`: se o gestor direto do solicitante já for o gerente do time, a solicitação entra direto em análise final.

**Banco (migração)**
- Política RLS em `requests` e `approvals` permitindo `UPDATE`/`INSERT` pelo gerente do `sub_time` do solicitante (função `security definer` `public.is_final_approver_for(_request_id)` para evitar recursão).
- Ampliar o `CHECK` de `approvals.level` para aceitar `GERENTE_2`.

**Edge functions**
- `slack-interactions`: botões de aprovar/reprovar liberados para o gerente do time; ao aprovar em 1º nível, o destino da escalação é o gerente do time (fallback diretores).
- `slack-notification` e `send-notification-email`: nos eventos de escalação, resolver o gerente do time como destinatário principal e enviar cópia informativa aos diretores.
- `send-scheduled-reminders` e `send-weekly-open-requests-digest`: cobrar o gerente do time nas pendências daquele time.
