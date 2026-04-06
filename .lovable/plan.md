

## Plan: Dar acesso de Gestor às abas de time no Gestão de Férias

### Resumo
Gestores poderão acessar a página `/vacation-management` com uma versão reduzida: apenas as abas relevantes ao seu time (Férias Aprovadas, Capacidade do Time, Ausências Ativas, Licenças Médicas). Dados serão filtrados automaticamente para mostrar apenas colaboradores do time do gestor.

### Mudanças

#### 1. `src/pages/VacationManagement.tsx`
- **Acesso**: Alterar guard de `person.papel !== 'DIRETOR' && !person.is_admin` para incluir `GESTOR`
- **Tabs condicionais**: Gestores veem apenas: `active` (Ausências Ativas), `dashboard` (Dashboard com Capacidade + Férias Aprovadas), `medical` (Licenças Médicas). Diretores/admins continuam vendo todas as 7 tabs
- **Dados filtrados**: Para gestores, o fetch de dados filtra por `gestor_id = person.id` (apenas subordinados diretos)

#### 2. `src/components/ApprovedVacationsExecutiveView.tsx`
- Aceitar prop opcional `managerId?: string`
- Quando `managerId` presente, filtrar resultados client-side por `requester_id` pertencente ao time do gestor (usando lista de IDs dos subordinados)
- Alternativa: buscar IDs dos subordinados e filtrar na query com `.in('requester_id', teamIds)`

#### 3. `src/components/ActiveAbsencesDashboard.tsx`
- Aceitar prop opcional `managerId?: string`
- Quando presente, filtrar ausências para mostrar apenas pessoas do time

#### 4. `src/components/TeamCapacityDashboard.tsx`
- Já busca dados via RLS (alertas de capacidade). Gestor já tem acesso via RLS se `sub_time` bate. Verificar se funciona sem mudanças; se não, adicionar prop de filtragem.

#### 5. `src/components/MedicalLeaveList.tsx`
- RLS já permite gestores verem licenças médicas de subordinados. Componente já deve funcionar. Verificar e ajustar se necessário.

#### 6. `src/components/Header.tsx`
- Adicionar link para `/vacation-management` visível para gestores (atualmente só aparece para admins/diretores via navegação interna ou link direto)

### RLS
As policies existentes nas tabelas `requests` e `medical_leaves` já permitem que gestores vejam dados dos subordinados diretos. Nenhuma migração de banco necessária.

### Fluxo

```text
Gestor acessa /vacation-management
       │
       ▼
  Vê apenas 3-4 tabs (escopo do time):
  ┌──────────────────────────────────────────┐
  │ Ausências Ativas │ Dashboard │ Licenças  │
  └──────────────────────────────────────────┘
       │
       ▼
  Dados filtrados por gestor_id = person.id
  (apenas subordinados diretos)
```

