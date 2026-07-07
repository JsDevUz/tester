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
import { StudentSubmissionDetailPage } from './pages/StudentSubmissionDetailPage';
import { LiveCreatePage } from './pages/LiveCreatePage';
import { LiveHostPage } from './pages/LiveHostPage';
import { LiveJoinPage } from './pages/LiveJoinPage';
import { LivePlayPage } from './pages/LivePlayPage';
import { ComingSoonPage } from './pages/ComingSoonPage';
import { CoursesPage } from './pages/CoursesPage';
import { StudentsPage } from './pages/StudentsPage';
import { AllUsersPage } from './pages/AllUsersPage';
import { PrivateRoute } from './components/PrivateRoute';
import { SuperAdminRoute } from './components/SuperAdminRoute';
import { TeacherRoute } from './components/TeacherRoute';
import { TopProgressBar } from './components/TopProgressBar';
import { useAuthStore } from './stores/authStore';

function HomeRoute() {
  const admin = useAuthStore((s) => s.admin);
  return admin?.role === 'student' ? <StudentHistoryPage /> : <DashboardPage />;
}

const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  { path: '/', element: <PrivateRoute><HomeRoute /></PrivateRoute> },
  { path: '/folders/:id', element: <TeacherRoute><FolderViewPage /></TeacherRoute> },
  { path: '/tests/:id/edit', element: <TeacherRoute><QuestionEditorPage /></TeacherRoute> },
  { path: '/tests/:id/submissions', element: <TeacherRoute><SubmissionsPage /></TeacherRoute> },
  { path: '/submissions/:id', element: <TeacherRoute><SubmissionDetailPage /></TeacherRoute> },
  { path: '/history/:id', element: <PrivateRoute><StudentSubmissionDetailPage /></PrivateRoute> },
  { path: '/t/:slug', element: <TakeTestEntryPage /> },
  { path: '/t/:slug/take', element: <TakeTestPage /> },
  { path: '/t/:slug/result', element: <TestResultPage /> },
  { path: '/live', element: <TeacherRoute><LiveCreatePage /></TeacherRoute> },
  { path: '/live/host/:pin', element: <TeacherRoute><LiveHostPage /></TeacherRoute> },
  { path: '/live/join', element: <LiveJoinPage /> },
  { path: '/live/play/:pin', element: <PrivateRoute><LivePlayPage /></PrivateRoute> },
  { path: '/lessons', element: <PrivateRoute><CoursesPage /></PrivateRoute> },
  { path: '/payments', element: <PrivateRoute><ComingSoonPage title="To'lovlar" /></PrivateRoute> },
  { path: '/students', element: <TeacherRoute><AllUsersPage /></TeacherRoute> },
  { path: '/students/list', element: <TeacherRoute><StudentsPage /></TeacherRoute> },
  { path: '/students/pending', element: <PrivateRoute><ComingSoonPage title="Ruxsat kutayotganlar" /></PrivateRoute> },
  { path: '/school', element: <PrivateRoute><ComingSoonPage title="Mening Maktabim" /></PrivateRoute> },
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
