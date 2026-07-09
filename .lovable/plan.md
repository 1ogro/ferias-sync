## Verificação

Validar via Playwright que `/vacation-management?tab=pulses` abre na aba Pulses após o auth carregar, sem redirect para `/` e sem cair na aba padrão.

### Passos

1. **Restaurar sessão Supabase gerenciada** (`LOVABLE_BROWSER_AUTH_STATUS=injected`) — cookies + localStorage — e navegar direto para `http://localhost:8080/vacation-management?tab=pulses`.
2. **Aguardar** `networkidle` + o header renderizar (`Gestão`) para garantir que o auth resolveu.
3. **Verificar** que:
   - URL final continua `?tab=pulses` (sem redirect para `/`).
   - A trigger `TabsTrigger` com valor `pulses` está com `data-state="active"`.
   - O conteúdo do `PulsesTab` está no DOM (título "Feed de kudos" ou "Pulses").
4. **Screenshot** de evidência em `/tmp/browser/pulses-tab/screenshots/`.
5. **Cenário negativo**: navegar para `/vacation-management` (sem query) e confirmar que a aba padrão (`vacation` p/ diretor, `active` p/ gestor) abre — para garantir que o `useEffect` de sincronização não força `pulses` indevidamente.
6. **Console/network**: capturar erros; ausência de warnings de React sobre estado inconsistente.

### Observação sobre o título do issue

O usuário escreveu `#tab=pulses` (hash), mas todos os CTAs internos (`Engagement.tsx`, `EngagementSummaryCard.tsx`) usam `?tab=pulses` (query string), que é o formato lido por `useSearchParams`. Se o teste com `?tab=pulses` passar, a rota está funcional para o fluxo real do produto. **Não vou adicionar suporte a `#tab=pulses`** — nenhum código gera esse formato e adicioná-lo aumentaria a superfície sem necessidade. Confirmar com o usuário só se ele indicar que digita a URL manualmente com `#`.

### Escopo

- Somente verificação — nenhum arquivo alterado.
- Se algum passo falhar, reporto o sintoma e proponho ajuste em plano separado.
