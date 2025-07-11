import { Outlet } from 'react-router-dom';
import AuthGuard from './auth/AuthGuard';
import { AppLayout } from './layout/AppLayout';

export function Layout() {
  return (
    <AuthGuard>
      <AppLayout>
        <Outlet />
      </AppLayout>
    </AuthGuard>
  );
}
