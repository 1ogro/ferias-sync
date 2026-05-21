## Plano: deixar claro o que o badge de "Gestão do Time" está sinalizando

### Diagnóstico
- O badge ao lado de "Gestão do Time" no Header (`src/components/Header.tsx`, linhas 25–73) é alimentado por `activeAbsencesCount`, que conta solicitações `APROVADO_FINAL`/`REALIZADO` (Férias, Licença Maternidade, Licença Médica, Dayoff) ativas hoje. Para diretor/admin conta todo mundo; para gestor, só seu time direto.
- O `Dashboard` já mostra esse mesmo número como "1 pessoa ausente hoje" (via `ActiveAbsencesDashboard`).
- Ao entrar em `/vacation-management`, a tela mostra apenas as estatísticas gerais (Total, Sem Data Contrato, Férias Acumuladas, Saldos Manuais). Não existe nenhum bloco/aviso que mostre **quem** está ausente hoje, nem nenhum filtro pré-aplicado. Por isso o diretor vê o badge mas não consegue identificar a origem dentro da página.

### O que vou implementar
1. **Banner "Ausentes hoje" no topo de Gestão do Time**
   - Em `src/pages/VacationManagement.tsx`, adicionar logo abaixo do título uma faixa/cartão destacado quando houver ausências ativas hoje, listando:
     - Nome do colaborador
     - Tipo da ausência (Férias, Licença Médica, etc.)
     - Período (início → fim) e "Retorna em X dias"
   - Diretor/admin vê todos; gestor vê apenas seu time direto, espelhando a lógica do badge.
   - Cada item é clicável e abre o `VacationDetailsDrawer` correspondente.

2. **Reaproveitar dados existentes**
   - Buscar as solicitações ativas com a mesma query do Header (`requests` em `APROVADO_FINAL`/`REALIZADO`, `inicio<=hoje<=fim`, tipos relevantes), trazendo nome e tipo via join com `people`.
   - Sem alterações de schema ou RPC.

3. **Coerência com o Dashboard**
   - Manter o mesmo texto/iconografia do `ActiveAbsencesDashboard` para o usuário reconhecer a relação badge → banner.
   - Se a contagem for zero, esconder o banner (não poluir a tela).

### Arquivos previstos
- `src/pages/VacationManagement.tsx` — novo bloco "Ausentes hoje" no topo.
- (Opcional) extrair um pequeno componente `ActiveAbsencesBanner` em `src/components/` se ficar mais limpo do que inline.

### Fora de escopo
- Mudar a lógica do badge no Header.
- Alterar regras de quem aparece como ausente (segue exatamente a regra atual).
