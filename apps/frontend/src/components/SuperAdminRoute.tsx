import { Navigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useAuthStore } from '../stores/authStore';
import { apiGetMe } from '../api/auth';

export function SuperAdminRoute({ children }: { children: React.ReactNode }) {
  const token = useAuthStore((s) => s.token);
  const admin = useAuthStore((s) => s.admin);
  const [loading, setLoading] = useState(Boolean(token && !admin));

  useEffect(() => {
    if (!token || admin) return;

    apiGetMe()
      .then((me) => useAuthStore.setState({ admin: me }))
      .catch(() => useAuthStore.getState().logout())
      .finally(() => setLoading(false));
  }, [token, admin]);

  if (!token) return <Navigate to="/login" replace />;
  if (loading) return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 to-indigo-50 flex items-center justify-center">
      <p className="text-gray-400">Yuklanmoqda...</p>
    </div>
  );
  if (!admin) return <Navigate to="/login" replace />;
  if (admin.role !== 'super') return <Navigate to="/" replace />;
  return <>{children}</>;
}
