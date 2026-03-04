

## Plano: Adicionar Dia de Pagamento para Colaboradores PJ

### Objetivo
Adicionar um campo `dia_pagamento` à tabela `people` para controlar em qual data (10, 20 ou 30) cada colaborador PJ recebe o pagamento, baseado na data de emissão da nota fiscal.

---

### Alterações

#### 1. Migração de Banco de Dados
Adicionar coluna `dia_pagamento` à tabela `people`:

```sql
ALTER TABLE public.people 
ADD COLUMN dia_pagamento integer DEFAULT NULL;

COMMENT ON COLUMN public.people.dia_pagamento IS 'Dia do mês para pagamento PJ (10, 20 ou 30)';
```

#### 2. Atualizar Tipos (`src/lib/types.ts`)
- Adicionar `dia_pagamento?: number` à interface `Person`
- Adicionar `dia_pagamento?: number` à interface `PendingPerson`

#### 3. Atualizar Formulário de Edição no Admin (`src/pages/Admin.tsx`)
- Adicionar campo `dia_pagamento` ao `formData`
- Exibir select com opções 10, 20 ou 30 **condicionalmente** quando `modelo_contrato === 'PJ'`
- Incluir `dia_pagamento` no `handleSubmit` e `handleEdit`
- Exibir dia de pagamento na tabela de pessoas (coluna condicional ou badge)

#### 4. Atualizar Formulário de Novo Colaborador (`src/components/NewCollaboratorForm.tsx`)
- Adicionar campo `dia_pagamento` ao formulário
- Exibir select condicionalmente quando modelo de contrato for PJ

#### 5. Atualizar Formulário de Aprovação de Pendente (`src/components/ApprovePendingCollaboratorDialog.tsx`)
- Adicionar campo `dia_pagamento` ao formulário de aprovação/edição

#### 6. Atualizar `pending_people` (migração)
```sql
ALTER TABLE public.pending_people 
ADD COLUMN dia_pagamento integer DEFAULT NULL;
```

#### 7. Atualizar função `approve_pending_person`
Adicionar parâmetro `p_dia_pagamento` para que o valor seja copiado ao aprovar um cadastro pendente.

---

### UI do Campo

O select aparece apenas quando o modelo de contrato é PJ:

```text
Modelo de Contrato: [PJ ▼]
Dia de Pagamento:   [10 ▼]  ← Opções: 10, 20, 30
```

Na tabela do Admin, exibir como badge junto ao modelo de contrato:
```text
PJ (dia 10)
```

---

### Arquivos a Modificar

| Arquivo | Alteração |
|---------|-----------|
| Migração SQL | Adicionar coluna `dia_pagamento` em `people` e `pending_people` |
| `src/lib/types.ts` | Adicionar campo nas interfaces |
| `src/pages/Admin.tsx` | Campo no formulário + exibição na tabela |
| `src/components/NewCollaboratorForm.tsx` | Campo condicional no formulário |
| `src/components/ApprovePendingCollaboratorDialog.tsx` | Campo no formulário de aprovação |
| Função `approve_pending_person` | Novo parâmetro |

