import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ExternalLink, Figma, Info, CheckCircle2 } from "lucide-react";

interface FigmaSetupProps {
  onSave: (clientId: string, clientSecret: string, redirectUri: string) => void;
  isSaving?: boolean;
  initialClientId?: string;
  initialRedirectUri?: string;
}

export function FigmaSetup({ onSave, isSaving, initialClientId = '', initialRedirectUri = '' }: FigmaSetupProps) {
  const [clientId, setClientId] = useState(initialClientId);
  const [redirectUri, setRedirectUri] = useState(initialRedirectUri || `${window.location.origin}/auth/callback/figma`);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (clientId && redirectUri) {
      // Pass empty string for clientSecret since it's now configured via Supabase secrets
      onSave(clientId, '', redirectUri);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <Alert className="border-green-500/50 bg-green-500/10">
        <CheckCircle2 className="h-4 w-4 text-green-500" />
        <AlertDescription className="text-sm">
          <strong>Secrets configurados!</strong> FIGMA_CLIENT_ID e FIGMA_CLIENT_SECRET já estão salvos nos secrets do Supabase.
        </AlertDescription>
      </Alert>

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
