import { createBrowserRouter, RouterProvider, Navigate } from 'react-router-dom';
import { Toaster } from 'sonner';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
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
import { SchoolSettingsPage } from './pages/SchoolSettingsPage';
import { SchoolStaffPage } from './pages/SchoolStaffPage';
import { SchoolInvitePage } from './pages/SchoolInvitePage';
import { SchoolInviteJoinPage } from './pages/SchoolInviteJoinPage';
import { MyCoursesPage } from './pages/MyCoursesPage';
import { PracticeMessengerPage } from './pages/PracticeMessengerPage';
import { ClassroomHostPage } from './pages/ClassroomHostPage';
import { ClassroomStudentPage } from './pages/ClassroomStudentPage';
import { ClassroomReplayPage } from './pages/ClassroomReplayPage';
import { PrivateRoute } from './components/PrivateRoute';
import { TeacherRoute } from './components/TeacherRoute';
import { TopProgressBar } from './components/TopProgressBar';
import { useAuthStore } from './stores/authStore';

function HomeRoute() {
  const admin = useAuthStore((s) => s.admin);
  if (admin?.role === 'student') return <StudentHistoryPage />;
  if (admin?.role === 'curator') return <Navigate to="/students/list" replace />;
  return <DashboardPage />;
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
  { path: '/school-invite/:token', element: <SchoolInviteJoinPage /> },
  { path: '/live/play/:pin', element: <PrivateRoute><LivePlayPage /></PrivateRoute> },
  { path: '/classroom/host/:id', element: <TeacherRoute><ClassroomHostPage /></TeacherRoute> },
  // Erkin (guruhsiz) dars — login qilmagan mehmon ham havola orqali kira
  // olishi kerak, shuning uchun PrivateRoute bilan o'ralmaydi.
  { path: '/classroom/free/:id', element: <ClassroomStudentPage isFreeRoute /> },
  { path: '/classroom/:id', element: <PrivateRoute><ClassroomStudentPage /></PrivateRoute> },
  { path: '/classroom-history/:sessionId/replay', element: <PrivateRoute><ClassroomReplayPage /></PrivateRoute> },
  { path: '/lessons', element: <TeacherRoute><CoursesPage /></TeacherRoute> },
  { path: '/my-courses', element: <PrivateRoute><MyCoursesPage /></PrivateRoute> },
  { path: '/messenger', element: <PrivateRoute><PracticeMessengerPage /></PrivateRoute> },
  { path: '/payments', element: <TeacherRoute><PaymentsPage /></TeacherRoute> },
  { path: '/students', element: <TeacherRoute curatorAllowed><StudentsPage /></TeacherRoute> },
  { path: '/students/list', element: <TeacherRoute curatorAllowed><StudentsPage /></TeacherRoute> },
  { path: '/students/pending', element: <TeacherRoute curatorAllowed><StudentsPage /></TeacherRoute> },
  { path: '/school', element: <Navigate to="/school/settings" replace /> },
  { path: '/school/settings', element: <TeacherRoute><SchoolSettingsPage /></TeacherRoute> },
  { path: '/school/staff', element: <TeacherRoute><SchoolStaffPage /></TeacherRoute> },
  { path: '/school/invite', element: <TeacherRoute><SchoolInvitePage /></TeacherRoute> },
  { path: '/admins', element: <Navigate to="/" replace /> },
  { path: '*', element: <Navigate to="/" replace /> },
]);

export default function App() {
  return (
    <>
      <TopProgressBar />
      <RouterProvider router={router} />
      <Toaster richColors position="top-right" theme="system" />
    </>
  );
}
