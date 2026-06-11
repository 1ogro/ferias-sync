## Diagnóstico

O CTA "Pedir Informações" no `Inbox` faz:

```ts
newStatus = Status.INFORMACOES_ADICIONAIS;
UPDATE requests SET status = 'INFORMACOES_ADICIONAIS' WHERE id = ...
```

Mas o check constraint `requests_status_check` no Postgres só aceita:

```
'PENDENTE', 'EM_ANALISE_GESTOR', 'APROVADO_1NIVEL', 'EM_ANALISE_DIRETOR',
'APROVADO_FINAL', 'REPROVADO', 'CANCELADO', 'REALIZADO', 'EM_ANDAMENTO', 'RASCUNHO'
```

`INFORMACOES_ADICIONAIS` está no enum TS mas nunca foi adicionado ao constraint, então qualquer update para esse status quebra. Também há outros locais (RPC `get_manager_deletion_impact`) que usam `'INFORMACOES_ADICIONAIS'` esperando que o valor exista no banco.

## Solução

### Migration: ampliar `requests_status_check`

```sql
ALTER TABLE public.requests DROP CONSTRAINT requests_status_check;
ALTER TABLE public.requests ADD CONSTRAINT requests_status_check
  CHECK (status = ANY (ARRAY[
    'PENDENTE','EM_ANALISE_GESTOR','APROVADO_1NIVEL','EM_ANALISE_DIRETOR',
    'APROVADO_FINAL','REPROVADO','CANCELADO','REALIZADO','EM_ANDAMENTO',
    'RASCUNHO','INFORMACOES_ADICIONAIS'
  ]));
```

Sem mudança de schema além disso, sem mudança de dados existentes.

### Validação
- Após a migration, clicar em "Pedir Informações" em uma solicitação pendente: status deve passar para `INFORMACOES_ADICIONAIS` sem erro.
- Conferir nos logs que a `slack-notification` `REQUEST_INFO` é disparada normalmente.

## Observação
Não vamos mexer no frontend nem em RLS — a policy de UPDATE já permite a transição, o problema é só o check constraint desatualizado em relação ao enum do app.
