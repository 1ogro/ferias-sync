import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";

// Storage key used both here and in the Auth page to send the user back
// to the consent URL (with its authorization_id) after signing in.
const OAUTH_NEXT_KEY = "oauth_consent_next";

// The Supabase JS client types `supabase.auth.oauth` as beta; wrap the three
// methods we need so this file stays TS-clean without a codebase-wide any.
type AuthzDetails = {
  redirect_url?: string;
  redirect_to?: string;
  client?: { name?: string; client_uri?: string };
  scope?: string;
};
type OauthApi = {
  getAuthorizationDetails: (id: string) => Promise<{ data: AuthzDetails | null; error: { message: string } | null }>;
  approveAuthorization: (id: string) => Promise<{ data: { redirect_url?: string; redirect_to?: string } | null; error: { message: string } | null }>;
  denyAuthorization: (id: string) => Promise<{ data: { redirect_url?: string; redirect_to?: string } | null; error: { message: string } | null }>;
};
const oauthApi = (supabase.auth as unknown as { oauth: OauthApi }).oauth;

export default function OAuthConsent() {
  const [params] = useSearchParams();
  const authorizationId = params.get("authorization_id") ?? "";
  const [details, setDetails] = useState<AuthzDetails | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      if (!authorizationId) {
        setError("Missing authorization_id");
        return;
      }
      const { data: sess } = await supabase.auth.getSession();
      if (!sess.session) {
        // Preserve the FULL consent URL so /auth returns the user here.
        const next = window.location.pathname + window.location.search;
        try { sessionStorage.setItem(OAUTH_NEXT_KEY, next); } catch { /* noop */ }
        window.location.href = "/auth";
        return;
      }
      if (!oauthApi?.getAuthorizationDetails) {
        setError(
          "OAuth 2.1 não está habilitado neste projeto Supabase. Habilite em Authentication → OAuth 2.1 no dashboard do Supabase."
        );
        return;
      }
      const { data, error: err } = await oauthApi.getAuthorizationDetails(authorizationId);
      if (!active) return;
      if (err) {
        setError(err.message);
        return;
      }
      const immediate = data?.redirect_url ?? data?.redirect_to;
      if (immediate && !data?.client) {
        window.location.href = immediate;
        return;
      }
      setDetails(data);
    })();
    return () => {
      active = false;
    };
  }, [authorizationId]);

  async function decide(approve: boolean) {
    setBusy(true);
    setError(null);
    const { data, error: err } = approve
      ? await oauthApi.approveAuthorization(authorizationId)
      : await oauthApi.denyAuthorization(authorizationId);
    if (err) {
      setBusy(false);
      setError(err.message);
      return;
    }
    const target = data?.redirect_url ?? data?.redirect_to;
    if (!target) {
      setBusy(false);
      setError("A autorização não retornou uma URL de redirecionamento.");
      return;
    }
    window.location.href = target;
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-4 bg-background">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Conectar aplicativo</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {!error && !details && (
            <p className="text-sm text-muted-foreground">Carregando solicitação de autorização…</p>
          )}
          {details && (
            <>
              <p className="text-sm">
                Autorizar <strong>{details.client?.name ?? "este aplicativo"}</strong> a acessar o
                Férias Sync em seu nome? Ele poderá ler e agir sobre os dados aos quais você já tem acesso.
              </p>
              {details.scope && (
                <p className="text-xs text-muted-foreground">Escopos solicitados: {details.scope}</p>
              )}
              <div className="flex gap-2">
                <Button className="flex-1" disabled={busy} onClick={() => decide(true)}>
                  Aprovar
                </Button>
                <Button className="flex-1" variant="outline" disabled={busy} onClick={() => decide(false)}>
                  Negar
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </main>
  );
}

export { OAUTH_NEXT_KEY };
