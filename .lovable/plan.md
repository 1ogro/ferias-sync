## Problema

Ao navegar para `/vacation-management?tab=pulses` (via CTA do `/engagement` ou colando a URL), a aba Pulses não abre — a página redireciona para `/`.

**Causa raiz** (`src/pages/VacationManagement.tsx`, linha 243):

```tsx
if (!person || (person.papel !== 'DIRETOR' && ...)) {
  return <Navigate to="/" replace />;
}
```

Na primeira renderização o `person` do `AuthContext` ainda está carregando (`null`). O guard interpreta como "não autorizado" e redireciona para `/`, descartando o query param `?tab=pulses` antes que o usuário chegue na tela.

Além disso, mesmo se o guard não redirecionasse, `useState(initialTab)` (linha 184) só lê `searchParams` no mount inicial — se a URL mudar depois, a aba ativa não sincroniza.

## Correção

Ajustes apenas no `src/pages/VacationManagement.tsx`:

1. **Respeitar o estado de carregamento do auth**: usar o `loading` (ou equivalente) do `useAuth()` para não redirecionar enquanto `person` ainda não foi resolvido. Enquanto carrega, renderizar um placeholder simples (skeleton/spinner já usado na página) em vez de `<Navigate>`.

2. **Sincronizar aba com a URL**: adicionar `useEffect` que observa `searchParams.get('tab')` e chama `setActiveTab(...)` quando o valor mudar e for uma aba válida (`availableTabs.includes(tab)`). Isso também cobre navegação entre abas via link/CTA depois do mount.

3. **Validar** a correção:
   - Navegar `/engagement` → clicar "Gerenciar pulses" → aba Pulses aberta.
   - Colar `/vacation-management?tab=pulses` direto no browser → aba Pulses aberta.
   - Usuário sem permissão (`COLABORADOR`) continua sendo redirecionado para `/` após o auth resolver.
   - `bunx tsc --noEmit` limpo.

## Escopo

- Somente `src/pages/VacationManagement.tsx`.
- Sem mudanças de backend, rotas, ou no CTA do `Engagement` (que já usa `?tab=pulses` corretamente).
- Sem mudança visual além do placeholder de loading (que já é o padrão da app durante o carregamento do auth).