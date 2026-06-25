## Objetivo
Garantir que o sorteio de avaliação entre pares (peer review) aconteça sempre **dentro do mesmo time**, nunca cruzando times diferentes.

## Mudança
No arquivo `supabase/functions/pulse-dispatch/index.ts`:

1. Incluir `sub_time` no `select` dos recipients (em todos os ramos: `all`, `teams`, `team`, `custom`).
2. Substituir a chamada única de `generatePeerPairs(recipients)` por um agrupamento por `sub_time`:
   - Agrupar recipients por `sub_time`.
   - Rodar `generatePeerPairs` separadamente para cada grupo.
   - Concatenar os pares resultantes.
3. Tratamento de grupos pequenos:
   - Time com 1 pessoa → ignorado no sorteio; pessoa marcada em diagnostics como `no_subject_assigned` (já existe a lógica).
   - Pessoas sem `sub_time` (null) → agrupadas separadamente entre si, ou ignoradas se isoladas.

## Fora do escopo
- UI de configuração das enquetes.
- Outras edge functions (kudos, etc.).
- Estrutura de tabelas.

## Detalhes técnicos
Trecho atualizado (conceitual):

```ts
if (survey.kind === "peer") {
  const groups = new Map<string, typeof recipients>();
  for (const p of recipients) {
    const key = p.sub_time ?? "__no_team__";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(p);
  }
  const pairs = [...groups.values()].flatMap(g => generatePeerPairs(g));
  // ...resto igual
}
```
