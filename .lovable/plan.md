

## Plano: Dia de Pagamento no Cadastro e Perfil do Colaborador

### Objetivo
1. Novos colaboradores PJ preenchem o dia de pagamento desejado durante o onboarding (ContractDateSetup)
2. Colaboradores existentes visualizam seu dia de pagamento no perfil (ProfileModal) e podem solicitar alteração ao diretor

---

### Alterações

#### 1. Atualizar RPC `set_contract_data_for_current_user` (migração)
Adicionar parâmetro `p_dia_pagamento` para salvar o dia de pagamento durante o onboarding:

```sql
CREATE OR REPLACE FUNCTION public.set_contract_data_for_current_user(p_date date, p_model text, p_dia_pagamento integer DEFAULT NULL)
-- adiciona SET dia_pagamento = p_dia_pagamento ao UPDATE
```

#### 2. `src/components/ContractDateSetup.tsx`
- Adicionar estado `diaPagamento`
- Exibir select com opções 10, 20, 30 **condicionalmente** quando `modeloContrato === 'PJ'`
- Passar `p_dia_pagamento` na chamada RPC

#### 3. `src/components/ProfileModal.tsx`
- Exibir `dia_pagamento` como campo somente leitura para colaboradores PJ (badge com "Dia 10", "Dia 20" ou "Dia 30")
- Adicionar botão "Solicitar alteração" que envia email ao diretor via edge function `send-notification-email` com tipo `PAYMENT_DAY_CHANGE_REQUEST`, incluindo o dia atual e o dia desejado (select com as 3 opções)

#### 4. Atualizar edge function `send-notification-email`
Adicionar tratamento para o novo tipo `PAYMENT_DAY_CHANGE_REQUEST`:
- Busca email dos diretores
- Envia email informando: colaborador X solicita alteração do dia de pagamento de Y para Z

### Arquivos

| Arquivo | Alteração |
|---------|-----------|
| Migração SQL | Atualizar `set_contract_data_for_current_user` com `p_dia_pagamento` |
| `src/components/ContractDateSetup.tsx` | Campo condicional dia de pagamento para PJ |
| `src/components/ProfileModal.tsx` | Exibir dia de pagamento (read-only) + botão solicitar alteração |
| `supabase/functions/send-notification-email/index.ts` | Novo tipo de notificação para solicitação de alteração |

