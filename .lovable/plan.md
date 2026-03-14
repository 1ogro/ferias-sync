

## Plan: Notificar diretor por email e Slack quando novo colaborador pendente é criado

### Contexto
Quando um gestor submete um novo colaborador via `NewCollaboratorForm`, o registro é inserido em `pending_people` com status `PENDENTE`. Atualmente nenhuma notificação é enviada — o diretor só descobre ao abrir a página Admin.

### Implementação

#### 1. `src/components/NewCollaboratorForm.tsx`
- Após insert bem-sucedido (linha ~113), buscar todos os diretores ativos (`people` com `papel = 'DIRETOR'` ou `is_admin = true`) usando a edge function (fire-and-forget)
- Invocar `send-notification-email` com tipo `NEW_PENDING_PERSON` para cada diretor
- Invocar `slack-notification` com tipo `NEW_PENDING_PERSON` uma vez (canal geral de aprovações)

#### 2. `supabase/functions/send-notification-email/index.ts`
- Adicionar tipo `NEW_PENDING_PERSON` à interface
- Adicionar campos: `collaboratorName`, `collaboratorEmail`, `managerName`
- Template: Assunto "Novo cadastro pendente — {collaboratorName}", corpo informando que o gestor {managerName} submeteu o cadastro para aprovação

#### 3. `supabase/functions/slack-notification/index.ts`
- Adicionar tipo `NEW_PENDING_PERSON` ao handler
- Mensagem: "📋 *Novo Cadastro Pendente* — {managerName} submeteu o cadastro de {collaboratorName} ({email}) para aprovação"

#### Identificação dos diretores
- A busca de diretores será feita na edge function `send-notification-email` usando service role, passando um flag para notificar todos os diretores. Alternativamente, a busca pode ser feita no frontend já que o gestor tem acesso limitado à tabela `people` — então faremos a busca na edge function.
- Abordagem: o frontend envia uma única chamada para `send-notification-email` com tipo `NEW_PENDING_PERSON`. A edge function busca internamente todos os diretores ativos e envia email para cada um (respeitando preferências de notificação).

### Arquivos
| Arquivo | Ação |
|---------|------|
| `supabase/functions/send-notification-email/index.ts` | Adicionar tipo NEW_PENDING_PERSON com busca de diretores |
| `supabase/functions/slack-notification/index.ts` | Adicionar tipo NEW_PENDING_PERSON |
| `src/components/NewCollaboratorForm.tsx` | Disparar notificações após criação |

