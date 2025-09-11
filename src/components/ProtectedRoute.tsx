import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Skeleton } from '@/components/ui/skeleton';
import { Calendar } from 'lucide-react';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export default function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { user, person, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !user) {
      navigate('/auth');
    } else if (!loading && user && person === null) {
      // User is authenticated but has no profile - redirect to setup
      navigate('/setup-profile');
    }
  }, [user, person, loading, navigate]);

  if (loading || (user && !person)) {
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