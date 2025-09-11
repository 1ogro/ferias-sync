import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Calendar, Menu, Bell, User, Settings, LogOut, Shield } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { ProfileModal } from "./ProfileModal";
import { useState } from "react";

interface HeaderProps {
  showNavigation?: boolean;
}

export const Header = ({ showNavigation = true }: HeaderProps) => {
  const location = useLocation();
  const { person, signOut } = useAuth();
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);

  const navigation = [
    { name: "Dashboard", href: "/", icon: Calendar },
    { name: "Nova Solicitação", href: "/new-request", icon: Menu },
    { name: "Caixa de Entrada", href: "/inbox", icon: Bell, roles: ['GESTOR', 'DIRETOR'] },
    { name: "Administração", href: "/admin", icon: Shield, isAdmin: true },
  ];

  const filteredNavigation = navigation.filter(item => {
    if (item.isAdmin) return person?.is_admin;
    return !item.roles || item.roles.includes(person?.papel || '');
  });

  const getPapelColor = (papel: string) => {
    switch (papel) {
      case 'DIRETOR': return 'bg-purple-100 text-purple-800';
      case 'GESTOR': return 'bg-blue-100 text-blue-800';
      case 'COLABORADOR': return 'bg-green-100 text-green-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const handleSignOut = async () => {
    await signOut();
  };

  return (
    <>
      <header className="border-b border-border bg-card/50 backdrop-blur supports-[backdrop-filter]:bg-card/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <div className="flex items-center gap-8">
              <Link to="/" className="flex items-center gap-3">
                <Calendar className="w-8 h-8 text-primary" />
                <h1 className="text-2xl font-bold bg-gradient-to-r from-primary to-primary/80 bg-clip-text text-transparent">
                  Férias UXTD
                </h1>
              </Link>
              
              {showNavigation && (
                <nav className="hidden md:flex space-x-1">
                  {filteredNavigation.map((item) => {
                    const isActive = location.pathname === item.href;
                    return (
                      <Link
                        key={item.name}
                        to={item.href}
                        className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                          isActive
                            ? "bg-primary/10 text-primary"
                            : "text-muted-foreground hover:text-foreground hover:bg-accent"
                        }`}
                      >
                        <item.icon className="w-4 h-4" />
                        {item.name}
                      </Link>
                    );
                  })}
                </nav>
              )}
            </div>

            <div className="flex items-center gap-4">
              <Badge className={getPapelColor(person?.papel || '')}>
                {person?.nome?.split(' ')[0] || 'Usuário'}
              </Badge>
              
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm">
                    <User className="w-4 h-4" />
                    <span className="sr-only">Menu do usuário</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => setIsProfileModalOpen(true)}>
                    <User className="mr-2 h-4 w-4" />
                    <span>Perfil</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem>
                    <Settings className="mr-2 h-4 w-4" />
                    <span>Configurações</span>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleSignOut}>
                    <LogOut className="mr-2 h-4 w-4" />
                    <span>Sair</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>
      </header>
        
      <ProfileModal 
        open={isProfileModalOpen} 
        onOpenChange={setIsProfileModalOpen} 
      />
    </>
  );
};