

## Plano: Melhorar Mensagem de Erro do Login com Figma

### Objetivo
Adicionar mensagens de erro mais detalhadas quando o login com Figma falhar, especificamente para erros relacionados à configuração de redirect URI, ajudando os usuários a diagnosticar e corrigir o problema.

---

### Análise do Problema

O erro "Invalid redirect uri" ocorre quando há inconsistência entre três locais de configuração:

1. **Figma OAuth App** - O redirect URI configurado no Figma
2. **Supabase Auth Provider** - O redirect URI no painel do Supabase
3. **Aplicação** - A URL de callback usada no código (`/auth/callback/figma`)

O fluxo correto requer:
```text
┌─────────────────────────────────────────────────────────────────────┐
│                          FLUXO OAUTH FIGMA                          │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  1. App chama signInWithFigma()                                     │
│     ↓                                                               │
│  2. Supabase redireciona para Figma com redirect_uri                │
│     (Supabase Callback: .../auth/v1/callback)                       │
│     ↓                                                               │
│  3. Figma valida se redirect_uri está no OAuth App                  │
│     ❌ Se não bater → "Invalid redirect uri"                        │
│     ↓                                                               │
│  4. Figma retorna para Supabase                                     │
│     ↓                                                               │
│  5. Supabase redireciona para app (redirectTo do código)            │
│     (/auth/callback/figma)                                          │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

### Arquivos a Modificar

| Arquivo | Alteração |
|---------|-----------|
| `src/pages/FigmaCallback.tsx` | Adicionar detecção e tratamento específico para erros de redirect URI |
| `src/pages/Auth.tsx` | Melhorar mensagem de erro no `handleFigmaLogin` |

---

### 1. Melhorar FigmaCallback.tsx

**Alterações:**
- Detectar erros específicos como "invalid_redirect_uri", "redirect_uri_mismatch"
- Mostrar mensagem expandida com instruções de correção
- Incluir links para configuração no Supabase e Figma

**Código:**

```tsx
// Adicionar helper para detectar tipo de erro
const getFigmaErrorDetails = (errorCode: string, errorDescription: string) => {
  const lowerError = (errorCode + errorDescription).toLowerCase();
  
  if (lowerError.includes('redirect') && (lowerError.includes('invalid') || lowerError.includes('mismatch'))) {
    return {
      title: 'Erro de Configuração de Redirect URI',
      description: 'O URI de redirecionamento configurado não corresponde ao esperado pelo Figma.',
      isRedirectError: true,
      steps: [
        'Verifique o Redirect URI no Figma OAuth App (Account Settings → OAuth apps)',
        'O valor deve ser exatamente: https://uhphxyhffpbnmsrlggbe.supabase.co/auth/v1/callback',
        'Verifique também as configurações do provider Figma no Supabase Dashboard',
        'Certifique-se de que as URLs de redirect no Supabase incluem este domínio'
      ],
      links: {
        figma: 'https://www.figma.com/settings',
        supabase: 'https://supabase.com/dashboard/project/uhphxyhffpbnmsrlggbe/auth/providers'
      }
    };
  }
  
  if (lowerError.includes('client_id') || lowerError.includes("doesn't exist")) {
    return {
      title: 'Erro de Client ID',
      description: 'O Client ID configurado não foi encontrado no Figma.',
      isRedirectError: false,
      steps: [
        'Verifique se o Client ID está correto no Supabase Dashboard',
        'Compare com o Client ID do seu OAuth app no Figma'
      ],
      links: {
        figma: 'https://www.figma.com/settings',
        supabase: 'https://supabase.com/dashboard/project/uhphxyhffpbnmsrlggbe/auth/providers'
      }
    };
  }
  
  return null;
};
```

**UI Expandida para Erros de Redirect:**

```tsx
{status === 'error' && (
  <div className="space-y-4">
    <Alert variant="destructive">
      <XCircle className="h-4 w-4" />
      <AlertTitle>Erro na Autenticação</AlertTitle>
      <AlertDescription>{errorMessage}</AlertDescription>
    </Alert>
    
    {errorDetails?.isRedirectError && (
      <Alert className="border-amber-500/50 bg-amber-500/10">
        <AlertTriangle className="h-4 w-4 text-amber-500" />
        <AlertTitle className="text-amber-600">{errorDetails.title}</AlertTitle>
        <AlertDescription className="space-y-3">
          <p>{errorDetails.description}</p>
          
          <div className="mt-2">
            <p className="font-medium text-sm mb-1">Como corrigir:</p>
            <ol className="list-decimal list-inside text-xs space-y-1">
              {errorDetails.steps.map((step, i) => (
                <li key={i}>{step}</li>
              ))}
            </ol>
          </div>
          
          <div className="flex gap-2 mt-3">
            <a 
              href={errorDetails.links.figma}
              target="_blank"
              className="text-xs text-primary hover:underline flex items-center gap-1"
            >
              <Figma className="h-3 w-3" />
              Configurações Figma
            </a>
            <a 
              href={errorDetails.links.supabase}
              target="_blank"
              className="text-xs text-primary hover:underline flex items-center gap-1"
            >
              <ExternalLink className="h-3 w-3" />
              Supabase Providers
            </a>
          </div>
        </AlertDescription>
      </Alert>
    )}
    
    <Button onClick={() => navigate('/auth')} className="w-full" variant="outline">
      Voltar para Login
    </Button>
  </div>
)}
```

---

### 2. Melhorar Auth.tsx

**Alterações no `handleFigmaLogin`:**

```tsx
const handleFigmaLogin = async () => {
  setLoading(true);
  try {
    const { error } = await signInWithFigma();
    
    if (error) {
      // Detectar erros de configuração
      const errorMsg = error.message?.toLowerCase() || '';
      
      let description = error.message;
      
      if (errorMsg.includes('redirect') || errorMsg.includes('uri')) {
        description = 'Erro de configuração de Redirect URI. Verifique se o URI configurado no Figma OAuth App corresponde ao esperado pelo Supabase.';
      } else if (errorMsg.includes('client_id') || errorMsg.includes("doesn't exist")) {
        description = 'Client ID inválido ou não encontrado. Verifique as configurações do OAuth app no Figma.';
      } else if (errorMsg.includes('provider') || errorMsg.includes('not enabled')) {
        description = 'O provider Figma não está habilitado. Configure-o no Supabase Dashboard em Authentication → Providers.';
      }
      
      toast({
        title: 'Erro no login com Figma',
        description,
        variant: 'destructive',
      });
    }
  } catch (error) {
    toast({
      title: 'Erro no login com Figma',
      description: 'Ocorreu um erro inesperado. Tente novamente.',
      variant: 'destructive',
    });
  } finally {
    setLoading(false);
  }
};
```

---

### 3. Informação Técnica para Administradores

**Adicionar seção informativa no FigmaCallback quando houver erro:**

```text
┌──────────────────────────────────────────────────────────────────┐
│  ⚠️ Erro de Configuração de Redirect URI                         │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  O URI de redirecionamento configurado não corresponde           │
│  ao esperado pelo Figma.                                         │
│                                                                  │
│  📋 Como corrigir:                                               │
│                                                                  │
│  1. No Figma OAuth App, configure o Redirect URI como:           │
│     ┌────────────────────────────────────────────────────────┐   │
│     │ https://uhphxyhffpbnmsrlggbe.supabase.co/auth/v1/callback │ │
│     └────────────────────────────────────────────────────────┘   │
│                                                                  │
│  2. No Supabase Dashboard → Authentication → URL Configuration: │
│     Adicione as seguintes URLs de redirect:                      │
│     • https://ferias-sync.lovable.app/auth/callback/figma        │
│     • https://*--*.lovable.app/auth/callback/figma (preview)     │
│                                                                  │
│  🔗 [Configurações Figma]  [Supabase Providers]                  │
│                                                                  │
│  [Voltar para Login]                                             │
└──────────────────────────────────────────────────────────────────┘
```

---

### Resumo das Alterações

| Arquivo | Linha | Alteração |
|---------|-------|-----------|
| `src/pages/FigmaCallback.tsx` | Novo código | Adicionar helper `getFigmaErrorDetails()` |
| `src/pages/FigmaCallback.tsx` | ~90-105 | Expandir seção de erro com detalhes e instruções |
| `src/pages/Auth.tsx` | ~169-190 | Melhorar detecção e mensagens em `handleFigmaLogin` |

### Resultado Esperado

Quando um usuário enfrentar o erro "Invalid redirect uri":
1. Verá uma mensagem clara explicando que é um problema de configuração
2. Receberá passos específicos para corrigir o problema
3. Terá links diretos para os painéis de configuração do Figma e Supabase
4. Administradores poderão diagnosticar rapidamente a causa raiz

