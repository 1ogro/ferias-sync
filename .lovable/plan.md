## Diagnóstico

A notificação de nova solicitação para o gestor depende de `person.gestorId` em `src/components/NewRequestForm.tsx`:

```ts
if (!isDirector && person.gestorId) {
  // ... buscar gestor, mandar email + slack-notification
}
```

Mas em `src/hooks/useAuth.tsx::fetchPersonData` o `person` é setado **direto** do row do Supabase, que vem em snake_case (`gestor_id`, `sub_time`). O tipo `Person` declara `gestorId` (camelCase), então `person.gestorId` fica **sempre undefined** → todo o bloco de email + slack é pulado silenciosamente.

Validação no banco confirma: o request mais recente (Seymour Azevedo, 11/06 14:42, gestor Pedro Belsito) não gerou nenhuma chamada para `slack-notification` nem `send-notification-email` no log de edge functions, apesar de o gestor existir corretamente em `people.gestor_id`.

Como outros pontos do app já mapeiam `gestor_id → gestorId` manualmente (Admin.tsx, RequestDetail.tsx, VacationManagement.tsx), o bug está localizado no auth context.

## Solução

### 1. `src/hooks/useAuth.tsx`
Em `fetchPersonData`, ao receber `profile.people`, mapear os campos snake_case esperados pelo tipo `Person`:

```ts
const raw = profile.people as any;
const personData: Person = {
  ...raw,
  gestorId: raw.gestor_id ?? undefined,
  subTime: raw.sub_time ?? undefined,
};
setPerson(personData);
```

Isso resolve não só a notificação de novas solicitações como qualquer outro lugar que confie em `person.gestorId` vindo do `useAuth` (Dashboard, Inbox, TeamCapacityDashboard, ApprovedVacationsExecutiveView).

### 2. Reforço defensivo em `src/components/NewRequestForm.tsx`
Trocar `person.gestorId` por `person.gestorId ?? (person as any).gestor_id` nas três ocorrências (linhas ~344, 406, 413), garantindo que mesmo se algum outro caller passar o objeto cru o fluxo de notificação não quebre.

### 3. Melhorar fallback no `slack-notification` para `NEW_REQUEST`
Hoje só passamos `approverEmail` — se o email do `people` não bater com o email Slack do gestor, o `users.lookupByEmail` falha e cai no canal padrão (`#approvals`). Adicionar também `approverName` na chamada do `NewRequestForm`, ativando o fallback `findSlackUserByName` que já existe na função:

```ts
supabase.functions.invoke('slack-notification', {
  body: {
    type: 'NEW_REQUEST',
    ...,
    approverEmail: managerData.email,
    approverName: managerData.nome,   // novo
  }
});
```

E ajustar o `select` do gestor para trazer `nome` também:

```ts
.select('email, nome')
```

### 4. Validação
- Submeter uma nova solicitação como colaborador qualquer (ex.: usuário de teste) e conferir nos logs de `slack-notification` que o payload `NEW_REQUEST` aparece com `approverEmail` + `approverName`.
- Confirmar que a DM chegou ao Slack do gestor (e não ao canal `#approvals` como fallback).
- Reabrir o request do Seymour não é necessário; basta criar um novo para validar.

## Observação
Esse mesmo "atalho" snake_case → camelCase precisa ser mantido em sincronia com o tipo `Person`. Se quiser, num passo separado posso padronizar um helper `mapPersonRow()` reutilizável em todos os lugares que hoje fazem o mapeamento manual.
