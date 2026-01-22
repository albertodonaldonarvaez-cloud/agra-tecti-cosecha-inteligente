import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import Boxes from "./pages/Boxes";
import Analytics from "./pages/Analytics";
import DailyAnalysis from "./pages/DailyAnalysis";
import Settings from "./pages/Settings";
import Users from "./pages/Users";
import Harvesters from "./pages/Harvesters";
import HarvesterPerformance from "./pages/HarvesterPerformance";
import Parcels from "./pages/Parcels";

import BoxEditor from "./pages/BoxEditor";
import Login from "./pages/Login";
import { FloatingNav } from "./components/FloatingNav";
import { useAuth } from "./_core/hooks/useAuth";

function Router() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-green-600">Cargando...</p>
      </div>
    );
  }

  // Si no hay usuario, mostrar login
  if (!user) {
    return <Login />;
  }

  return (
    <>
      <Switch>
        <Route path={"/"} component={Home} />
        <Route path={"/boxes"} component={Boxes} />
        <Route path="/analytics" component={Analytics} />
        <Route path="/daily" component={DailyAnalysis} />
        <Route path="/harvesters" component={Harvesters} />
        <Route path="/performance" component={HarvesterPerformance} />
        <Route path="/parcels" component={Parcels} />

        <Route path="/editor" component={BoxEditor} />
        <Route path="/users" component={Users} />
        <Route path="/settings" component={Settings} />
        <Route path={"/404"} component={NotFound} />
        {/* Final fallback route */}
        <Route component={NotFound} />
      </Switch>
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
