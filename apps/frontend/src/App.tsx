import { lazy, Suspense } from 'react';
import { createBrowserRouter, RouterProvider, Navigate } from 'react-router-dom';
import { Toaster } from 'sonner';
import { PrivateRoute } from './components/PrivateRoute';
import { TeacherRoute } from './components/TeacherRoute';
import { TopProgressBar } from './components/TopProgressBar';
import { useAuthStore } from './stores/authStore';

// Har bir sahifa alohida chunk sifatida yuklanadi — boshlang'ich bundle
// faqat joriy sahifa uchun kerakli kodni o'z ichiga oladi.
const LoginPage = lazy(() => import('./pages/LoginPage').then((m) => ({ default: m.LoginPage })));
const DashboardPage = lazy(() => import('./pages/DashboardPage').then((m) => ({ default: m.DashboardPage })));
const FolderViewPage = lazy(() => import('./pages/FolderViewPage').then((m) => ({ default: m.FolderViewPage })));
const QuestionEditorPage = lazy(() => import('./pages/QuestionEditorPage').then((m) => ({ default: m.QuestionEditorPage })));
const TakeTestEntryPage = lazy(() => import('./pages/TakeTestEntryPage').then((m) => ({ default: m.TakeTestEntryPage })));
const TakeTestPage = lazy(() => import('./pages/TakeTestPage').then((m) => ({ default: m.TakeTestPage })));
const TestResultPage = lazy(() => import('./pages/TestResultPage').then((m) => ({ default: m.TestResultPage })));
const SubmissionsPage = lazy(() => import('./pages/SubmissionsPage').then((m) => ({ default: m.SubmissionsPage })));
const SubmissionDetailPage = lazy(() => import('./pages/SubmissionDetailPage').then((m) => ({ default: m.SubmissionDetailPage })));
const StudentHistoryPage = lazy(() => import('./pages/StudentHistoryPage').then((m) => ({ default: m.StudentHistoryPage })));
const StudentSubmissionDetailPage = lazy(() => import('./pages/StudentSubmissionDetailPage').then((m) => ({ default: m.StudentSubmissionDetailPage })));
const LiveCreatePage = lazy(() => import('./pages/LiveCreatePage').then((m) => ({ default: m.LiveCreatePage })));
const LiveHostPage = lazy(() => import('./pages/LiveHostPage').then((m) => ({ default: m.LiveHostPage })));
const LiveJoinPage = lazy(() => import('./pages/LiveJoinPage').then((m) => ({ default: m.LiveJoinPage })));
const LivePlayPage = lazy(() => import('./pages/LivePlayPage').then((m) => ({ default: m.LivePlayPage })));
const PaymentsPage = lazy(() => import('./pages/PaymentsPage').then((m) => ({ default: m.PaymentsPage })));
const CoursesPage = lazy(() => import('./pages/CoursesPage').then((m) => ({ default: m.CoursesPage })));
const StudentsPage = lazy(() => import('./pages/StudentsPage').then((m) => ({ default: m.StudentsPage })));
const SchoolSettingsPage = lazy(() => import('./pages/SchoolSettingsPage').then((m) => ({ default: m.SchoolSettingsPage })));
const SchoolStaffPage = lazy(() => import('./pages/SchoolStaffPage').then((m) => ({ default: m.SchoolStaffPage })));
const SchoolInvitePage = lazy(() => import('./pages/SchoolInvitePage').then((m) => ({ default: m.SchoolInvitePage })));
const SchoolInviteJoinPage = lazy(() => import('./pages/SchoolInviteJoinPage').then((m) => ({ default: m.SchoolInviteJoinPage })));
const MyCoursesPage = lazy(() => import('./pages/MyCoursesPage').then((m) => ({ default: m.MyCoursesPage })));
const SchoolsListPage = lazy(() => import('./pages/SchoolsListPage').then((m) => ({ default: m.SchoolsListPage })));
const PracticeMessengerPage = lazy(() => import('./pages/PracticeMessengerPage').then((m) => ({ default: m.PracticeMessengerPage })));
const ClassroomHostPage = lazy(() => import('./pages/ClassroomHostPage').then((m) => ({ default: m.ClassroomHostPage })));
const ClassroomStudentPage = lazy(() => import('./pages/ClassroomStudentPage').then((m) => ({ default: m.ClassroomStudentPage })));
const ClassroomReplayPage = lazy(() => import('./pages/ClassroomReplayPage').then((m) => ({ default: m.ClassroomReplayPage })));
const FreeClassHistoryPage = lazy(() => import('./pages/FreeClassHistoryPage').then((m) => ({ default: m.FreeClassHistoryPage })));
const BoardsPage = lazy(() => import('./pages/BoardsPage').then((m) => ({ default: m.BoardsPage })));
const BoardEditorPage = lazy(() => import('./pages/BoardEditorPage').then((m) => ({ default: m.BoardEditorPage })));

// Sahifa chunki yuklanayotganda ko'rsatiladi. Bo'sh (ko'rinmas) fon —
// TopProgressBar allaqachon yuklanish holatini bildiradi, shuning uchun
// bu yerda qo'shimcha spinner ko'rsatib "sakrash" effekti yaratmaymiz.
function RouteFallback() {
  return <div className="min-h-screen" aria-busy="true" />;
}

function HomeRoute() {
  const admin = useAuthStore((s) => s.admin);
  if (admin?.role === 'student') return <Navigate to="/schools" replace />;
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
  { path: '/history', element: <PrivateRoute><StudentHistoryPage /></PrivateRoute> },
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
  { path: '/boards', element: <TeacherRoute><BoardsPage /></TeacherRoute> },
  { path: '/boards/:id', element: <TeacherRoute><BoardEditorPage /></TeacherRoute> },
  { path: '/lessons', element: <TeacherRoute><CoursesPage /></TeacherRoute> },
  { path: '/free-classes', element: <TeacherRoute><FreeClassHistoryPage /></TeacherRoute> },
  { path: '/schools', element: <PrivateRoute><SchoolsListPage /></PrivateRoute> },
  { path: '/schools/:schoolId/courses', element: <PrivateRoute><MyCoursesPage /></PrivateRoute> },
  { path: '/my-courses', element: <Navigate to="/schools" replace /> },
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
      <Suspense fallback={<RouteFallback />}>
        <RouterProvider router={router} />
      </Suspense>
      <Toaster richColors position="top-right" theme="system" />
    </>
  );
}
