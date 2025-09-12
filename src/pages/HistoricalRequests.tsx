import { Header } from "@/components/Header";
import { HistoricalRequestForm } from "@/components/HistoricalRequestForm";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { Navigate } from "react-router-dom";

const HistoricalRequests = () => {
  const { person } = useAuth();

  // Only allow directors to access this page
  if (!person || person.papel !== 'DIRETOR') {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/30">
      <Header />
      <main className="container mx-auto px-4 py-8">
        <div className="mb-6">
          <Button variant="ghost" onClick={() => window.history.back()}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Voltar
          </Button>
        </div>
        <HistoricalRequestForm />
      </main>
    </div>
  );
};

export default HistoricalRequests;