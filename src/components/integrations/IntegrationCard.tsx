import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Settings, TestTube } from "lucide-react";

interface IntegrationCardProps {
  title: string;
  description: string;
  status: 'not_configured' | 'configured' | 'active' | 'error';
  lastTest?: string | null;
  errorMessage?: string | null;
  onConfigure: () => void;
  onTest: () => void;
  isTesting?: boolean;
  icon?: React.ReactNode;
}

export function IntegrationCard({
  title,
  description,
  status,
  lastTest,
  errorMessage,
  onConfigure,
  onTest,
  isTesting,
  icon,
}: IntegrationCardProps) {
  const getStatusBadge = () => {
    switch (status) {
      case 'not_configured':
        return <Badge variant="outline">Não configurado</Badge>;
      case 'configured':
        return <Badge variant="secondary">Configurado</Badge>;
      case 'active':
        return <Badge className="bg-green-600">Ativo</Badge>;
      case 'error':
        return <Badge variant="destructive">Erro</Badge>;
    }
  };

  const canTest = status !== 'not_configured';

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            {icon && <div className="text-primary">{icon}</div>}
            <div>
              <CardTitle>{title}</CardTitle>
              <CardDescription className="mt-1">{description}</CardDescription>
            </div>
          </div>
          {getStatusBadge()}
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {errorMessage && (
            <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-md">
              <strong>Erro:</strong> {errorMessage}
            </div>
          )}

          {lastTest && (
            <div className="text-sm text-muted-foreground">
              Último teste: {new Date(lastTest).toLocaleString('pt-BR')}
            </div>
          )}

          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={onConfigure}
              className="flex-1"
            >
              <Settings className="w-4 h-4 mr-2" />
              Configurar
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={onTest}
              disabled={!canTest || isTesting}
              className="flex-1"
            >
              <TestTube className="w-4 h-4 mr-2" />
              {isTesting ? 'Testando...' : 'Testar'}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
