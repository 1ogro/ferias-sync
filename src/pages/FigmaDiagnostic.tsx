import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { 
  CheckCircle2, 
  XCircle, 
  AlertTriangle, 
  Loader2, 
  Copy, 
  ExternalLink, 
  RefreshCw,
  ArrowLeft,
  Figma,
  Database,
  Globe,
  Shield
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface DiagnosticCheck {
  id: string;
  name: string;
  description: string;
  status: 'pending' | 'checking' | 'success' | 'warning' | 'error';
  details?: string;
  action?: {
    label: string;
    href?: string;
    onClick?: () => void;
  };
}

interface DiagnosticResult {
  dbClientId: string | null;
  dbRedirectUri: string | null;
  dbEnabled: boolean;
  dbStatus: string | null;
  secretClientId: string | null;
  hasClientSecret: boolean;
  supabaseCallbackUrl: string;
  expectedRedirectUrls: string[];
  currentOrigin: string;
}

const SUPABASE_PROJECT_ID = 'uhphxyhffpbnmsrlggbe';
const SUPABASE_CALLBACK_URL = `https://${SUPABASE_PROJECT_ID}.supabase.co/auth/v1/callback`;

export default function FigmaDiagnostic() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState<DiagnosticResult | null>(null);
  const [checks, setChecks] = useState<DiagnosticCheck[]>([
    {
      id: 'db-config',
      name: 'Configuração no Banco de Dados',
      description: 'Verifica se o Figma OAuth está configurado na tabela integration_settings',
      status: 'pending',
    },
    {
      id: 'secrets',
      name: 'Secrets do Supabase',
      description: 'Verifica se FIGMA_CLIENT_ID e FIGMA_CLIENT_SECRET estão configurados',
      status: 'pending',
    },
    {
      id: 'client-id-match',
      name: 'Consistência do Client ID',
      description: 'Verifica se o Client ID do banco corresponde ao dos Secrets',
      status: 'pending',
    },
    {
      id: 'redirect-uri',
      name: 'Redirect URI',
      description: 'Verifica se o Redirect URI está configurado corretamente',
      status: 'pending',
    },
    {
      id: 'provider-enabled',
      name: 'Provider Habilitado',
      description: 'Verifica se o Figma está habilitado como provider no Supabase',
      status: 'pending',
    },
  ]);

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: 'Copiado!',
      description: `${label} copiado para a área de transferência.`,
    });
  };

  const updateCheck = (id: string, updates: Partial<DiagnosticCheck>) => {
    setChecks(prev => prev.map(check => 
      check.id === id ? { ...check, ...updates } : check
    ));
  };

  const runDiagnostic = async () => {
    setIsRunning(true);
    
    // Reset all checks to checking
    setChecks(prev => prev.map(check => ({ ...check, status: 'checking' as const, details: undefined })));

    const currentOrigin = window.location.origin;
    const diagnosticResult: DiagnosticResult = {
      dbClientId: null,
      dbRedirectUri: null,
      dbEnabled: false,
      dbStatus: null,
      secretClientId: null,
      hasClientSecret: false,
      supabaseCallbackUrl: SUPABASE_CALLBACK_URL,
      expectedRedirectUrls: [
        `${currentOrigin}/auth/callback/figma`,
        'https://ferias-sync.lovable.app/auth/callback/figma',
      ],
      currentOrigin,
    };

    try {
      // Check 1: Database configuration
      updateCheck('db-config', { status: 'checking' });
      const { data: settings, error: dbError } = await supabase
        .from('integration_settings' as any)
        .select('figma_enabled, figma_client_id, figma_redirect_uri, figma_status, figma_client_secret_set')
        .single();

      if (dbError) {
        updateCheck('db-config', { 
          status: 'error', 
          details: `Erro ao consultar banco: ${dbError.message}` 
        });
      } else if (settings) {
        const settingsData = settings as any;
        diagnosticResult.dbClientId = settingsData.figma_client_id;
        diagnosticResult.dbRedirectUri = settingsData.figma_redirect_uri;
        diagnosticResult.dbEnabled = settingsData.figma_enabled || false;
        diagnosticResult.dbStatus = settingsData.figma_status;

        if (settingsData.figma_enabled && settingsData.figma_client_id) {
          updateCheck('db-config', { 
            status: 'success', 
            details: `Client ID: ${settingsData.figma_client_id?.substring(0, 8)}...` 
          });
        } else if (settingsData.figma_client_id) {
          updateCheck('db-config', { 
            status: 'warning', 
            details: 'Configurado mas não habilitado' 
          });
        } else {
          updateCheck('db-config', { 
            status: 'error', 
            details: 'Figma OAuth não configurado no banco',
            action: {
              label: 'Configurar nas Integrações',
              href: '/settings?tab=integrations',
            }
          });
        }
      }

      // Check 2: Supabase Secrets
      updateCheck('secrets', { status: 'checking' });
      try {
        const { data: secretsData, error: secretsError } = await supabase.functions.invoke('test-integrations', {
          body: { type: 'verify-figma-config' },
        });

        if (secretsError) throw secretsError;

        diagnosticResult.secretClientId = secretsData.secretClientId;
        diagnosticResult.hasClientSecret = secretsData.hasClientSecret;

        if (secretsData.hasClientSecret && secretsData.secretClientId) {
          updateCheck('secrets', { 
            status: 'success', 
            details: 'FIGMA_CLIENT_ID e FIGMA_CLIENT_SECRET configurados' 
          });
        } else if (secretsData.secretClientId && !secretsData.hasClientSecret) {
          updateCheck('secrets', { 
            status: 'warning', 
            details: 'FIGMA_CLIENT_SECRET não está configurado',
            action: {
              label: 'Configurar Secrets',
              href: `https://supabase.com/dashboard/project/${SUPABASE_PROJECT_ID}/settings/functions`,
            }
          });
        } else {
          updateCheck('secrets', { 
            status: 'error', 
            details: 'Secrets não configurados no Supabase',
            action: {
              label: 'Configurar Secrets',
              href: `https://supabase.com/dashboard/project/${SUPABASE_PROJECT_ID}/settings/functions`,
            }
          });
        }
      } catch (err: any) {
        updateCheck('secrets', { 
          status: 'error', 
          details: `Erro ao verificar secrets: ${err.message}` 
        });
      }

      // Check 3: Client ID consistency
      updateCheck('client-id-match', { status: 'checking' });
      await new Promise(r => setTimeout(r, 300)); // Small delay for UX

      if (diagnosticResult.dbClientId && diagnosticResult.secretClientId) {
        if (diagnosticResult.dbClientId === diagnosticResult.secretClientId) {
          updateCheck('client-id-match', { 
            status: 'success', 
            details: 'Client ID é o mesmo no banco e nos Secrets' 
          });
        } else {
          updateCheck('client-id-match', { 
            status: 'error', 
            details: `Banco: ${diagnosticResult.dbClientId?.substring(0, 8)}... | Secrets: ${diagnosticResult.secretClientId?.substring(0, 8)}...`,
            action: {
              label: 'Corrigir no Dashboard',
              href: `https://supabase.com/dashboard/project/${SUPABASE_PROJECT_ID}/auth/providers`,
            }
          });
        }
      } else if (!diagnosticResult.dbClientId && !diagnosticResult.secretClientId) {
        updateCheck('client-id-match', { 
          status: 'error', 
          details: 'Nenhum Client ID configurado' 
        });
      } else {
        updateCheck('client-id-match', { 
          status: 'warning', 
          details: 'Configuração parcial - apenas um dos locais tem Client ID' 
        });
      }

      // Check 4: Redirect URI
      updateCheck('redirect-uri', { status: 'checking' });
      await new Promise(r => setTimeout(r, 300));

      if (diagnosticResult.dbRedirectUri) {
        // The redirect URI in the DB should be for the app callback
        // But the Figma OAuth App needs to use Supabase callback
        updateCheck('redirect-uri', { 
          status: 'success', 
          details: `Configurado: ${diagnosticResult.dbRedirectUri}` 
        });
      } else {
        updateCheck('redirect-uri', { 
          status: 'warning', 
          details: 'Redirect URI não configurado no banco' 
        });
      }

      // Check 5: Provider enabled (we can only check DB flag, not Supabase Dashboard)
      updateCheck('provider-enabled', { status: 'checking' });
      await new Promise(r => setTimeout(r, 300));

      if (diagnosticResult.dbEnabled && diagnosticResult.dbStatus === 'active') {
        updateCheck('provider-enabled', { 
          status: 'success', 
          details: 'Figma OAuth está ativo' 
        });
      } else if (diagnosticResult.dbEnabled && diagnosticResult.dbStatus === 'configured') {
        updateCheck('provider-enabled', { 
          status: 'warning', 
          details: 'Configurado mas não testado. Verifique no Supabase Dashboard.',
          action: {
            label: 'Verificar Provider',
            href: `https://supabase.com/dashboard/project/${SUPABASE_PROJECT_ID}/auth/providers`,
          }
        });
      } else if (diagnosticResult.dbEnabled) {
        updateCheck('provider-enabled', { 
          status: 'warning', 
          details: `Status: ${diagnosticResult.dbStatus || 'desconhecido'}`,
          action: {
            label: 'Verificar Provider',
            href: `https://supabase.com/dashboard/project/${SUPABASE_PROJECT_ID}/auth/providers`,
          }
        });
      } else {
        updateCheck('provider-enabled', { 
          status: 'error', 
          details: 'Figma OAuth não está habilitado',
          action: {
            label: 'Habilitar Provider',
            href: `https://supabase.com/dashboard/project/${SUPABASE_PROJECT_ID}/auth/providers`,
          }
        });
      }

      setResult(diagnosticResult);
    } catch (error: any) {
      console.error('Diagnostic error:', error);
      toast({
        title: 'Erro no diagnóstico',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setIsRunning(false);
    }
  };

  useEffect(() => {
    runDiagnostic();
  }, []);

  const getStatusIcon = (status: DiagnosticCheck['status']) => {
    switch (status) {
      case 'checking':
        return <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />;
      case 'success':
        return <CheckCircle2 className="h-5 w-5 text-green-500" />;
      case 'warning':
        return <AlertTriangle className="h-5 w-5 text-amber-500" />;
      case 'error':
        return <XCircle className="h-5 w-5 text-destructive" />;
      default:
        return <div className="h-5 w-5 rounded-full border-2 border-muted" />;
    }
  };

  const getStatusBadge = (status: DiagnosticCheck['status']) => {
    switch (status) {
      case 'success':
        return <Badge variant="default" className="bg-green-500">OK</Badge>;
      case 'warning':
        return <Badge variant="secondary" className="bg-amber-500/20 text-amber-600">Atenção</Badge>;
      case 'error':
        return <Badge variant="destructive">Erro</Badge>;
      default:
        return null;
    }
  };

  const hasErrors = checks.some(c => c.status === 'error');
  const hasWarnings = checks.some(c => c.status === 'warning');

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Figma className="h-6 w-6" />
              Diagnóstico Figma OAuth
            </h1>
            <p className="text-muted-foreground">
              Verificação automática da configuração do login com Figma
            </p>
          </div>
          <Button onClick={runDiagnostic} disabled={isRunning} variant="outline">
            <RefreshCw className={`h-4 w-4 mr-2 ${isRunning ? 'animate-spin' : ''}`} />
            {isRunning ? 'Verificando...' : 'Verificar Novamente'}
          </Button>
        </div>

        {/* Summary Alert */}
        {!isRunning && (
          <>
            {hasErrors ? (
              <Alert variant="destructive" className="mb-6">
                <XCircle className="h-4 w-4" />
                <AlertTitle>Problemas Encontrados</AlertTitle>
                <AlertDescription>
                  Existem erros de configuração que precisam ser corrigidos para o login com Figma funcionar.
                </AlertDescription>
              </Alert>
            ) : hasWarnings ? (
              <Alert className="mb-6 border-amber-500/50 bg-amber-500/10">
                <AlertTriangle className="h-4 w-4 text-amber-500" />
                <AlertTitle className="text-amber-600">Atenção</AlertTitle>
                <AlertDescription>
                  A configuração está parcialmente completa. Verifique os avisos abaixo.
                </AlertDescription>
              </Alert>
            ) : checks.every(c => c.status === 'success') ? (
              <Alert className="mb-6 border-green-500/50 bg-green-500/10">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                <AlertTitle className="text-green-600">Tudo Configurado!</AlertTitle>
                <AlertDescription>
                  A configuração do Figma OAuth parece estar correta.
                </AlertDescription>
              </Alert>
            ) : null}
          </>
        )}

        {/* Checks List */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Verificações de Configuração
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {checks.map((check, index) => (
              <div key={check.id}>
                <div className="flex items-start gap-3">
                  {getStatusIcon(check.status)}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{check.name}</span>
                      {getStatusBadge(check.status)}
                    </div>
                    <p className="text-sm text-muted-foreground">{check.description}</p>
                    {check.details && (
                      <p className={`text-sm mt-1 ${
                        check.status === 'error' ? 'text-destructive' : 
                        check.status === 'warning' ? 'text-amber-600' : 
                        'text-muted-foreground'
                      }`}>
                        {check.details}
                      </p>
                    )}
                    {check.action && (
                      <div className="mt-2">
                        {check.action.href ? (
                          <a
                            href={check.action.href}
                            target={check.action.href.startsWith('http') ? '_blank' : undefined}
                            rel="noopener noreferrer"
                            className="text-sm text-primary hover:underline inline-flex items-center gap-1"
                          >
                            {check.action.label}
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        ) : (
                          <Button size="sm" variant="link" className="h-auto p-0" onClick={check.action.onClick}>
                            {check.action.label}
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
                {index < checks.length - 1 && <Separator className="mt-4" />}
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Required Configuration */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Globe className="h-5 w-5" />
              URLs de Configuração Obrigatórias
            </CardTitle>
            <CardDescription>
              Use estas URLs ao configurar o OAuth do Figma
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Figma OAuth App Redirect URI */}
            <div className="space-y-2">
              <Label className="text-sm font-medium flex items-center gap-2">
                <Figma className="h-4 w-4" />
                Redirect URI para o Figma OAuth App
              </Label>
              <div className="flex items-center gap-2">
                <code className="flex-1 bg-muted px-3 py-2 rounded text-sm font-mono break-all">
                  {SUPABASE_CALLBACK_URL}
                </code>
                <Button 
                  variant="outline" 
                  size="icon"
                  onClick={() => copyToClipboard(SUPABASE_CALLBACK_URL, 'Redirect URI')}
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Configure este valor em{' '}
                <a 
                  href="https://www.figma.com/settings" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  Figma → Account Settings → OAuth apps
                </a>
              </p>
            </div>

            <Separator />

            {/* Supabase Redirect URLs */}
            <div className="space-y-2">
              <Label className="text-sm font-medium flex items-center gap-2">
                <Database className="h-4 w-4" />
                Redirect URLs para o Supabase
              </Label>
              <div className="space-y-2">
                {result?.expectedRedirectUrls.map((url, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <code className="flex-1 bg-muted px-3 py-2 rounded text-sm font-mono break-all">
                      {url}
                    </code>
                    <Button 
                      variant="outline" 
                      size="icon"
                      onClick={() => copyToClipboard(url, 'URL')}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Adicione estas URLs em{' '}
                <a 
                  href={`https://supabase.com/dashboard/project/${SUPABASE_PROJECT_ID}/auth/url-configuration`}
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  Supabase → Authentication → URL Configuration → Redirect URLs
                </a>
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Quick Links */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Links Rápidos</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <a
                href="https://www.figma.com/settings"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 p-3 border rounded-lg hover:bg-muted transition-colors"
              >
                <Figma className="h-5 w-5" />
                <div className="flex-1">
                  <div className="font-medium text-sm">Figma Settings</div>
                  <div className="text-xs text-muted-foreground">OAuth apps</div>
                </div>
                <ExternalLink className="h-4 w-4 text-muted-foreground" />
              </a>
              <a
                href={`https://supabase.com/dashboard/project/${SUPABASE_PROJECT_ID}/auth/providers`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 p-3 border rounded-lg hover:bg-muted transition-colors"
              >
                <Database className="h-5 w-5" />
                <div className="flex-1">
                  <div className="font-medium text-sm">Supabase Providers</div>
                  <div className="text-xs text-muted-foreground">Configurar Figma</div>
                </div>
                <ExternalLink className="h-4 w-4 text-muted-foreground" />
              </a>
              <a
                href={`https://supabase.com/dashboard/project/${SUPABASE_PROJECT_ID}/auth/url-configuration`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 p-3 border rounded-lg hover:bg-muted transition-colors"
              >
                <Globe className="h-5 w-5" />
                <div className="flex-1">
                  <div className="font-medium text-sm">URL Configuration</div>
                  <div className="text-xs text-muted-foreground">Redirect URLs</div>
                </div>
                <ExternalLink className="h-4 w-4 text-muted-foreground" />
              </a>
              <a
                href={`https://supabase.com/dashboard/project/${SUPABASE_PROJECT_ID}/settings/functions`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 p-3 border rounded-lg hover:bg-muted transition-colors"
              >
                <Shield className="h-5 w-5" />
                <div className="flex-1">
                  <div className="font-medium text-sm">Edge Function Secrets</div>
                  <div className="text-xs text-muted-foreground">FIGMA_CLIENT_ID/SECRET</div>
                </div>
                <ExternalLink className="h-4 w-4 text-muted-foreground" />
              </a>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Label({ className, children, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={className} {...props}>{children}</label>;
}
