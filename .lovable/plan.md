
## Objetivo

Permitir que um diretor importe linhas de uma nova Planilha Google e crie cadastros em `pending_people` (fila de aprovação), com botão manual, configuração de planilha na UI e relatório claro de duplicados.

## Escopo

1. **Configuração da planilha (UI)** — em `Settings`/`Admin` (tela de Integrações), adicionar um campo "ID da planilha de novos usuários" salvo em `integration_settings` (nova coluna `sheets_users_id`). Diretor cola o ID e salva.
2. **Edge Function `sheets-import-users`** — nova função, reutiliza `GOOGLE_SERVICE_ACCOUNT_EMAIL` e `GOOGLE_PRIVATE_KEY` já configurados, mas lê de `sheets_users_id` (vindo do body ou de `integration_settings`). Lê aba `Novos_Usuarios`.
3. **Botão de importação** — novo componente `UsersSheetsSync.tsx` (similar ao `SheetsSync.tsx`), com botão "Importar novos usuários da planilha" e painel de resultado.
4. **Tratamento de duplicados** — emails já existentes em `people` OU em `pending_people` (status PENDENTE/APROVADO) são pulados, contados como `ignored`, e listados na UI com badge âmbar "Já cadastrado" para revisão.
5. **Auditoria** — log em `audit_logs` (entidade `pending_people`, ação `SHEETS_IMPORT`).

## Estrutura da planilha

Aba `Novos_Usuarios`, linha 1 = cabeçalho, importa a partir de A2:
```text
Nome | Email | Cargo | Local | Sub-Time | Papel | Gestor (email) | Data Contrato | Modelo Contrato | Data Nascimento | Dia Pagamento
```
- Campos obrigatórios: Nome, Email, Gestor (email).
- `Gestor (email)` é resolvido para `gestor_id` via lookup em `people`.
- Datas em `YYYY-MM-DD` ou `DD/MM/YYYY` (normalizar).
- `Papel` default `COLABORADOR`, `Modelo Contrato` default `CLT`.

## Mudanças técnicas

### Banco (migration)
- `ALTER TABLE integration_settings ADD COLUMN sheets_users_id text;`
- Sem novas tabelas.

### Edge Function `supabase/functions/sheets-import-users/index.ts`
- `verify_jwt = false` no `config.toml`; valida JWT em código e checa papel DIRETOR/ADMIN do chamador.
- Lê `sheets_users_id` da `integration_settings`.
- Obtém access token Google (mesma lógica do `sheets-import`).
- GET `Novos_Usuarios!A2:K1000`.
- Para cada linha:
  - Valida obrigatórios → senão `errors++`.
  - Resolve `gestor_id` por email → senão `errors++` com mensagem clara.
  - Verifica duplicado (`people.email` ou `pending_people.email` com status PENDENTE/APROVADO) → se sim, `ignored++` com `{ email, nome, motivo: "Já cadastrado" }`.
  - Insere em `pending_people` com `created_by = <person_id do chamador>`, `status = 'PENDENTE'`.
- Retorna `{ imported, ignored, errors, ignoredList: [...], errorMessages: [...] }`.
- Insere `audit_logs` com sumário.

### Frontend
- `src/components/integrations/UsersSheetsSetup.tsx` — campo simples para ID da planilha de novos usuários, salvando em `integration_settings.sheets_users_id`. Plugado dentro do `IntegrationsWizard` (ou na seção Google Sheets existente).
- `src/components/UsersSheetsSync.tsx` — botão "Importar novos usuários", chama `supabase.functions.invoke('sheets-import-users')`, mostra resultado com 3 contadores (Importados / Ignorados / Erros) e duas listas colapsáveis:
  - **Ignorados** (badge âmbar, ícone `AlertTriangle`) com nome+email+motivo.
  - **Erros** (badge vermelho).
- Adicionar o componente no painel admin (provavelmente `src/pages/Admin.tsx`, próximo ao `SheetsSync` já existente).

### Permissões
- Apenas DIRETOR/ADMIN podem chamar a edge function (checagem em código) e ver/usar o botão na UI (usando o mesmo padrão de `is_current_user_admin`/papel já presente).
- RLS de `pending_people` já permite INSERT por diretores; usaremos o `service_role` na edge function para inserir, registrando `created_by` corretamente.

## Fora de escopo

- Sincronização automática/agendada (fica como evolução futura).
- Sincronização App→Sheets dos novos cadastros (somente Sheets→App por enquanto).
- Edição em massa pela planilha (não atualiza pessoas existentes — duplicados são apenas pulados).
- Notificação Slack/email da importação (podemos adicionar depois se desejado).

## Dependências/Pré-requisitos

- Service Account do Google já precisa ter acesso de **leitura** à nova planilha (compartilhar a planilha com o email da service account).
- Secrets `GOOGLE_SERVICE_ACCOUNT_EMAIL` e `GOOGLE_PRIVATE_KEY` já estão configurados.

## Critérios de aceite

- Diretor consegue colar o ID da nova planilha na tela de Integrações e salvar.
- Clicando no botão, linhas válidas viram registros em `pending_people` com status PENDENTE.
- Emails já existentes não são reimportados e aparecem em destaque âmbar com motivo.
- Linhas inválidas (sem nome/email/gestor) aparecem em destaque vermelho com mensagem clara.
- Log de auditoria registra a operação.
