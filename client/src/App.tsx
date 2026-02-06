import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { FloatingNav } from "./components/FloatingNav";
import { useAuth } from "./_core/hooks/useAuth";
import { Suspense, lazy } from "react";

// ====== CODE SPLITTING: Carga diferida de páginas ======
// Solo Home y Login se cargan inmediatamente (son las más usadas al inicio)
import Home from "./pages/Home";
import Login from "./pages/Login";

// Las demás páginas se cargan bajo demanda cuando el usuario navega a ellas
const Boxes = lazy(() => import("./pages/Boxes"));
const Analytics = lazy(() => import("./pages/Analytics"));
const DailyAnalysis = lazy(() => import("./pages/DailyAnalysis"));
const Settings = lazy(() => import("./pages/Settings"));
const Users = lazy(() => import("./pages/Users"));
const Harvesters = lazy(() => import("./pages/Harvesters"));
const HarvesterPerformance = lazy(() => import("./pages/HarvesterPerformance"));
const Parcels = lazy(() => import("./pages/Parcels"));
const BoxEditor = lazy(() => import("./pages/BoxEditor"));
const ClimateAnalysis = lazy(() => import("./pages/ClimateAnalysis"));
const NotFound = lazy(() => import("./pages/NotFound"));

// Componente de carga para Suspense
function PageLoader() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-green-200 border-t-green-600" />
        <p className="text-green-600 text-sm">Cargando...</p>
      </div>
    </div>
  );
}

function Router() {
  const { user, loading } = useAuth();

  if (loading) {
    return <PageLoader />;
  }

  // Si no hay usuario, mostrar login
  if (!user) {
    return <Login />;
  }

  return (
    <>
      <Suspense fallback={<PageLoader />}>
        <Switch>
          <Route path={"/"} component={Home} />
          <Route path={"/boxes"} component={Boxes} />
          <Route path="/analytics" component={Analytics} />
          <Route path="/daily" component={DailyAnalysis} />
          <Route path="/harvesters" component={Harvesters} />
          <Route path="/performance" component={HarvesterPerformance} />
          <Route path="/parcels" component={Parcels} />
          <Route path="/editor" component={BoxEditor} />
          <Route path="/climate" component={ClimateAnalysis} />
          <Route path="/users" component={Users} />
          <Route path="/settings" component={Settings} />
          <Route path={"/404"} component={NotFound} />
          {/* Final fallback route */}
          <Route component={NotFound} />
        </Switch>
      </Suspense>
      <FloatingNav isAdmin={user.role === "admin"} />
    </>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
