import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';

export function Toolbar() {
  const { admin, logout } = useAuthStore();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate('/login');
  }

  return (
    <div className="h-12 bg-white/80 backdrop-blur border-b border-gray-200 flex items-center justify-between px-4">
      <span className="font-medium text-gray-700">{admin?.name}</span>
      <div className="flex gap-2">
        {admin?.role === 'super' && (
          <button
            onClick={() => navigate('/admins')}
            className="text-sm text-gray-500 hover:text-gray-800 px-3 py-1 rounded hover:bg-gray-100"
          >
            Admins
          </button>
        )}
        <button
          onClick={handleLogout}
          className="text-sm text-gray-500 hover:text-gray-800 px-3 py-1 rounded hover:bg-gray-100"
        >
          Logout
        </button>
      </div>
    </div>
  );
}
