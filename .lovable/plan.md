

## Plano: Adicionar Seletor de Ano no Diálogo de Recálculo em Massa

### Contexto

Atualmente, o diálogo de recálculo usa o `selectedYear` global da página (o mesmo seletor do topo da tabela). O usuário quer poder escolher qual ano recalcular diretamente no diálogo, similar ao que existe no diálogo de migração com o seletor "Ano de Origem".

### Alterações Necessárias

**Arquivo:** `src/pages/VacationManagement.tsx`

---

### 1. Adicionar Novo Estado para Ano de Recálculo

**Localização:** Após linha ~119 (junto aos estados de recálculo)

```typescript
const [recalculateYear, setRecalculateYear] = useState(new Date().getFullYear());
```

---

### 2. Criar Handler para Mudança de Ano no Recálculo

**Localização:** Após `handleOpenRecalculateDialog` (~linha 625)

```typescript
const handleRecalculateYearChange = async (year: string) => {
  const yearNum = parseInt(year);
  setRecalculateYear(yearNum);
  
  // Recarregar preview para o novo ano
  setRecalculatePreviewLoading(true);
  try {
    const { data: manualBalances } = await supabase
      .from('vacation_balances')
      .select('person_id')
      .eq('year', yearNum);
    
    // Buscar dados do ano selecionado
    const balances = await getAllVacationBalances(yearNum);
    const manualPersonIds = new Set(manualBalances?.map(b => b.person_id) || []);
    
    setRecalculatePreview({
      totalPeople: balances.length,
      withManualBalance: balances.filter(d => manualPersonIds.has(d.person_id)).length,
      withoutManualBalance: balances.filter(d => !manualPersonIds.has(d.person_id)).length
    });
  } catch (error) {
    console.error('Erro ao carregar preview:', error);
  } finally {
    setRecalculatePreviewLoading(false);
  }
};
```

---

### 3. Modificar `handleOpenRecalculateDialog`

Inicializar `recalculateYear` com o ano atual da página:

```typescript
const handleOpenRecalculateDialog = async () => {
  const yearToRecalculate = selectedYear; // Usar ano atual como padrão
  setRecalculateYear(yearToRecalculate);
  setMassRecalculateJustification("");
  setRecalculatePreview(null);
  setMassRecalculateOpen(true);
  setRecalculatePreviewLoading(true);
  
  try {
    const { data: manualBalances } = await supabase
      .from('vacation_balances')
      .select('person_id')
      .eq('year', yearToRecalculate);
    
    const manualPersonIds = new Set(manualBalances?.map(b => b.person_id) || []);
    
    setRecalculatePreview({
      totalPeople: filteredData.length,
      withManualBalance: filteredData.filter(d => manualPersonIds.has(d.person_id)).length,
      withoutManualBalance: filteredData.filter(d => !manualPersonIds.has(d.person_id)).length
    });
  } catch (error) {
    console.error('Erro ao carregar preview:', error);
  } finally {
    setRecalculatePreviewLoading(false);
  }
};
```

---

### 4. Modificar `handleMassRecalculate`

Usar `recalculateYear` em vez de `selectedYear`:

**Linha ~556-558:** Trocar `selectedYear` por `recalculateYear`

```typescript
const result = await recalculateVacationBalance(
  item.person_id,
  recalculateYear,  // <-- Mudança aqui
  massRecalculateJustification.trim(),
  person.id
);
```

---

### 5. Atualizar UI do Diálogo

**Localização:** Linhas ~1786-1878

Adicionar seletor de ano após o título, similar ao diálogo de migração:

```tsx
<Dialog open={massRecalculateOpen} onOpenChange={setMassRecalculateOpen}>
  <DialogContent className="sm:max-w-[500px]">
    <DialogHeader>
      <DialogTitle>Recalcular Saldos em Massa</DialogTitle>
      <DialogDescription>
        Recalcular automaticamente os saldos de férias para todos os colaboradores.
      </DialogDescription>
    </DialogHeader>
    <div className="space-y-4">
      {/* Novo: Seletor de Ano */}
      <div>
        <Label htmlFor="recalculate-year" className="block text-sm font-medium mb-2">
          Ano para Recálculo
        </Label>
        <Select 
          value={recalculateYear.toString()} 
          onValueChange={handleRecalculateYearChange}
          disabled={massRecalculateLoading}
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="z-50 bg-background">
            {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 2 + i)
              .map((year) => (
                <SelectItem key={year} value={year.toString()}>
                  {year}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
      </div>

      {/* Preview Section - atualizar referências de selectedYear para recalculateYear */}
      <div className="bg-muted p-4 rounded-lg space-y-2">
        <h4 className="font-medium flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-500" />
          Prévia do Recálculo - Ano {recalculateYear}
        </h4>
        {/* ... resto do preview ... */}
      </div>

      {/* Avisos - atualizar referências */}
      <div className="text-sm text-destructive/90 ...">
        <strong>⚠️ ATENÇÃO:</strong> Esta operação irá:
        <ul className="list-disc ml-4 mt-2">
          <li>Recalcular baseado na data de contrato e solicitações aprovadas de <strong>{recalculateYear}</strong></li>
          <li>Sobrescrever saldos manuais existentes de {recalculateYear}</li>
          <li>Aplicar a mesma justificativa para todos os registros</li>
        </ul>
      </div>
      
      {/* ... resto do diálogo ... */}
    </div>
    <DialogFooter>
      {/* Atualizar texto do botão */}
      <Button onClick={handleMassRecalculate} variant="destructive" ...>
        Recalcular {recalculatePreview?.totalPeople || 0} Saldo(s) de {recalculateYear}
      </Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

---

### Resultado Visual

```
┌──────────────────────────────────────────────┐
│  Recalcular Saldos em Massa                  │
│                                              │
│  Ano para Recálculo:                         │
│  ┌────────────────────────────────────────┐  │
│  │ 2026                               ▼   │  │
│  └────────────────────────────────────────┘  │
│                                              │
│  ┌────────────────────────────────────────┐  │
│  │ ⚠️ Prévia do Recálculo - Ano 2026      │  │
│  │                                        │  │
│  │ • 24 colaborador(es) serão processados │  │
│  │ • 1 possuem saldo manual               │  │
│  │ • 23 usam cálculo automático           │  │
│  └────────────────────────────────────────┘  │
│                                              │
│  ⚠️ ATENÇÃO: Esta operação irá...            │
│                                              │
│  Justificativa: [________________________]   │
│                                              │
│  [Cancelar]    [Recalcular 24 Saldo(s) de 2026]│
└──────────────────────────────────────────────┘
```

---

### Resumo das Alterações

| Arquivo | Alteração |
|---------|-----------|
| `src/pages/VacationManagement.tsx` | Adicionar estado `recalculateYear` |
| `src/pages/VacationManagement.tsx` | Criar handler `handleRecalculateYearChange` |
| `src/pages/VacationManagement.tsx` | Modificar `handleOpenRecalculateDialog` para inicializar o ano |
| `src/pages/VacationManagement.tsx` | Modificar `handleMassRecalculate` para usar `recalculateYear` |
| `src/pages/VacationManagement.tsx` | Atualizar UI do diálogo com seletor de ano |

