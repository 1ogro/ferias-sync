Trocar o destino do CTA "Ver Pulses" no `EngagementSummaryCard`:

- De: `navigate("/engagement")`
- Para: `navigate("/vacation-management?tab=pulses")`

A aba Pulses vive em `VacationManagement.tsx`, que já lê `searchParams.get('tab')` como tab inicial (linha 178). Nenhuma outra mudança necessária.