import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ExternalLink, Figma, Info } from "lucide-react";

interface FigmaSetupProps {
  onSave: (clientId: string, clientSecret: string, redirectUri: string) => void;
  isSaving?: boolean;
  initialClientId?: string;
  initialRedirectUri?: string;
}

export function FigmaSetup({ onSave, isSaving, initialClientId = '', initialRedirectUri = '' }: FigmaSetupProps) {
  const [clientId, setClientId] = useState(initialClientId);
  const [clientSecret, setClientSecret] = useState('');
  const [redirectUri, setRedirectUri] = useState(initialRedirectUri || `${window.location.origin}/auth/callback/figma`);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (clientId && clientSecret && redirectUri) {
      onSave(clientId, clientSecret, redirectUri);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription>
          <div className="space-y-2 text-sm">
            <p className="font-semibold">Como configurar OAuth do Figma:</p>
            <ol className="list-decimal list-inside space-y-1 ml-2">
              <li>Acesse sua conta Figma e vá para <strong>Account Settings → OAuth apps</strong></li>
              <li>Clique em <strong>"Create a new OAuth app"</strong></li>
              <li>Configure o <strong>Redirect URI</strong> com o valor abaixo</li>
              <li>Copie o <strong>Client ID</strong> e <strong>Client Secret</strong></li>
              <li>Cole as credenciais nos campos abaixo e salve</li>
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
            Client ID do seu OAuth app no Figma (valor público)
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="clientSecret">Client Secret</Label>
          <Input
            id="clientSecret"
            type="password"
            value={clientSecret}
            onChange={(e) => setClientSecret(e.target.value)}
            placeholder="figma-client-secret-aqui"
            required
          />
          <p className="text-xs text-muted-foreground">
            Client Secret do seu OAuth app no Figma (mantido seguro)
          </p>
        </div>
      </div>

      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription className="text-xs">
          <strong>Importante:</strong> Após salvar aqui, você também precisa configurar o Figma como provider no Supabase Dashboard:
          <br />
          <strong>Authentication → Providers → Figma</strong>
          <br />
          Use o mesmo Client ID e Client Secret.
        </AlertDescription>
      </Alert>

      <Button type="submit" disabled={isSaving || !clientId || !clientSecret || !redirectUri} className="w-full">
        {isSaving ? 'Salvando...' : 'Salvar Configuração'}
      </Button>
    </form>
  );
}
