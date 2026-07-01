import { createBrowserRouter, RouterProvider, Navigate } from 'react-router-dom';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { AdminsPage } from './pages/AdminsPage';
import { FolderViewPage } from './pages/FolderViewPage';
import { QuestionEditorPage } from './pages/QuestionEditorPage';
import { TakeTestEntryPage } from './pages/TakeTestEntryPage';
import { TakeTestPage } from './pages/TakeTestPage';
import { TestResultPage } from './pages/TestResultPage';
import { SubmissionsPage } from './pages/SubmissionsPage';
import { SubmissionDetailPage } from './pages/SubmissionDetailPage';
import { StudentHistoryPage } from './pages/StudentHistoryPage';
import { PrivateRoute } from './components/PrivateRoute';
import { SuperAdminRoute } from './components/SuperAdminRoute';
import { TopProgressBar } from './components/TopProgressBar';
import { useAuthStore } from './stores/authStore';

function HomeRoute() {
  const admin = useAuthStore((s) => s.admin);
  return admin?.role === 'student' ? <StudentHistoryPage /> : <DashboardPage />;
}

const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  { path: '/', element: <PrivateRoute><HomeRoute /></PrivateRoute> },
  { path: '/folders/:id', element: <PrivateRoute><FolderViewPage /></PrivateRoute> },
  { path: '/tests/:id/edit', element: <PrivateRoute><QuestionEditorPage /></PrivateRoute> },
  { path: '/tests/:id/submissions', element: <PrivateRoute><SubmissionsPage /></PrivateRoute> },
  { path: '/submissions/:id', element: <PrivateRoute><SubmissionDetailPage /></PrivateRoute> },
  { path: '/t/:slug', element: <TakeTestEntryPage /> },
  { path: '/t/:slug/take', element: <TakeTestPage /> },
  { path: '/t/:slug/result', element: <TestResultPage /> },
  { path: '/admins', element: <SuperAdminRoute><AdminsPage /></SuperAdminRoute> },
  { path: '*', element: <Navigate to="/" replace /> },
]);

export default function App() {
  return (
    <>
      <TopProgressBar />
      <RouterProvider router={router} />
    </>
  );
}
