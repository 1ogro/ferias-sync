import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ExternalLink, Figma, Info, CheckCircle2, AlertTriangle, Loader2 } from "lucide-react";

interface FigmaSetupProps {
  onSave: (clientId: string, clientSecret: string, redirectUri: string) => void;
  isSaving?: boolean;
  initialClientId?: string;
  initialRedirectUri?: string;
  onVerifyConfig?: () => Promise<{ secretClientId: string | null; hasClientSecret: boolean }>;
  isVerifying?: boolean;
}

interface ConfigStatus {
  checked: boolean;
  secretClientId: string | null;
  hasClientSecret: boolean;
  isConsistent: boolean;
  error?: string;
}

export function FigmaSetup({ 
  onSave, 
  isSaving, 
  initialClientId = '', 
  initialRedirectUri = '',
  onVerifyConfig,
  isVerifying = false,
}: FigmaSetupProps) {
  const [clientId, setClientId] = useState(initialClientId);
  const [redirectUri, setRedirectUri] = useState(initialRedirectUri || `${window.location.origin}/auth/callback/figma`);
  const [configStatus, setConfigStatus] = useState<ConfigStatus>({
    checked: false,
    secretClientId: null,
    hasClientSecret: false,
    isConsistent: true,
  });

  // Verify config on mount
  useEffect(() => {
    if (onVerifyConfig) {
      onVerifyConfig()
        .then((result) => {
          const isConsistent = !initialClientId || !result.secretClientId || result.secretClientId === initialClientId;
          setConfigStatus({
            checked: true,
            secretClientId: result.secretClientId,
            hasClientSecret: result.hasClientSecret,
            isConsistent,
          });
        })
        .catch((err) => {
          console.error('Error verifying Figma config:', err);
          setConfigStatus({
            checked: true,
            secretClientId: null,
            hasClientSecret: false,
            isConsistent: true,
            error: err.message,
          });
        });
    }
  }, [onVerifyConfig, initialClientId]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (clientId && redirectUri) {
      // Pass empty string for clientSecret since it's now configured via Supabase secrets
      onSave(clientId, '', redirectUri);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Verification Status */}
      {isVerifying && (
        <Alert className="border-muted">
          <Loader2 className="h-4 w-4 animate-spin" />
          <AlertDescription className="text-sm">
            Verificando consistência da configuração...
          </AlertDescription>
        </Alert>
      )}

      {/* Inconsistency Alert */}
      {configStatus.checked && !configStatus.isConsistent && configStatus.secretClientId && (
        <Alert className="border-amber-500/50 bg-amber-500/10">
          <AlertTriangle className="h-4 w-4 text-amber-500" />
          <AlertDescription className="text-sm">
            <strong className="text-amber-600">⚠️ Inconsistência detectada!</strong>
            <p className="mt-1">
              O Client ID salvo no banco (<code className="bg-muted px-1 rounded text-xs">{initialClientId}</code>) 
              é diferente do configurado nos Secrets do Supabase 
              (<code className="bg-muted px-1 rounded text-xs">{configStatus.secretClientId}</code>).
            </p>
            <p className="mt-2 text-muted-foreground">
              Isso pode causar o erro <em>"OAuth app with client id doesn't exist"</em>. Para corrigir:
            </p>
            <ol className="list-decimal list-inside mt-1 space-y-1 text-xs text-muted-foreground">
              <li>Verifique qual é o Client ID correto no <a 
                href="https://www.figma.com/settings"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >Figma OAuth app</a></li>
              <li>Atualize o campo abaixo para corresponder ao valor correto</li>
              <li>Ou atualize o secret FIGMA_CLIENT_ID e o provider Figma no <a 
                href="https://supabase.com/dashboard/project/uhphxyhffpbnmsrlggbe/auth/providers"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >Supabase Dashboard</a></li>
            </ol>
          </AlertDescription>
        </Alert>
      )}

      {/* Consistent Config Alert */}
      {configStatus.checked && configStatus.isConsistent && configStatus.hasClientSecret && !configStatus.error && (
        <Alert className="border-green-500/50 bg-green-500/10">
          <CheckCircle2 className="h-4 w-4 text-green-500" />
          <AlertDescription className="text-sm">
            <strong>✓ Configuração consistente!</strong> O Client ID está sincronizado entre o banco e os secrets.
          </AlertDescription>
        </Alert>
      )}

      {/* Missing Secrets Alert */}
      {configStatus.checked && !configStatus.hasClientSecret && !configStatus.error && (
        <Alert className="border-amber-500/50 bg-amber-500/10">
          <AlertTriangle className="h-4 w-4 text-amber-500" />
          <AlertDescription className="text-sm">
            <strong>Secrets não configurados!</strong> Configure FIGMA_CLIENT_ID e FIGMA_CLIENT_SECRET nos{' '}
            <a 
              href="https://supabase.com/dashboard/project/uhphxyhffpbnmsrlggbe/settings/functions"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >Secrets do Supabase</a>.
          </AlertDescription>
        </Alert>
      )}

      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription>
          <div className="space-y-2 text-sm">
            <p className="font-semibold">Como configurar OAuth do Figma:</p>
            <ol className="list-decimal list-inside space-y-1 ml-2">
              <li>Acesse sua conta Figma e vá para <strong>Account Settings → OAuth apps</strong></li>
              <li>Clique em <strong>"Create a new OAuth app"</strong></li>
              <li>Configure o <strong>Redirect URI</strong> com o valor abaixo</li>
              <li>Copie o <strong>Client ID</strong> e preencha abaixo</li>
              <li>Configure o Figma como provider no <strong>Supabase Dashboard</strong></li>
            </ol>
            <a 
              href="https://www.figma.com/developers/api#oauth2" 
              target="_blank" 
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-primary hover:underline mt-2"
            >
              <Figma className="h-3 w-3" />
              Documentação do Figma OAuth
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </AlertDescription>
      </Alert>

      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="redirectUri">Redirect URI</Label>
          <Input
            id="redirectUri"
            value={redirectUri}
            onChange={(e) => setRedirectUri(e.target.value)}
            placeholder="https://seu-dominio.com/"
            required
          />
          <p className="text-xs text-muted-foreground">
            Cole este valor no campo "Redirect URI" ao criar o OAuth app no Figma
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="clientId">Client ID</Label>
          <Input
            id="clientId"
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            placeholder="figma-client-id-aqui"
            required
            className={!configStatus.isConsistent ? 'border-amber-500' : ''}
          />
          <p className="text-xs text-muted-foreground">
            Client ID do seu OAuth app no Figma (salvo no banco para referência)
          </p>
        </div>
      </div>

      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription className="text-xs">
          <strong>Importante:</strong> Configure também o Figma como provider no Supabase Dashboard:
          <br />
          <a 
            href="https://supabase.com/dashboard/project/uhphxyhffpbnmsrlggbe/auth/providers"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-primary hover:underline mt-1"
          >
            Authentication → Providers → Figma
            <ExternalLink className="h-3 w-3" />
          </a>
        </AlertDescription>
      </Alert>

      <Button type="submit" disabled={isSaving || !clientId || !redirectUri} className="w-full">
        {isSaving ? 'Salvando...' : 'Salvar Configuração'}
      </Button>
    </form>
  );
}
