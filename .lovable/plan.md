

## Plan: Enviar convites de criação de conta via Slack (além de email)

### Resumo
Para usuários não-DIRETOR, o convite de criação de conta será enviado de 3 formas:
1. **Email** (via `inviteUserByEmail` — como já funciona)
2. **DM no Slack** para o colaborador convidado com o link de criação de conta
3. **Notificação no canal** de aprovações (já existe)

Adicionalmente, o dialog de confirmação de convite terá opção para escolher enviar **apenas via Slack** (sem email), mantendo email como padrão.

### Arquivos a modificar

#### 1. `supabase/functions/admin-auth-management/index.ts`
- Aceitar novo parâmetro `invite_method: 'email' | 'slack' | 'both'` (default: `'both'`)
- Quando `invite_method` inclui `'slack'`:
  - Usar `users.lookupByEmail` na API do Slack para encontrar o Slack user ID do colaborador
  - Enviar DM com link de criação de conta (usando `generateLink` ao invés de `inviteUserByEmail` quando o método é `slack`-only)
  - Se o método é `'both'`, enviar email normalmente E também DM no Slack
  - Se o método é `'email'`, manter comportamento atual
- Quando target é DIRETOR, forçar método `'email'` (ignorar Slack)
- Bloquear envio se `invite_method` inclui Slack mas o target não foi encontrado no Slack workspace

#### 2. `src/pages/Admin.tsx`
- No dialog de confirmação de convite, adicionar seletor de método: "Email", "Slack" ou "Ambos"
  - Default: "Ambos"
  - Desabilitar opção Slack quando o target é DIRETOR
- Passar `invite_method` no body da chamada à edge function
- Atualizar texto descritivo do dialog com base na opção selecionada

### Fluxo técnico

```text
Admin clica "Enviar Convite"
       │
       ▼
Dialog com opções: [Email] [Slack] [Ambos]
       │
       ▼
POST admin-auth-management
  { action: "send_invite", person_id, invite_method }
       │
       ├─ email/both → inviteUserByEmail (gera link + envia email)
       │
       ├─ slack/both → Slack users.lookupByEmail → chat.postMessage (DM)
       │    └─ Mensagem: "Você foi convidado para criar sua conta..."
       │       com link gerado via generateLink()
       │
       └─ Canal Slack → notificação existente (sempre)
```

### Detalhes da DM Slack
- Mensagem formatada com blocks do Slack contendo:
  - Saudação personalizada com nome
  - Botão/link para criação de conta
  - Informação de quem enviou o convite
- Se o email não é encontrado no Slack, retornar erro informativo e sugerir envio por email

