import { Header } from "@/components/Header";
import { NewRequestForm } from "@/components/NewRequestForm";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

const NewRequest = () => {
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
        <NewRequestForm />
      </main>
    </div>
  );
};

export default NewRequest;