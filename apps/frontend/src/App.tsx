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
import { PaymentsPage } from './pages/PaymentsPage';
import { CoursesPage } from './pages/CoursesPage';
import { StudentsPage } from './pages/StudentsPage';
import { AllUsersPage } from './pages/AllUsersPage';
import { PendingStudentsPage } from './pages/PendingStudentsPage';
import { SchoolSettingsPage } from './pages/SchoolSettingsPage';
import { SchoolStaffPage } from './pages/SchoolStaffPage';
import { SchoolInvitePage } from './pages/SchoolInvitePage';
import { JoinGroupPage } from './pages/JoinGroupPage';
import { MyCoursesPage } from './pages/MyCoursesPage';
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
  { path: '/join/:token', element: <JoinGroupPage /> },
  { path: '/live/play/:pin', element: <PrivateRoute><LivePlayPage /></PrivateRoute> },
  { path: '/lessons', element: <PrivateRoute><CoursesPage /></PrivateRoute> },
  { path: '/my-courses', element: <PrivateRoute><MyCoursesPage /></PrivateRoute> },
  { path: '/payments', element: <PrivateRoute><PaymentsPage /></PrivateRoute> },
  { path: '/students', element: <TeacherRoute><AllUsersPage /></TeacherRoute> },
  { path: '/students/list', element: <TeacherRoute><StudentsPage /></TeacherRoute> },
  { path: '/students/pending', element: <TeacherRoute><PendingStudentsPage /></TeacherRoute> },
  { path: '/school', element: <Navigate to="/school/settings" replace /> },
  { path: '/school/settings', element: <PrivateRoute><SchoolSettingsPage /></PrivateRoute> },
  { path: '/school/staff', element: <PrivateRoute><SchoolStaffPage /></PrivateRoute> },
  { path: '/school/invite', element: <PrivateRoute><SchoolInvitePage /></PrivateRoute> },
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
