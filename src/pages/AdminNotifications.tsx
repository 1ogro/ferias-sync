import { useNavigate } from "react-router-dom";
import { ArrowLeft, Bell } from "lucide-react";
import { Header } from "@/components/Header";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import NotificationsCatalogTable from "@/components/admin/NotificationsCatalogTable";

export default function AdminNotifications() {
  const { person } = useAuth();
  const navigate = useNavigate();
  const canAccess = person && (person.is_admin || person.papel === "DIRETOR");

  if (!canAccess) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12 text-center">
          <h1 className="text-2xl font-semibold mb-2">Acesso restrito</h1>
          <p className="text-muted-foreground">
            Este painel é visível apenas para diretores e administradores.
          </p>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-md bg-primary/10 text-primary mt-1">
              <Bell className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold">Notificações do sistema</h1>
              <p className="text-muted-foreground text-sm mt-1 max-w-2xl">
                Catálogo de todas as notificações automáticas — Slack, e-mail e mensagens
                internas — com público-alvo, gatilho e canal. Útil para auditoria, treinamento
                e debugging.
              </p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={() => navigate("/admin")}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Voltar
          </Button>
        </div>

        <NotificationsCatalogTable />
      </main>
    </div>
  );
}
