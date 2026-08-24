import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { Redirect, Route, Switch, Router as WouterRouter } from 'wouter';
import { AppLayout } from './components/layout/app-layout';
import { AuthProvider, useAuth } from './hooks/use-auth';

import LandingPage from './pages/landing';
import LoginPage from './pages/auth/login';
import RegisterPage from './pages/auth/register';

import Dashboard from './pages/dashboard';
import POS from './pages/pos';
import Products from './pages/products';
import Inventory from './pages/inventory';
import Customers from './pages/customers';
import Employees from './pages/employees';
import Reports from './pages/reports';
import Settings from './pages/settings';
import Subscription from './pages/subscription';
import Admin from './pages/admin';
import Suppliers from './pages/suppliers';

const DefaultAppRoute = () => <Redirect to="/pos" />;

function RootRoute() {
  const { token } = useAuth();

  return token ? <Redirect to="/pos" /> : <LandingPage />;
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function AppRoutes() {
  return (
    <AppLayout>
      <Switch>
        <Route path="/dashboard" component={Dashboard} />
        <Route path="/pos" component={POS} />
        <Route path="/products" component={Products} />
        <Route path="/inventory" component={Inventory} />
        <Route path="/customers" component={Customers} />
        <Route path="/employees" component={Employees} />
        <Route path="/suppliers" component={Suppliers} />
        <Route path="/reports" component={Reports} />
        <Route path="/settings" component={Settings} />
        <Route path="/subscription" component={Subscription} />
        <Route path="/admin" component={Admin} />
        <Route component={DefaultAppRoute} />
      </Switch>
    </AppLayout>
  );
}

function Router() {
  return (
    <Switch>
      {/* Public Routes */}
      <Route path="/" component={RootRoute} />
      <Route path="/login" component={LoginPage} />
      <Route path="/register" component={RegisterPage} />
      
      {/* App Routes (catch-all that renders AppLayout) */}
      <Route path="/:rest*" component={AppRoutes} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <Router />
        </WouterRouter>
        <Toaster theme="dark" position="top-right" richColors />
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;