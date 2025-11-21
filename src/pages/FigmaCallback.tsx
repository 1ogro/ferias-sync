import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, CheckCircle2, XCircle } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

export default function FigmaCallback() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState<string>('');

  useEffect(() => {
    const handleCallback = async () => {
      try {
        // Get the URL hash parameters
        const hashParams = new URLSearchParams(window.location.hash.substring(1));
        const error = hashParams.get('error');
        const errorDescription = hashParams.get('error_description');

        if (error) {
          setStatus('error');
          setErrorMessage(errorDescription || 'Erro ao autenticar com Figma');
          return;
        }

        // Exchange the code for a session
        const { data, error: authError } = await supabase.auth.getSession();

        if (authError) {
          setStatus('error');
          setErrorMessage(authError.message);
          return;
        }

        if (data.session) {
          setStatus('success');
          // Redirect to home after 2 seconds
          setTimeout(() => {
            navigate('/');
          }, 2000);
        } else {
          setStatus('error');
          setErrorMessage('Sessão não encontrada. Tente novamente.');
        }
      } catch (err) {
        setStatus('error');
        setErrorMessage('Erro inesperado ao processar autenticação');
        console.error('Figma callback error:', err);
      }
    };

    handleCallback();
  }, [navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle>Autenticação Figma</CardTitle>
          <CardDescription>
            {status === 'loading' && 'Processando sua autenticação...'}
            {status === 'success' && 'Autenticação realizada com sucesso!'}
            {status === 'error' && 'Erro na autenticação'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {status === 'loading' && (
            <div className="flex flex-col items-center gap-4">
              <Loader2 className="h-12 w-12 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">
                Aguarde enquanto processamos seu login...
              </p>
            </div>
          )}

          {status === 'success' && (
            <Alert className="border-green-500 bg-green-50 dark:bg-green-950">
              <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
              <AlertTitle className="text-green-800 dark:text-green-300">
                Sucesso!
              </AlertTitle>
              <AlertDescription className="text-green-700 dark:text-green-400">
                Você será redirecionado em instantes...
              </AlertDescription>
            </Alert>
          )}

          {status === 'error' && (
            <div className="space-y-4">
              <Alert variant="destructive">
                <XCircle className="h-4 w-4" />
                <AlertTitle>Erro na Autenticação</AlertTitle>
                <AlertDescription>{errorMessage}</AlertDescription>
              </Alert>
              <Button
                onClick={() => navigate('/auth')}
                className="w-full"
                variant="outline"
              >
                Voltar para Login
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
