import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { KeyRound, Loader2 } from 'lucide-react';

export default function ResetPassword() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [isRecovery, setIsRecovery] = useState(false);

  const [verifyError, setVerifyError] = useState<string | null>(null);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setIsRecovery(true);
      }
    });

    const url = new URL(window.location.href);
    const tokenHash = url.searchParams.get('token_hash');
    const type = url.searchParams.get('type');
    const hash = window.location.hash;

    if (tokenHash && type === 'recovery') {
      // Timeout de segurança: nunca deixar o spinner infinito
      const timeoutId = setTimeout(() => {
        setVerifyError((prev) => prev ?? 'Tempo esgotado ao verificar o link. Verifique sua conexão e tente novamente.');
      }, 15000);

      supabase.auth.verifyOtp({ type: 'recovery', token_hash: tokenHash })
        .then(({ error }) => {
          clearTimeout(timeoutId);
          if (error) {
            setVerifyError(error.message || 'Link inválido ou expirado.');
          } else {
            setIsRecovery(true);
            // limpar query para não reusar
            window.history.replaceState({}, '', '/reset-password');
          }
        })
        .catch((err: any) => {
          clearTimeout(timeoutId);
          setVerifyError(err?.message || 'Erro ao verificar o link. Tente novamente.');
        });
    } else if (hash.includes('type=recovery')) {
      setIsRecovery(true);
    }

    return () => subscription.unsubscribe();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (password.length < 6) {
      toast({ title: 'Erro', description: 'A senha deve ter pelo menos 6 caracteres.', variant: 'destructive' });
      return;
    }

    if (password !== confirmPassword) {
      toast({ title: 'Erro', description: 'As senhas não coincidem.', variant: 'destructive' });
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;

      toast({ title: 'Senha atualizada!', description: 'Sua senha foi redefinida com sucesso.' });
      navigate('/auth');
    } catch (error: any) {
      toast({ title: 'Erro', description: error.message || 'Não foi possível redefinir a senha.', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  if (!isRecovery) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-primary/5 to-primary/10 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 text-center">
            {verifyError ? (
              <>
                <p className="text-destructive font-medium mb-2">Link inválido ou expirado</p>
                <p className="text-sm text-muted-foreground mb-4">{verifyError}</p>
              </>
            ) : (
              <>
                <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4 text-muted-foreground" />
                <p className="text-muted-foreground">Verificando link de recuperação...</p>
              </>
            )}
            <Button variant="link" className="mt-4" onClick={() => navigate('/auth')}>
              Voltar ao login
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 to-primary/10 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <KeyRound className="w-5 h-5" />
              Redefinir Senha
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="new-password">Nova senha</Label>
                <Input
                  id="new-password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm-password">Confirmar nova senha</Label>
                <Input
                  id="confirm-password"
                  type="password"
                  placeholder="••••••••"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  minLength={6}
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? 'Salvando...' : 'Redefinir senha'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
