import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Calendar, Menu, Bell, User, Users, Settings, LogOut, Shield } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { ProfileModal } from "./ProfileModal";
import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";

interface HeaderProps {
  showNavigation?: boolean;
}

export const Header = ({ showNavigation = true }: HeaderProps) => {
  const location = useLocation();
  const { person, signOut, user, loading, profileChecked } = useAuth();
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [activeAbsencesCount, setActiveAbsencesCount] = useState(0);
  const [pendingInboxCount, setPendingInboxCount] = useState(0);

  // Fetch active absences count for managers
  useEffect(() => {
    if (!person || !user || (person.papel !== 'GESTOR' && person.papel !== 'DIRETOR' && !person.is_admin)) return;

    const fetchActiveAbsences = async () => {
      try {
        const today = new Date().toISOString().split('T')[0];

        if (person.papel === 'GESTOR' && !person.is_admin) {
          const { data: teamMembers } = await supabase
            .from('people')
            .select('id')
            .eq('gestor_id', person.id)
            .eq('ativo', true);

          const teamIds = teamMembers?.map(p => p.id) || [];
          if (teamIds.length === 0) {
            setActiveAbsencesCount(0);
            return;
          }

          const { count } = await supabase
            .from('requests')
            .select('id', { count: 'exact', head: true })
            .in('status', ['APROVADO_FINAL', 'REALIZADO'])
            .in('tipo', ['FERIAS', 'LICENCA_MATERNIDADE', 'LICENCA_MEDICA', 'DAYOFF'])
            .lte('inicio', today)
            .gte('fim', today)
            .in('requester_id', teamIds);

          setActiveAbsencesCount(count || 0);
        } else {
          const { count } = await supabase
            .from('requests')
            .select('id', { count: 'exact', head: true })
            .in('status', ['APROVADO_FINAL', 'REALIZADO'])
            .in('tipo', ['FERIAS', 'LICENCA_MATERNIDADE', 'LICENCA_MEDICA', 'DAYOFF'])
            .lte('inicio', today)
            .gte('fim', today);

          setActiveAbsencesCount(count || 0);
        }
      } catch (error) {
        console.error('Error fetching active absences count:', error);
      }
    };

    fetchActiveAbsences();
  }, [person, user]);

  // Fetch pending inbox count (pending requests + pending registrations for directors)
  useEffect(() => {
    if (!person || !user || (person.papel !== 'GESTOR' && person.papel !== 'DIRETOR' && !person.is_admin)) {
      setPendingInboxCount(0);
      return;
    }

    const fetchInboxCount = async () => {
      try {
        let requestCount = 0;
        let registrationCount = 0;

        // Count pending requests
        const { data: requestsData } = await supabase
          .from('requests')
          .select('id, status, requester:people!inner(gestor_id)')
          .in('status', ['PENDENTE', 'EM_ANALISE_GESTOR', 'EM_ANALISE_DIRETOR']);

        if (requestsData) {
          if (person.papel === 'DIRETOR' || person.is_admin) {
            requestCount = requestsData.length;
          } else {
            requestCount = requestsData.filter((r: any) => 
              r.status === 'EM_ANALISE_GESTOR' && r.requester?.gestor_id === person.id
            ).length;
          }
        }

        // Count pending registrations (directors/admins only)
        if (person.papel === 'DIRETOR' || person.is_admin) {
          const { count } = await supabase
            .from('pending_people')
            .select('id', { count: 'exact', head: true })
            .eq('status', 'PENDENTE');
          registrationCount = count || 0;
        }

        setPendingInboxCount(requestCount + registrationCount);
      } catch (error) {
        console.error('Error fetching inbox count:', error);
      }
    };

    fetchInboxCount();
  }, [person, user]);

  const navigation = [
    { name: "Dashboard", href: "/", icon: Calendar },
    { name: "Nova Solicitação", href: "/new-request", icon: Menu },
    { name: "Caixa de Entrada", href: "/inbox", icon: Bell, roles: ['GESTOR', 'DIRETOR'], showInboxBadge: true },
    { name: "Gestão do Time", href: "/vacation-management", icon: Users, roles: ['GESTOR', 'DIRETOR'], showBadge: true },
    { name: "Administração", href: "/admin", icon: Shield, isAdmin: true },
  ];

  // Only filter navigation when profile is fully loaded
  const isProfileReady = !loading && profileChecked && !!person;

  const filteredNavigation = useMemo(() => {
    if (!isProfileReady) {
      // While loading, show only items without role restrictions
      return navigation.filter(item => !item.roles && !item.isAdmin);
    }
    return navigation.filter(item => {
      if (item.isAdmin) return person?.is_admin;
      return !item.roles || item.roles.includes(person?.papel || '');
    });
  }, [isProfileReady, person?.papel, person?.is_admin]);

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

  // Skeleton placeholders shown while auth is resolving
  const navSkeletons = !isProfileReady && showNavigation ? (
    <>
      <Skeleton className="h-8 w-28 rounded-md" />
      <Skeleton className="h-8 w-24 rounded-md" />
    </>
  ) : null;

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
                        className={`relative flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                          isActive
                            ? "bg-primary/10 text-primary"
                            : "text-muted-foreground hover:text-foreground hover:bg-accent"
                        }`}
                      >
                        <item.icon className="w-4 h-4" />
                        {item.name}
                        {item.showBadge && activeAbsencesCount > 0 && (
                          <span className="inline-flex items-center justify-center min-w-5 h-5 px-1.5 text-xs font-bold text-primary-foreground bg-destructive rounded-full">
                            {activeAbsencesCount}
                          </span>
                        )}
                      </Link>
                    );
                  })}
                  {navSkeletons}
                </nav>
              )}
            </div>

            <div className="flex items-center gap-4">
              {/* Menu Mobile */}
              {showNavigation && (
                <Sheet open={isMobileMenuOpen} onOpenChange={setIsMobileMenuOpen}>
                  <SheetTrigger asChild>
                    <Button variant="ghost" size="sm" className="md:hidden">
                      <Menu className="h-5 w-5" />
                      <span className="sr-only">Abrir menu</span>
                    </Button>
                  </SheetTrigger>
                  <SheetContent side="left" className="w-72">
                    <SheetHeader>
                      <SheetTitle>Menu</SheetTitle>
                    </SheetHeader>
                    <nav className="flex flex-col gap-2 mt-6">
                      {filteredNavigation.map((item) => {
                        const isActive = location.pathname === item.href;
                        return (
                          <Link
                            key={item.name}
                            to={item.href}
                            onClick={() => setIsMobileMenuOpen(false)}
                            className={`flex items-center gap-3 px-4 py-3 rounded-md text-sm font-medium transition-colors ${
                              isActive
                                ? "bg-primary/10 text-primary"
                                : "text-muted-foreground hover:text-foreground hover:bg-accent"
                            }`}
                          >
                            <item.icon className="w-5 h-5" />
                            <span className="flex-1">{item.name}</span>
                            {item.showBadge && activeAbsencesCount > 0 && (
                              <span className="inline-flex items-center justify-center min-w-5 h-5 px-1.5 text-xs font-bold text-primary-foreground bg-destructive rounded-full">
                                {activeAbsencesCount}
                              </span>
                            )}
                          </Link>
                        );
                      })}
                      {!isProfileReady && (
                        <>
                          <Skeleton className="h-10 w-full rounded-md" />
                          <Skeleton className="h-10 w-full rounded-md" />
                        </>
                      )}
                    </nav>
                    
                    <div className="absolute bottom-6 left-6 right-6">
                      <div className="flex items-center gap-3 p-3 bg-muted rounded-md">
                        <User className="w-5 h-5" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{person?.nome}</p>
                          <Badge className={`${getPapelColor(person?.papel || '')} text-xs mt-1`}>
                            {person?.papel}
                          </Badge>
                        </div>
                      </div>
                    </div>
                  </SheetContent>
                </Sheet>
              )}
              
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
                  <DropdownMenuItem asChild>
                    <Link to="/settings">
                      <Settings className="mr-2 h-4 w-4" />
                      <span>Configurações</span>
                    </Link>
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
