

## Plan: Notificação Slack para aprovação/rejeição de colaboradores pendentes

### O que muda
Enviar notificação no canal Slack de aprovações quando um diretor aprova ou rejeita um cadastro de colaborador pendente.

### Implementação

#### 1. `supabase/functions/slack-notification/index.ts`
- Expandir o type da interface para incluir `'PERSON_APPROVED' | 'PERSON_REJECTED'`
- Adicionar campos opcionais: `personName`, `personEmail`, `directorName`, `rejectionReason`
- Adicionar blocos de mensagem para os novos tipos:
  - `PERSON_APPROVED`: "✅ *Colaborador Aprovado* — **{directorName}** aprovou o cadastro de **{personName}** ({email})"
  - `PERSON_REJECTED`: "❌ *Colaborador Rejeitado* — **{directorName}** rejeitou o cadastro de **{personName}** ({email}). Motivo: {reason}"

#### 2. `src/components/ApprovePendingCollaboratorDialog.tsx`
- Após aprovação bem-sucedida (`result?.success`), chamar `supabase.functions.invoke('slack-notification', ...)` com type `PERSON_APPROVED`, nome do colaborador, email e nome do diretor
- Fire-and-forget (não bloquear o fluxo se falhar)

#### 3. `src/components/PendingCollaboratorsList.tsx`
- Após rejeição bem-sucedida (`result?.success`), chamar `supabase.functions.invoke('slack-notification', ...)` com type `PERSON_REJECTED`, nome, email, nome do diretor e motivo da rejeição
- Fire-and-forget

### Arquivos
| Arquivo | Ação |
|---------|------|
| `supabase/functions/slack-notification/index.ts` | Modificar — adicionar tipos PERSON_APPROVED/REJECTED |
| `src/components/ApprovePendingCollaboratorDialog.tsx` | Modificar — enviar notificação após aprovação |
| `src/components/PendingCollaboratorsList.tsx` | Modificar — enviar notificação após rejeição |

