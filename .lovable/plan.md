
## Objetivo

Reduzir o número de abas em **Gestão do Time** (`/vacation-management`) movendo a sincronização do Google Sheets para a página **/admin**, e reordenar as abas restantes em uma sequência mais intuitiva.

## Mudanças

### 1. `src/pages/VacationManagement.tsx` — remover aba "Google Sheets"

- Remover `'sheets'` de `allTabs`.
- Remover os dois `TabsTrigger value="sheets"` (desktop + mobile).
- Remover o `case 'sheets'` em `renderTabContent` e o bloco `<TabsContent value="sheets">`.
- Remover os imports `SheetsSync` e `UsersSheetsSync`.

**Nova ordem das abas (admin/diretor)** — agrupada por fluxo (operação do dia → planejamento → análise → pessoas → arquivo):

```text
Ausências Ativas | Saldos de Férias | Licenças Médicas | Resumo do Colaborador | Dashboard | Pulses | Histórico
```

**Abas de gestor** (sem alteração de conteúdo, apenas ordem):

```text
Ausências Ativas | Dashboard | Licenças Médicas | Pulses
```

Aplicar a nova ordem tanto no array `allTabs`/`managerTabs` quanto nas listas visuais (desktop e mobile) para manter consistência.

### 2. `src/pages/Admin.tsx` — adicionar seção "Sincronização Google Sheets"

A página `/admin` é um layout plano (sem `Tabs`), então a sincronização entrará como uma **seção dedicada ao final da página**, visível apenas para admins (a página já bloqueia não-admins em `!person.is_admin`):

- Importar `SheetsSync` e `UsersSheetsSync`.
- Após o último bloco da listagem de colaboradores, adicionar:

```tsx
<section className="space-y-6 pt-6 border-t">
  <div>
    <h2 className="text-xl font-semibold">Sincronização Google Sheets</h2>
    <p className="text-sm text-muted-foreground">
      Importação de colaboradores e dados de férias a partir das planilhas oficiais.
    </p>
  </div>
  <SheetsSync />
  <UsersSheetsSync />
</section>
```

Sem alterações de lógica/permissões — apenas realocação visual dos componentes existentes.

### 3. Sem mudanças em

- Componentes `SheetsSync` / `UsersSheetsSync` (apenas mudam de local).
- Backend, rotas, permissões, RLS.
- Lógica das outras abas.

## Verificação

- `/vacation-management` mostra 7 abas (admin) ou 4 (gestor) na nova ordem, sem "Google Sheets".
- `/admin` exibe a nova seção "Sincronização Google Sheets" ao final, funcional como antes.
- Build sem erros de import órfão em `VacationManagement.tsx`.
