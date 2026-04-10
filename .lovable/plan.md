

## Plano: Corrigir solicitação de alteração de dia de pagamento para PJ

### Problema
Quando um colaborador PJ (não-admin, não-gestor) tenta solicitar alteração do dia de pagamento, a query para buscar diretores falha silenciosamente porque as políticas RLS da tabela `people` só permitem que o colaborador veja seus próprios dados. Ele não consegue listar os diretores para enviar a notificação por email.

### Solução
Criar uma função RPC `security definer` que encapsula toda a lógica de envio da solicitação, evitando que o colaborador precise consultar diretamente a tabela `people` para encontrar diretores.

### Alterações

#### 1. Nova função RPC no banco de dados
Criar `request_payment_day_change(p_desired_day integer)` que:
- Obtém o `person_id` do usuário atual via `profiles`
- Valida que o modelo de contrato é PJ
- Busca todos os diretores ativos
- Retorna os emails dos diretores para que o frontend possa invocar a edge function de notificação

Alternativa mais simples: criar uma função que apenas retorna os emails dos diretores ativos, com `security definer`, para que qualquer usuário autenticado possa obter essa lista específica.

#### 2. Atualizar `src/components/ProfileModal.tsx`
- Substituir a query direta `supabase.from('people').select('email').eq('papel', 'DIRETOR')` pela chamada RPC

### Arquivos a alterar
- **Migração SQL**: criar função `get_director_emails()`
- **`src/components/ProfileModal.tsx`**: usar a nova RPC em vez da query direta

