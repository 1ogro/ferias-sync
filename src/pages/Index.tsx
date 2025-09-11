// Update this page (the content is just a fallback if you fail to update the page)

import { Header } from "@/components/Header";
import { Dashboard } from "@/components/Dashboard";

const Index = () => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/30">
      <Header />
      <main className="container mx-auto px-4 py-8">
        <Dashboard />
      </main>
    </div>
  );
};

export default Index;
