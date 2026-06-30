import { Navigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';

export function SuperAdminRoute({ children }: { children: React.ReactNode }) {
  const admin = useAuthStore((s) => s.admin);
  if (!admin) return <Navigate to="/login" replace />;
  if (admin.role !== 'super') return <Navigate to="/" replace />;
  return <>{children}</>;
}
