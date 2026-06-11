## Objetivo
Remover o campo **"Tipo"** (Manual/Automático) do card **"Saldo de Férias"** no dashboard da home.

## Alteração
- **Arquivo:** `src/components/VacationBalance.tsx`
- **Ação:** Remover o bloco JSX que exibe a linha "Tipo:" com o Badge "Manual"/"Automático" (linhas 118–126 do arquivo atual).

O restante do card (Disponível, Acumulado, Usado, Status e Próximo acúmulo) permanece inalterado.