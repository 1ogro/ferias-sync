import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Calendar } from 'lucide-react';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export default function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { user, person, loading, profileChecked, contractDateChecked } = useAuth();
  const navigate = useNavigate();
  const [showFallback, setShowFallback] = useState(false);

  useEffect(() => {
    // Only act when loading is complete and profile has been checked
    if (!loading && profileChecked && contractDateChecked) {
      if (!user) {
        console.log('No user, redirecting to auth');
        navigate('/auth');
      } else if (user && person === null) {
        // User is authenticated but has no profile - redirect to setup
        console.log('User authenticated but no profile, redirecting to setup');
        navigate('/setup-profile');
      } else if (user && person && !person.data_contrato) {
        // User has profile but no contract date - redirect to contract setup
        console.log('User has profile but no contract date, redirecting to contract setup');
        navigate('/setup-contract');
      }
    }
  }, [user, person, loading, profileChecked, contractDateChecked, navigate]);

  // Show fallback after 5 seconds of loading
  useEffect(() => {
    if (loading || !profileChecked || !contractDateChecked) {
      const timer = setTimeout(() => {
        setShowFallback(true);
      }, 5000);
      
      return () => clearTimeout(timer);
    } else {
      setShowFallback(false);
    }
  }, [loading, profileChecked, contractDateChecked]);

  // Debug current auth state to help diagnose loading loops
  useEffect(() => {
    console.debug('ProtectedRoute state', {
      loading,
      profileChecked,
      contractDateChecked,
      hasUser: !!user,
      hasPerson: !!person,
      hasContract: !!person?.data_contrato,
      showFallback,
    });
  }, [loading, profileChecked, contractDateChecked, user, person, showFallback]);

  // Auto-redirect as a fail-safe when fallback is shown
  useEffect(() => {
    if (!showFallback) return;

    if (!user) {
      console.warn('Auth taking too long or missing session; redirecting to /auth');
      navigate('/auth');
      return;
    }
    if (user && person === null) {
      console.warn('Profile missing after timeout; redirecting to /setup-profile');
      navigate('/setup-profile');
      return;
    }
    if (user && person && !person.data_contrato) {
      console.warn('Contract date missing after timeout; redirecting to /setup-contract');
      navigate('/setup-contract');
    }
  }, [showFallback, user, person, navigate]);

  if (loading || !profileChecked || !contractDateChecked) {
    if (showFallback) {
      return (
        <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/30 flex items-center justify-center">
          <Card className="max-w-md w-full mx-4">
            <CardContent className="pt-6 text-center space-y-4">
              <h2 className="text-lg font-semibold">Parece estar demorando...</h2>
              <p className="text-muted-foreground">
                O carregamento está levando mais tempo que o esperado.
              </p>
              <div className="space-y-2">
                <Button 
                  onClick={() => navigate('/auth')} 
                  className="w-full"
                >
                  Ir para Login
                </Button>
                <Button 
                  variant="outline" 
                  onClick={() => window.location.reload()} 
                  className="w-full"
                >
                  Tentar Novamente
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      );
    }

    return (
      <div className="min-h-screen bg-background">
        <div className="border-b">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Calendar className="w-8 h-8 text-primary" />
                <h1 className="text-2xl font-bold">Férias UXTD</h1>
              </div>
              <Skeleton className="w-24 h-10" />
            </div>
          </div>
        </div>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="space-y-6">
            <Skeleton className="w-full h-32" />
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <Skeleton className="w-full h-24" />
              <Skeleton className="w-full h-24" />
              <Skeleton className="w-full h-24" />
              <Skeleton className="w-full h-24" />
            </div>
            <Skeleton className="w-full h-96" />
          </div>
        </div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return <>{children}</>;
}