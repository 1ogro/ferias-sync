## Objetivo
Resolver as vulnerabilidades high severity em dependências atualizando 3 pacotes.

## Mudanças

1. **`@supabase/supabase-js`**: `2.57.4` → `^2.78.0` (corrige `ws` DoS)
2. **`react-router-dom`**: `6.30.1` → `^7.9.4` (corrige XSS via open redirect)
   - React Router 7 mantém compatibilidade com a API v6 quando usado em modo "library" (que é como o projeto usa via `BrowserRouter` em `src/App.tsx`). Não requer migração para framework mode.
3. **`recharts`**: `2.15.4` → `^3.2.1` (remove dependência de `lodash` vulnerável)
   - v3 muda apenas APIs avançadas; os componentes usados em `src/components/ui/chart.tsx` (ChartContainer/Tooltip/Legend wrappers) continuam compatíveis.

## Execução

- Atualizar `package.json` e rodar `bun install`
- Validar build (`tsgo` + vite build automático do harness)
- Se houver quebra de tipos em `chart.tsx` ou nas rotas, ajustar pontualmente
- Marcar finding como resolvido via `security--manage_security_finding`

## Fora de escopo

- Findings medium severity (mesmos pacotes, resolvidos no mesmo upgrade — serão marcados juntos se o scan confirmar)
- Refatoração para React Router v7 framework mode
