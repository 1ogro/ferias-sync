import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';

import { supabase } from '@/integrations/supabase/client';
import { LogIn, UserPlus, Calendar, Figma } from 'lucide-react';

interface PersonOption {
  id: string;
  nome: string;
  email: string;
}

export default function Auth() {
  const navigate = useNavigate();
  const { signIn, signUp, signInWithFigma, user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [people, setPeople] = useState<PersonOption[]>([]);
  const [isFigmaEnabled, setIsFigmaEnabled] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const { data, error } = await supabase.rpc('get_figma_login_status' as any);
        if (error) {
          console.warn('Figma login status check failed:', error);
          return;
        }
        const row = Array.isArray(data) ? data[0] : data;
        if (row?.figma_enabled === true && (row?.figma_status === 'active' || row?.figma_status === 'configured')) {
          setIsFigmaEnabled(true);
        }
      } catch (err) {
        console.warn('Figma login status check error:', err);
      }
    })();
  }, []);



  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);

  const [loginData, setLoginData] = useState({
    email: '',
    password: '',
  });

  const [signupData, setSignupData] = useState({
    email: '',
    password: '',
    confirmPassword: '',
    personId: '',
  });

  useEffect(() => {
    if (user) {
      // Honor OAuth consent redirect if present (set by /oauth/consent)
      let next: string | null = null;
      try { next = sessionStorage.getItem('oauth_consent_next'); } catch { /* noop */ }
      if (next && next.startsWith('/')) {
        try { sessionStorage.removeItem('oauth_consent_next'); } catch { /* noop */ }
        window.location.href = next;
        return;
      }
      navigate('/');
    }
  }, [user, navigate]);

  useEffect(() => {
    fetchPeople();
  }, []);

  const fetchPeople = async () => {
    try {
      console.log('Fetching people from database...');
      const { data, error } = await supabase
        .rpc('get_active_people_for_signup');
      
      console.log('Database response:', { data, error });
      
      if (error) {
        console.error('Supabase error:', error);
        toast({
          title: 'Erro ao carregar dados',
          description: 'Não foi possível carregar a lista de pessoas.',
          variant: 'destructive',
        });
        return;
      }
      
      if (data && data.length > 0) {
        console.log('Setting people data:', data);
        setPeople(data);
      } else {
        console.log('No people data found');
      }
    } catch (error) {
      console.error('Error fetching people:', error);
      toast({
        title: 'Erro ao carregar dados',
        description: 'Ocorreu um erro inesperado ao carregar a lista.',
        variant: 'destructive',
      });
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { error } = await signIn(loginData.email, loginData.password);
      
      if (error) {
        toast({
          title: 'Erro no login',
          description: error.message,
          variant: 'destructive',
        });
      } else {
        toast({
          title: 'Login realizado com sucesso!',
          description: 'Redirecionando...',
        });
        // Fire-and-forget Slack notification
        supabase.functions.invoke('slack-notification', {
          body: { type: 'USER_LOGIN', email: loginData.email },
        }).catch(err => console.warn('Slack notification failed:', err));
        navigate('/');
      }
    } catch (error) {
      toast({
        title: 'Erro no login',
        description: 'Ocorreu um erro inesperado.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (signupData.password !== signupData.confirmPassword) {
      toast({
        title: 'Erro no cadastro',
        description: 'As senhas não coincidem.',
        variant: 'destructive',
      });
      return;
    }

    if (!signupData.personId) {
      toast({
        title: 'Erro no cadastro',
        description: 'Selecione seu nome na lista.',
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);

    try {
      const { error } = await signUp(signupData.email, signupData.password, signupData.personId);
      
      if (error) {
        toast({
          title: 'Erro no cadastro',
          description: error.message,
          variant: 'destructive',
        });
      } else {
        const selectedPerson = people.find(p => p.id === signupData.personId);
        toast({
          title: 'Cadastro realizado com sucesso!',
          description: 'Verifique seu email para confirmar a conta.',
        });
        // Fire-and-forget Slack notification
        supabase.functions.invoke('slack-notification', {
          body: { type: 'USER_SIGNUP', email: signupData.email, personName: selectedPerson?.nome },
        }).catch(err => console.warn('Slack notification failed:', err));
      }
    } catch (error) {
      toast({
        title: 'Erro no cadastro',
        description: 'Ocorreu um erro inesperado.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleFigmaLogin = async () => {
    setLoading(true);
    try {
      const { error } = await signInWithFigma();
      
      if (error) {
        const errorMsg = error.message?.toLowerCase() || '';
        
        let description = error.message;
        
        if (errorMsg.includes('redirect') || errorMsg.includes('uri')) {
          description = 'Erro de configuração de Redirect URI. Verifique se o URI configurado no Figma OAuth App corresponde ao esperado pelo Supabase (deve ser https://uhphxyhffpbnmsrlggbe.supabase.co/auth/v1/callback).';
        } else if (errorMsg.includes('client_id') || errorMsg.includes("doesn't exist") || errorMsg.includes('client id')) {
          description = 'Client ID inválido ou não encontrado. Verifique as configurações do OAuth app no Figma e compare com o configurado no Supabase.';
        } else if (errorMsg.includes('provider') || errorMsg.includes('not enabled') || errorMsg.includes('disabled')) {
          description = 'O provider Figma não está habilitado. Configure-o no Supabase Dashboard em Authentication → Providers.';
        }
        
        toast({
          title: 'Erro no login com Figma',
          description,
          variant: 'destructive',
        });
      } else {
        // Fire-and-forget Slack notification
        supabase.functions.invoke('slack-notification', {
          body: { type: 'USER_FIGMA_LOGIN', email: user?.email || '' },
        }).catch(err => console.warn('Slack notification failed:', err));
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 to-primary/10 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <div className="p-3 bg-primary/10 rounded-full">
              <Calendar className="w-8 h-8 text-primary" />
            </div>
          </div>
          <h1 className="text-3xl font-bold mb-2">Férias UXTD</h1>
          <p className="text-muted-foreground">
            Sistema de controle de férias e day offs
          </p>
        </div>

        <Alert className="mb-4">
          <AlertDescription>
            <strong>Primeira vez?</strong> Crie uma conta selecionando seu nome da lista e definindo uma senha.
          </AlertDescription>
        </Alert>

        <Tabs defaultValue="login" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="login">Entrar</TabsTrigger>
            <TabsTrigger value="signup">Cadastrar</TabsTrigger>
          </TabsList>
          
          <TabsContent value="login">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <LogIn className="w-5 h-5" />
                  Entrar na sua conta
                </CardTitle>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleLogin} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="login-email">Email</Label>
                    <Input
                      id="login-email"
                      type="email"
                      placeholder="seu.email@exemplo.com"
                      value={loginData.email}
                      onChange={(e) => setLoginData(prev => ({ ...prev, email: e.target.value }))}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="login-password">Senha</Label>
                    <Input
                      id="login-password"
                      type="password"
                      placeholder="••••••••"
                      value={loginData.password}
                      onChange={(e) => setLoginData(prev => ({ ...prev, password: e.target.value }))}
                      required
                    />
                  </div>
                  <div className="text-right">
                    <Button
                      type="button"
                      variant="link"
                      className="px-0 text-xs text-muted-foreground"
                      onClick={() => {
                        setShowForgotPassword(true);
                        setForgotEmail(loginData.email);
                      }}
                    >
                      Esqueceu a senha?
                    </Button>
                  </div>

                  {showForgotPassword && (
                    <div className="p-3 rounded-md border bg-muted/50 space-y-3">
                      <p className="text-sm font-medium">Recuperar senha</p>
                      <div className="space-y-2">
                        <Label htmlFor="forgot-email">Email ou usuário do Slack</Label>
                        <Input
                          id="forgot-email"
                          type="text"
                          placeholder="seu.email@exemplo.com ou @seu.usuario"
                          value={forgotEmail}
                          onChange={(e) => setForgotEmail(e.target.value)}
                        />
                        <p className="text-xs text-muted-foreground">
                          Se você não tem email cadastrado, informe seu nome/usuário do Slack — enviaremos o link por DM.
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          size="sm"
                          disabled={forgotLoading || !forgotEmail}
                          onClick={async () => {
                            setForgotLoading(true);
                            const identifier = forgotEmail.trim();
                            try {
                              // Canal único: edge function envia email (via Resend) + DM no Slack.
                              // redirectTo é resolvido server-side para o domínio público.
                              const { data, error: fnError } = await supabase.functions.invoke('send-password-reset-slack', {
                                body: { identifier },
                              });
                              if (fnError) console.warn('send-password-reset-slack error:', fnError);

                              const dmStatus = (data as any)?.dm_status;
                              const emailStatus = (data as any)?.email_status;
                              const channels: string[] = [];
                              if (emailStatus === 'sent') channels.push('email');
                              if (dmStatus === 'sent') channels.push('Slack');

                              if (channels.length > 0) {
                                toast({
                                  title: 'Link enviado!',
                                  description:
                                    dmStatus === 'no_slack_linked'
                                      ? 'Enviamos o link por email. Não encontramos um usuário no Slack vinculado a este email — se quiser receber também por DM, procure um administrador.'
                                      : `Enviamos o link de redefinição por ${channels.join(' e ')}.`,
                                });
                                setShowForgotPassword(false);
                              } else if (dmStatus === 'no_slack_linked') {
                                toast({
                                  title: 'Não conseguimos enviar o link',
                                  description:
                                    'Seu email não recebeu o link e não há usuário do Slack vinculado. Procure um administrador para liberar seu acesso.',
                                  variant: 'destructive',
                                });
                              } else {
                                toast({
                                  title: 'Não foi possível enviar o link',
                                  description: 'Verifique o identificador informado ou contate um administrador.',
                                  variant: 'destructive',
                                });
                              }
                            } catch (err: any) {
                              toast({ title: 'Erro', description: err.message, variant: 'destructive' });
                            } finally {
                              setForgotLoading(false);
                            }
                          }}
                        >
                          {forgotLoading ? 'Enviando...' : 'Enviar link'}
                        </Button>
                        <Button type="button" variant="ghost" size="sm" onClick={() => setShowForgotPassword(false)}>
                          Cancelar
                        </Button>
                      </div>
                    </div>
                  )}

                  <Button type="submit" className="w-full" disabled={loading}>
                    {loading ? 'Entrando...' : 'Entrar'}
                  </Button>
                  
                  {isFigmaEnabled && (
                    <>
                      <div className="relative my-4">
                        <div className="absolute inset-0 flex items-center">
                          <span className="w-full border-t" />
                        </div>
                        <div className="relative flex justify-center text-xs uppercase">
                          <span className="bg-background px-2 text-muted-foreground">
                            Ou continue com
                          </span>
                        </div>
                      </div>
                      
                      <Button 
                        type="button" 
                        variant="outline" 
                        className="w-full" 
                        onClick={handleFigmaLogin}
                        disabled={loading}
                      >
                        <Figma className="w-4 h-4 mr-2" />
                        Entrar com Figma
                      </Button>
                    </>
                  )}
                </form>
              </CardContent>
            </Card>
          </TabsContent>
          
          <TabsContent value="signup">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <UserPlus className="w-5 h-5" />
                  Criar conta
                </CardTitle>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSignup} className="space-y-4">
                   <div className="space-y-2">
                     <Label htmlFor="signup-person">Selecione seu nome</Label>
                     <Select 
                       value={signupData.personId} 
                       onValueChange={(value) => setSignupData(prev => ({ ...prev, personId: value }))}
                       disabled={people.length === 0}
                     >
                       <SelectTrigger>
                         <SelectValue placeholder={
                           people.length === 0 
                             ? "Carregando lista de pessoas..." 
                             : "Escolha seu nome na lista"
                         } />
                       </SelectTrigger>
                       <SelectContent>
                         {people.map((person) => (
                           <SelectItem key={person.id} value={person.id}>
                             {person.nome} ({person.email})
                           </SelectItem>
                         ))}
                       </SelectContent>
                     </Select>
                   </div>
                  <div className="space-y-2">
                    <Label htmlFor="signup-email">Email</Label>
                    <Input
                      id="signup-email"
                      type="email"
                      placeholder="seu.email@exemplo.com"
                      value={signupData.email}
                      onChange={(e) => setSignupData(prev => ({ ...prev, email: e.target.value }))}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signup-password">Senha</Label>
                    <Input
                      id="signup-password"
                      type="password"
                      placeholder="••••••••"
                      value={signupData.password}
                      onChange={(e) => setSignupData(prev => ({ ...prev, password: e.target.value }))}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signup-confirm">Confirmar senha</Label>
                    <Input
                      id="signup-confirm"
                      type="password"
                      placeholder="••••••••"
                      value={signupData.confirmPassword}
                      onChange={(e) => setSignupData(prev => ({ ...prev, confirmPassword: e.target.value }))}
                      required
                    />
                  </div>
                  <Button type="submit" className="w-full" disabled={loading}>
                    {loading ? 'Criando conta...' : 'Criar conta'}
                  </Button>
                  
                  {isFigmaEnabled && (
                    <>
                      <div className="relative my-4">
                        <div className="absolute inset-0 flex items-center">
                          <span className="w-full border-t" />
                        </div>
                        <div className="relative flex justify-center text-xs uppercase">
                          <span className="bg-background px-2 text-muted-foreground">
                            Ou continue com
                          </span>
                        </div>
                      </div>
                      
                      <Button 
                        type="button" 
                        variant="outline" 
                        className="w-full" 
                        onClick={handleFigmaLogin}
                        disabled={loading}
                      >
                        <Figma className="w-4 h-4 mr-2" />
                        Cadastrar com Figma
                      </Button>
                    </>
                  )}
                </form>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}