<final-text>## Plano

### Diagnóstico
- O ajuste anterior foi parcial: a aprovação ainda fica frágil porque os campos opcionais continuam entrando no payload da RPC mesmo quando não foram preenchidos.
- Hoje o colaborador já consegue completar parte desses dados depois, mas o gestor direto ainda não tem um caminho confiável para preencher tudo por causa do `UPDATE` direto em `people`, que esbarra em RLS.
- Além disso, existe duplicidade de assinatura da RPC `approve_pending_person` no banco, o que vale limpar para deixar a aprovação sem datas realmente estável.

### O que vou implementar
1. **Permitir aprovação sem datas no modal**
   - Em `src/components/ApprovePendingCollaboratorDialog.tsx`, montar o payload da RPC dinamicamente.
   - Enviar `p_data_contrato`, `p_data_nascimento` e `p_dia_pagamento` somente se houver valor real.
   - Deixar claro na UI que essas informações são opcionais na aprovação e podem ser preenchidas depois.

2. **Consolidar a RPC de aprovação**
   - Criar migration para manter uma única versão canônica de `approve_pending_person`.
   - Garantir que aprovar sem datas crie o colaborador normalmente, preservando `null` nesses campos.

3. **Permitir preenchimento posterior pelo gestor direto**
   - Criar uma nova RPC `SECURITY DEFINER` para o gestor direto, diretor ou admin atualizar os dados de onboarding do colaborador aprovado:
     - `data_contrato`
     - `modelo_contrato`
     - `dia_pagamento`
     - `data_nascimento`
   - Validar no banco que gestor só possa editar subordinados diretos.
   - Registrar `audit_logs` e manter notificação no Slack admin.

4. **Reaproveitar a UI já existente**
   - Em `src/pages/VacationManagement.tsx`, trocar o `update` direto em `people` por essa nova RPC.
   - Ampliar o diálogo atual para incluir também data de nascimento e dia de pagamento PJ.
   - Ajustar os rótulos em `VacationTableRow.tsx` e `VacationDetailsDrawer.tsx` para refletir melhor que ali se editam dados de onboarding/contrato.

5. **Manter o fluxo do próprio colaborador**
   - Preservar o `/setup-contract` para contrato/modelo/dia de pagamento no primeiro acesso.
   - Manter o `ProfileModal` como caminho de autoatualização da data de nascimento.

### Arquivos previstos
- `src/components/ApprovePendingCollaboratorDialog.tsx`
- `src/pages/VacationManagement.tsx`
- `src/components/VacationTableRow.tsx`
- `src/components/VacationDetailsDrawer.tsx`
- `supabase/migrations/...`
- possivelmente `supabase/functions/slack-notification/index.ts` para detalhar o log da edição feita pelo gestor

### Detalhes técnicos
- Continuar usando o padrão de datas do projeto (`YYYY-MM-DD` nos inputs e helpers locais para exibição).
- Não editar `src/integrations/supabase/types.ts` manualmente.
- Resultado esperado: o diretor aprova mesmo sem datas, e depois o colaborador ou o gestor direto conseguem completar essas informações sem depender do diretor/admin.</final-text>