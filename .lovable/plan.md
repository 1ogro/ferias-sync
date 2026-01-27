

## Plano: Adicionar Link para Página de Diagnóstico no Card do Figma

### Objetivo
Adicionar um botão/link para a página de diagnóstico de configuração do Figma OAuth (`/figma-diagnostic`) diretamente no card de integração do Figma na página de configurações (`/settings`).

---

### Abordagem

Existem duas formas de implementar:

**Opção A - Modificar apenas Settings.tsx** (Recomendada)
Adicionar um terceiro botão específico para o Figma diretamente no Settings.tsx, sem modificar o componente genérico IntegrationCard.

**Opção B - Modificar IntegrationCard**
Adicionar uma prop opcional para link extra em qualquer integration card.

Vou seguir a **Opção A** por ser mais simples e focada no caso do Figma, que é o único que tem página de diagnóstico.

---

### Alterações Necessárias

**Arquivo:** `src/pages/Settings.tsx`

---

### 1. Adicionar Import do Ícone

Adicionar `Stethoscope` aos imports do lucide-react:

```tsx
import { Monitor, Bell, Table, RotateCcw, Save, Plug, Mail, Figma, Stethoscope } from "lucide-react";
```

---

### 2. Adicionar Import do Link

Adicionar `Link` do react-router-dom:

```tsx
import { Link } from "react-router-dom";
```

---

### 3. Substituir IntegrationCard do Figma por Card Customizado

Substituir o `<IntegrationCard>` do Figma (linhas ~424-437) por uma versão expandida que inclua o botão de diagnóstico:

```tsx
{/* Figma OAuth - Card customizado com link para diagnóstico */}
<Card>
  <CardHeader>
    <div className="flex items-start justify-between">
      <div className="flex items-center gap-3">
        <div className="text-primary">
          <Figma className="w-6 h-6" />
        </div>
        <div>
          <CardTitle>Figma OAuth</CardTitle>
          <CardDescription className="mt-1">
            Configure autenticação via Figma para login no sistema
          </CardDescription>
        </div>
      </div>
      {/* Status Badge */}
      {integrationSettings?.figma_status === 'not_configured' && (
        <Badge variant="outline">Não configurado</Badge>
      )}
      {integrationSettings?.figma_status === 'configured' && (
        <Badge variant="secondary">Configurado</Badge>
      )}
      {integrationSettings?.figma_status === 'active' && (
        <Badge className="bg-green-600">Ativo</Badge>
      )}
      {integrationSettings?.figma_status === 'error' && (
        <Badge variant="destructive">Erro</Badge>
      )}
      {!integrationSettings?.figma_status && (
        <Badge variant="outline">Não configurado</Badge>
      )}
    </div>
  </CardHeader>
  <CardContent>
    <div className="space-y-4">
      {integrationSettings?.figma_error_message && (
        <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-md">
          <strong>Erro:</strong> {integrationSettings.figma_error_message}
        </div>
      )}

      {integrationSettings?.figma_test_date && (
        <div className="text-sm text-muted-foreground">
          Último teste: {new Date(integrationSettings.figma_test_date).toLocaleString('pt-BR')}
        </div>
      )}

      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setWizardType('figma');
            setWizardOpen(true);
          }}
          className="flex-1"
        >
          <Settings className="w-4 h-4 mr-2" />
          Configurar
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => testFigma()}
          disabled={!integrationSettings?.figma_status || integrationSettings.figma_status === 'not_configured' || isTestingFigma}
          className="flex-1"
        >
          <TestTube className="w-4 h-4 mr-2" />
          {isTestingFigma ? 'Testando...' : 'Testar'}
        </Button>
      </div>
      
      {/* Novo: Botão de Diagnóstico */}
      <Button
        variant="ghost"
        size="sm"
        asChild
        className="w-full text-muted-foreground hover:text-foreground"
      >
        <Link to="/figma-diagnostic">
          <Stethoscope className="w-4 h-4 mr-2" />
          Executar Diagnóstico Completo
        </Link>
      </Button>
    </div>
  </CardContent>
</Card>
```

---

### Resultado Visual

```text
┌─────────────────────────────────────────────────────┐
│  🎨 Figma OAuth                      [Configurado]  │
│  Configure autenticação via Figma para login...     │
├─────────────────────────────────────────────────────┤
│                                                     │
│  Último teste: 27/01/2026, 10:30:00                 │
│                                                     │
│  ┌──────────────────┐  ┌──────────────────┐         │
│  │ ⚙️ Configurar    │  │ 🧪 Testar        │         │
│  └──────────────────┘  └──────────────────┘         │
│                                                     │
│  ┌─────────────────────────────────────────────┐    │
│  │ 🩺 Executar Diagnóstico Completo            │    │
│  └─────────────────────────────────────────────┘    │
│                                                     │
└─────────────────────────────────────────────────────┘
```

---

### Imports Necessários (Adicionais)

Adicionar ao arquivo Settings.tsx:
- `Settings as SettingsIcon` (para evitar conflito com nome da página)
- `TestTube` do lucide-react
- `Link` do react-router-dom

---

### Resumo das Alterações

| Arquivo | Linha | Alteração |
|---------|-------|-----------|
| `src/pages/Settings.tsx` | ~17 | Adicionar import de `Stethoscope`, `TestTube` |
| `src/pages/Settings.tsx` | Top | Adicionar import de `Link` do react-router-dom |
| `src/pages/Settings.tsx` | ~424-437 | Substituir IntegrationCard do Figma por Card customizado com botão de diagnóstico |

