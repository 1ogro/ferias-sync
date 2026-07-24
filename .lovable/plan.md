## Problema

`/engagement` quebra com o erro:
`cannot add \`postgres_changes\` callbacks for realtime:kudos-feed after \`subscribe()\`.`

O Supabase Realtime lança essa exceção quando `.on("postgres_changes", ...)` é chamado em um canal que já está no estado `subscribed`. Em `src/hooks/useEngagement.ts` (hook `useKudosFeed`) o canal é criado com nome fixo `"kudos-feed"`. Em StrictMode/HMR (e em qualquer situação onde o efeito é re-executado antes do `removeChannel` anterior propagar no cliente), o cliente reaproveita o canal pelo topic e a segunda chamada `.on(...)` acontece após o `subscribe()` do primeiro ciclo — quebrando a página inteira via ErrorBoundary.

O mesmo padrão de risco existe em `useMyPoints`, mas ali o topic já inclui `personId`; ainda assim, dois mounts consecutivos com o mesmo `personId` podem colidir.

## Correção

Ajustar apenas `src/hooks/useEngagement.ts`:

1. **`useKudosFeed`**: gerar um topic único por instância do hook (ex.: `` `kudos-feed-${crypto.randomUUID()}` ``) para que cada mount tenha seu próprio canal, eliminando a colisão pós-`subscribe`.
2. **`useMyPoints`**: aplicar o mesmo padrão (`` `my-points-${personId}-${uid}` ``) para blindar contra remounts rápidos com o mesmo `personId`.
3. Manter o cleanup existente com `supabase.removeChannel(ch)`.

Nenhuma outra alteração de lógica, UI ou backend. Sem migrações.

## Verificação

- Recarregar `/engagement` e confirmar que a página renderiza sem cair no ErrorBoundary.
- Enviar um kudo em outra aba e confirmar que o feed continua atualizando em tempo real (invalidação da query `kudos_feed`).
