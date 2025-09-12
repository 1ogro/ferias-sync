import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import ProtectedRoute from "@/components/ProtectedRoute";
import { Suspense, lazy } from "react";
import { Skeleton } from "@/components/ui/skeleton";

// Critical pages loaded immediately
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import SetupProfile from "./pages/SetupProfile";

// Lazy-loaded pages for better performance
const NewRequest = lazy(() => import("./pages/NewRequest"));
const EditRequest = lazy(() => import("./pages/EditRequest"));
const Inbox = lazy(() => import("./pages/Inbox"));
const RequestDetail = lazy(() => import("./pages/RequestDetail"));
const Admin = lazy(() => import("./pages/Admin"));
const VacationManagement = lazy(() => import("./pages/VacationManagement"));
const NotFound = lazy(() => import("./pages/NotFound"));

const queryClient = new QueryClient();

// Loading component for lazy-loaded routes
const PageLoader = () => (
  <div className="min-h-screen bg-background">
    <div className="border-b">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        <Skeleton className="w-48 h-8" />
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

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <AuthProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/auth" element={<Auth />} />
            <Route path="/setup-profile" element={<SetupProfile />} />
            <Route path="/" element={<ProtectedRoute><Index /></ProtectedRoute>} />
            <Route path="/new-request" element={
              <ProtectedRoute>
                <Suspense fallback={<PageLoader />}>
                  <NewRequest />
                </Suspense>
              </ProtectedRoute>
            } />
            <Route path="/requests/:id/edit" element={
              <ProtectedRoute>
                <Suspense fallback={<PageLoader />}>
                  <EditRequest />
                </Suspense>
              </ProtectedRoute>
            } />
            <Route path="/inbox" element={
              <ProtectedRoute>
                <Suspense fallback={<PageLoader />}>
                  <Inbox />
                </Suspense>
              </ProtectedRoute>
            } />
            <Route path="/requests/:id" element={
              <ProtectedRoute>
                <Suspense fallback={<PageLoader />}>
                  <RequestDetail />
                </Suspense>
              </ProtectedRoute>
            } />
            <Route path="/admin" element={
              <ProtectedRoute>
                <Suspense fallback={<PageLoader />}>
                  <Admin />
                </Suspense>
              </ProtectedRoute>
            } />
            <Route path="/vacation-management" element={
              <ProtectedRoute>
                <Suspense fallback={<PageLoader />}>
                  <VacationManagement />
                </Suspense>
              </ProtectedRoute>
            } />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={
              <Suspense fallback={<PageLoader />}>
                <NotFound />
              </Suspense>
            } />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
