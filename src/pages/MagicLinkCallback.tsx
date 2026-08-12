import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Loader2, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";

export default function MagicLinkCallback() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const tokenHash = searchParams.get("token_hash");
    const type = searchParams.get("type");
    const requestedNext = searchParams.get("next") || "/";
    const nextPath = requestedNext.startsWith("/") && !requestedNext.startsWith("//")
      ? requestedNext
      : "/";

    if (!tokenHash || type !== "magiclink") {
      setError("Este link de acesso é inválido.");
      return;
    }

    let active = true;
    supabase.auth.verifyOtp({ token_hash: tokenHash, type: "magiclink" })
      .then(({ error: verifyError }) => {
        if (!active) return;
        if (verifyError) {
          setError("Este link já foi usado ou expirou. Solicite um novo acesso.");
          return;
        }
        window.history.replaceState({}, "", "/auth/magic");
        navigate(nextPath, { replace: true });
      })
      .catch(() => {
        if (active) setError("Não foi possível validar o link. Tente novamente.");
      });

    return () => { active = false; };
  }, [navigate, searchParams]);

  return (
    <main className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardContent className="pt-6 text-center space-y-4">
          {error ? (
            <>
              <TriangleAlert className="h-8 w-8 text-destructive mx-auto" aria-hidden="true" />
              <h1 className="text-lg font-semibold">Link indisponível</h1>
              <p className="text-sm text-muted-foreground">{error}</p>
              <Button className="w-full" onClick={() => navigate("/auth", { replace: true })}>
                Ir para o acesso
              </Button>
            </>
          ) : (
            <>
              <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto" aria-hidden="true" />
              <h1 className="text-lg font-semibold">Validando seu acesso</h1>
              <p className="text-sm text-muted-foreground">Aguarde um instante.</p>
            </>
          )}
        </CardContent>
      </Card>
    </main>
  );
}