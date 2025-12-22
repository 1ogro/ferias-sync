import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Info } from 'lucide-react';

interface SlackSetupProps {
  onSave: (botToken: string, channelId: string) => void;
  isSaving?: boolean;
}

export function SlackSetup({ onSave, isSaving }: SlackSetupProps) {
  const [botToken, setBotToken] = useState('');
  const [channelId, setChannelId] = useState('');
  const [errors, setErrors] = useState<{ botToken?: string; channelId?: string }>({});

  const validate = () => {
    const newErrors: { botToken?: string; channelId?: string } = {};

    if (!botToken) {
      newErrors.botToken = 'Token é obrigatório';
    } else if (!botToken.startsWith('xoxb-')) {
      newErrors.botToken = 'Token deve começar com xoxb-';
    }

    if (!channelId) {
      newErrors.channelId = 'ID do canal é obrigatório';
    } else if (!channelId.startsWith('C') && !channelId.startsWith('#')) {
      newErrors.channelId = 'ID do canal deve começar com C ou #';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (validate()) {
      onSave(botToken, channelId);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription className="space-y-2">
          <p>Para configurar o Slack, você precisa criar um Bot Token na sua workspace:</p>
          <ol className="list-decimal list-inside text-sm space-y-1">
            <li>Acesse <a href="https://api.slack.com/apps" target="_blank" rel="noopener noreferrer" className="underline">api.slack.com/apps</a></li>
            <li>Crie ou selecione seu app</li>
            <li>Vá em <strong>OAuth & Permissions</strong></li>
            <li>Em <strong>Bot Token Scopes</strong>, adicione: <code className="bg-muted px-1 rounded">chat:write</code>, <code className="bg-muted px-1 rounded">users:read</code>, <code className="bg-muted px-1 rounded">users:read.email</code></li>
            <li>Reinstale o app na workspace</li>
            <li>Copie o <strong>Bot User OAuth Token</strong> (xoxb-...)</li>
          </ol>
        </AlertDescription>
      </Alert>

      <div className="space-y-2">
        <Label htmlFor="bot-token">Bot Token *</Label>
        <Input
          id="bot-token"
          type="password"
          placeholder="xoxb-..."
          value={botToken}
          onChange={(e) => setBotToken(e.target.value)}
          className={errors.botToken ? 'border-destructive' : ''}
        />
        {errors.botToken && (
          <p className="text-sm text-destructive">{errors.botToken}</p>
        )}
        <p className="text-sm text-muted-foreground">
          Token de bot do Slack (começa com xoxb-)
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="channel-id">ID do Canal *</Label>
        <Input
          id="channel-id"
          placeholder="C01234567 ou #nome-do-canal"
          value={channelId}
          onChange={(e) => setChannelId(e.target.value)}
          className={errors.channelId ? 'border-destructive' : ''}
        />
        {errors.channelId && (
          <p className="text-sm text-destructive">{errors.channelId}</p>
        )}
        <p className="text-sm text-muted-foreground">
          ID do canal onde as notificações serão enviadas
        </p>
      </div>

      <Button type="submit" disabled={isSaving} className="w-full">
        {isSaving ? 'Salvando...' : 'Salvar Configuração'}
      </Button>
    </form>
  );
}
