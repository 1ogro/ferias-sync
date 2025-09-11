import { Calendar, Bell, User, LogOut, Home, FileText, Inbox } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { currentUser } from "@/lib/mockData";
import { useLocation } from "react-router-dom";

export const Header = () => {
  const location = useLocation();
  const initials = currentUser.nome
    .split(" ")
    .map(n => n[0])
    .join("")
    .toUpperCase();

  const navigation = [
    { name: "Dashboard", href: "/", icon: Home },
    { name: "Nova Solicitação", href: "/new-request", icon: FileText },
    { name: "Aprovações", href: "/inbox", icon: Inbox },
  ];

  return (
    <header className="border-b bg-card/50 backdrop-blur supports-[backdrop-filter]:bg-card/50">
      <div className="container mx-auto px-4 h-16 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <Calendar className="w-8 h-8 text-primary" />
            <h1 className="text-xl font-semibold bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
              Controle de Férias
            </h1>
          </div>

          {/* Navigation */}
          <nav className="hidden md:flex items-center space-x-1">
            {navigation.map((item) => (
              <Button
                key={item.name}
                variant={location.pathname === item.href ? "default" : "ghost"}
                size="sm"
                onClick={() => window.location.href = item.href}
                className="flex items-center gap-2"
              >
                <item.icon className="w-4 h-4" />
                {item.name}
              </Button>
            ))}
          </nav>
        </div>

        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" className="relative">
            <Bell className="w-5 h-5" />
            <span className="absolute -top-1 -right-1 w-2 h-2 bg-status-pending rounded-full" />
          </Button>
          
          <div className="flex items-center gap-3 px-3 py-2 rounded-lg border bg-muted/50">
            <Avatar className="w-8 h-8">
              <AvatarFallback className="bg-primary text-primary-foreground text-sm">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className="flex flex-col">
              <span className="text-sm font-medium">{currentUser.nome}</span>
              <span className="text-xs text-muted-foreground">{currentUser.cargo}</span>
            </div>
          </div>

          <Button variant="ghost" size="icon">
            <LogOut className="w-5 h-5" />
          </Button>
        </div>
      </div>
    </header>
  );
};