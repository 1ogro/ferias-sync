import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, CheckCircle2, XCircle, AlertTriangle, ExternalLink, Figma, Stethoscope } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

interface FigmaErrorDetails {
  title: string;
  description: string;
  isRedirectError: boolean;
  steps: string[];
  links: {
    figma: string;
    supabase: string;
  };
}

const getFigmaErrorDetails = (errorCode: string, errorDescription: string): FigmaErrorDetails | null => {
  const lowerError = (errorCode + ' ' + errorDescription).toLowerCase();
  
  if (lowerError.includes('redirect') && (lowerError.includes('invalid') || lowerError.includes('mismatch'))) {
    return {
      title: 'Erro de Configuração de Redirect URI',
      description: 'O URI de redirecionamento configurado não corresponde ao esperado pelo Figma.',
      isRedirectError: true,
      steps: [
        'Acesse as configurações do seu OAuth App no Figma (Account Settings → OAuth apps)',
        'Configure o Redirect URI exatamente como: https://uhphxyhffpbnmsrlggbe.supabase.co/auth/v1/callback',
        'Verifique as configurações do provider Figma no Supabase Dashboard',
        'Em Authentication → URL Configuration, adicione as URLs de redirect permitidas'
      ],
      links: {
        figma: 'https://www.figma.com/settings',
        supabase: 'https://supabase.com/dashboard/project/uhphxyhffpbnmsrlggbe/auth/providers'
      }
    };
  }
  
  if (lowerError.includes('client_id') || lowerError.includes("doesn't exist") || lowerError.includes('client id')) {
    return {
      title: 'Erro de Client ID',
      description: 'O Client ID configurado não foi encontrado ou é inválido no Figma.',
      isRedirectError: false,
      steps: [
        'Verifique se o Client ID está correto no Supabase Dashboard (Authentication → Providers → Figma)',
        'Compare com o Client ID do seu OAuth app no Figma (Account Settings → OAuth apps)',
        'Certifique-se de que o OAuth app está ativo no Figma'
      ],
      links: {
        figma: 'https://www.figma.com/settings',
        supabase: 'https://supabase.com/dashboard/project/uhphxyhffpbnmsrlggbe/auth/providers'
      }
    };
  }
  
  if (lowerError.includes('provider') || lowerError.includes('not enabled') || lowerError.includes('disabled')) {
    return {
      title: 'Provider Figma Desabilitado',
      description: 'O provider de autenticação Figma não está habilitado no Supabase.',
      isRedirectError: false,
      steps: [
        'Acesse o Supabase Dashboard → Authentication → Providers',
        'Localize o provider Figma e habilite-o',
        'Configure o Client ID e Client Secret obtidos do seu OAuth app no Figma'
      ],
      links: {
        figma: 'https://www.figma.com/settings',
        supabase: 'https://supabase.com/dashboard/project/uhphxyhffpbnmsrlggbe/auth/providers'
      }
    };
  }
  
  return null;
};

export default function FigmaCallback() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [errorDetails, setErrorDetails] = useState<FigmaErrorDetails | null>(null);

  useEffect(() => {
    const handleCallback = async () => {
      try {
        // Get the URL hash parameters
        const hashParams = new URLSearchParams(window.location.hash.substring(1));
        const queryParams = new URLSearchParams(window.location.search);
        
        // Check for errors in both hash and query params
        const error = hashParams.get('error') || queryParams.get('error');
        const errorDescription = hashParams.get('error_description') || queryParams.get('error_description') || '';

        if (error) {
          console.error('Figma OAuth error:', { error, errorDescription });
          setStatus('error');
          setErrorMessage(errorDescription || `Erro ao autenticar com Figma: ${error}`);
          setErrorDetails(getFigmaErrorDetails(error, errorDescription));
          return;
        }

        // Exchange the code for a session
        const { data, error: authError } = await supabase.auth.getSession();

        if (authError) {
          console.error('Session error:', authError);
          setStatus('error');
          setErrorMessage(authError.message);
          setErrorDetails(getFigmaErrorDetails('', authError.message));
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
        console.error('Figma callback error:', err);
        setStatus('error');
        setErrorMessage('Erro inesperado ao processar autenticação');
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
              
              {errorDetails && (
                <Alert className="border-amber-500/50 bg-amber-50 dark:bg-amber-950/20">
                  <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                  <AlertTitle className="text-amber-800 dark:text-amber-300">
                    {errorDetails.title}
                  </AlertTitle>
                  <AlertDescription className="text-amber-700 dark:text-amber-400">
                    <p className="mb-3">{errorDetails.description}</p>
                    
                    <div className="mb-3">
                      <p className="font-medium text-sm mb-2">Como corrigir:</p>
                      <ol className="list-decimal list-inside text-xs space-y-1.5">
                        {errorDetails.steps.map((step, i) => (
                          <li key={i} className="leading-relaxed">{step}</li>
                        ))}
                      </ol>
                    </div>
                    
                    {errorDetails.isRedirectError && (
                      <div className="bg-amber-100 dark:bg-amber-900/30 p-3 rounded-md mb-3">
                        <p className="text-xs font-medium mb-1">Redirect URI esperado:</p>
                        <code className="text-xs break-all bg-amber-200/50 dark:bg-amber-800/50 px-1.5 py-0.5 rounded">
                          https://uhphxyhffpbnmsrlggbe.supabase.co/auth/v1/callback
                        </code>
                      </div>
                    )}
                    
                    <div className="flex flex-wrap gap-2 mt-3">
                      <a 
                        href={errorDetails.links.figma}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline bg-primary/10 px-2 py-1 rounded"
                      >
                        <Figma className="h-3 w-3" />
                        Configurações Figma
                      </a>
                      <a 
                        href={errorDetails.links.supabase}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline bg-primary/10 px-2 py-1 rounded"
                      >
                        <ExternalLink className="h-3 w-3" />
                        Supabase Providers
                      </a>
                    </div>
                  </AlertDescription>
                </Alert>
              )}
              
              <div className="flex flex-col gap-2">
                <Button asChild variant="default" className="w-full">
                  <Link to="/figma-diagnostic">
                    <Stethoscope className="h-4 w-4 mr-2" />
                    Executar Diagnóstico Completo
                  </Link>
                </Button>
                <Button
                  onClick={() => navigate('/auth')}
                  className="w-full"
                  variant="outline"
                >
                  Voltar para Login
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
