## Card "Engajamento" na Visão Geral

Adicionar um novo card na aba **Visão Geral** do Dashboard (`src/components/Dashboard.tsx`), visível apenas para **gestores/diretores** (mesmo critério já usado para `pendingApprovals`).

### Conteúdo do card
1. **Nota média Check-in / Check-out** — duas métricas lado a lado (escala 1-5, 1 casa decimal)
   - Identifica surveys via `pulse_surveys` cujo `title ILIKE '%check-in%'` ou `'%check-out%'` (e `active = true`)
   - Faz join com `pulse_questions` (filtra `question_type = 'scale_1_5'`) e `pulse_responses` (`answer_scale not null`), agregando a média por bucket
   - Janela: últimos 30 dias (para refletir o pulso recente)
2. **Líder do mês** — primeiro item de `useLeaderboard("team", "month")` (nome + pontos)
3. **Último kudos** — primeiro item de `useKudosFeed(1)` (de → para, mensagem truncada, tempo relativo)
4. **CTA "Ver Pulses"** — `Button` que navega para `/engagement` (página existente que contém a aba Pulses)

### Implementação técnica

**Novo hook** `src/hooks/usePulseCheckinAverages.ts`:
- `useQuery` chamando um novo RPC `get_pulse_checkin_averages()` que retorna `{ checkin_avg: number|null, checkin_count: int, checkout_avg: number|null, checkout_count: int }` filtrando por janela de 30d
- Migration cria a função SQL `SECURITY DEFINER` com `search_path = public`, restrita a usuários autenticados que sejam admin/gestor/diretor (via `has_role` ou checagem em `people.papel`) — retorna NULL para os demais

**Novo componente** `src/components/EngagementSummaryCard.tsx`:
- Usa os três hooks (`usePulseCheckinAverages`, `useLeaderboard`, `useKudosFeed(1)`)
- Layout: header com ícone (`Sparkles` ou `TrendingUp`) + título "Engajamento"
- Grid interno com as quatro seções; estados de loading com `Skeleton`
- Footer: `Button` "Ver Pulses" → `navigate('/engagement')`

**Dashboard.tsx**:
- Importa e renderiza `<EngagementSummaryCard />` dentro do bloco `selectedTab === "overview"` (grid existente `lg:grid-cols-2`), condicionado a `person.papel === 'GESTOR' | 'DIRETOR' || person.is_admin`

### Arquivos
- ✏️ `src/components/Dashboard.tsx` — insere card no grid
- ➕ `src/components/EngagementSummaryCard.tsx` — novo componente
- ➕ `src/hooks/usePulseCheckinAverages.ts` — novo hook
- 🗄️ Migration — função `get_pulse_checkin_averages()` + grant execute para `authenticated`

Nenhuma alteração em pulses, kudos, leaderboard ou rotas existentes.