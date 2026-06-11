## Problema

Em `src/components/VacationBalance.tsx`, o campo "Próximo acúmulo" exibe `balance.contract_anniversary` diretamente (linha 135). Esse valor é o aniversário de contrato do **ano alvo do saldo** (geralmente o ano corrente), então sempre que essa data já passou no ano corrente, o card mostra uma data no passado em vez do "próximo" acúmulo.

Há até um cálculo de `nextAnniversary` nas linhas 88-89 que nunca é usado, e ainda assim ele está incompleto: força `currentYear + 1` sem checar se o aniversário deste ano ainda está por vir.

## Correção

Calcular a data correta do próximo acúmulo a partir do aniversário de contrato:

1. Partir de `balance.contract_anniversary` (mês/dia confiáveis).
2. Montar a data no ano corrente; se já passou (`< hoje`), somar 1 ano.
3. Exibir esse valor em vez de `balance.contract_anniversary`.

Sem mudanças de banco, RLS, tipos ou outros componentes — alteração isolada em `VacationBalance.tsx`.

## Validação

No `/` (Home), o card "Saldo de Férias" deve exibir uma data de "Próximo acúmulo" sempre futura, igual ao dia/mês do aniversário de contrato do colaborador.
