import { Suspense } from "react";
import {
  createBrowserRouter,
  RouterProvider,
  Navigate,
  type RouteObject,
} from "react-router-dom";
import { Toaster } from "sonner";
import { PrivateRoute } from "./components/PrivateRoute";
import { TeacherRoute } from "./components/TeacherRoute";
import { TopProgressBar } from "./components/TopProgressBar";
import { TelegramBrowserModal } from "./components/TelegramBrowserModal";
import { useAuthStore } from "./stores/authStore";
import { lazyWithRetry } from "./lib/lazyWithRetry";
import { RouteErrorBoundary } from "./components/RouteErrorBoundary";

// Har bir sahifa alohida chunk sifatida yuklanadi — boshlang'ich bundle
// faqat joriy sahifa uchun kerakli kodni o'z ichiga oladi.
const LoginPage = lazyWithRetry(() =>
  import("./pages/LoginPage").then((m) => ({ default: m.LoginPage })),
);
const DashboardPage = lazyWithRetry(() =>
  import("./pages/DashboardPage").then((m) => ({ default: m.DashboardPage })),
);
const FolderViewPage = lazyWithRetry(() =>
  import("./pages/FolderViewPage").then((m) => ({ default: m.FolderViewPage })),
);
const QuestionEditorPage = lazyWithRetry(() =>
  import("./pages/QuestionEditorPage").then((m) => ({
    default: m.QuestionEditorPage,
  })),
);
const TakeTestEntryPage = lazyWithRetry(() =>
  import("./pages/TakeTestEntryPage").then((m) => ({
    default: m.TakeTestEntryPage,
  })),
);
const TakeTestPage = lazyWithRetry(() =>
  import("./pages/TakeTestPage").then((m) => ({ default: m.TakeTestPage })),
);
const TestResultPage = lazyWithRetry(() =>
  import("./pages/TestResultPage").then((m) => ({ default: m.TestResultPage })),
);
const SubmissionsPage = lazyWithRetry(() =>
  import("./pages/SubmissionsPage").then((m) => ({
    default: m.SubmissionsPage,
  })),
);
const SubmissionDetailPage = lazyWithRetry(() =>
  import("./pages/SubmissionDetailPage").then((m) => ({
    default: m.SubmissionDetailPage,
  })),
);
const StudentHistoryPage = lazyWithRetry(() =>
  import("./pages/StudentHistoryPage").then((m) => ({
    default: m.StudentHistoryPage,
  })),
);
const StudentSubmissionDetailPage = lazyWithRetry(() =>
  import("./pages/StudentSubmissionDetailPage").then((m) => ({
    default: m.StudentSubmissionDetailPage,
  })),
);
const LiveCreatePage = lazyWithRetry(() =>
  import("./pages/LiveCreatePage").then((m) => ({ default: m.LiveCreatePage })),
);
const LiveHostPage = lazyWithRetry(() =>
  import("./pages/LiveHostPage").then((m) => ({ default: m.LiveHostPage })),
);
const LiveJoinPage = lazyWithRetry(() =>
  import("./pages/LiveJoinPage").then((m) => ({ default: m.LiveJoinPage })),
);
const LivePlayPage = lazyWithRetry(() =>
  import("./pages/LivePlayPage").then((m) => ({ default: m.LivePlayPage })),
);
const PaymentsPage = lazyWithRetry(() =>
  import("./pages/PaymentsPage").then((m) => ({ default: m.PaymentsPage })),
);
const CoursesPage = lazyWithRetry(() =>
  import("./pages/CoursesPage").then((m) => ({ default: m.CoursesPage })),
);
const StudentsPage = lazyWithRetry(() =>
  import("./pages/StudentsPage").then((m) => ({ default: m.StudentsPage })),
);
const SchoolSettingsPage = lazyWithRetry(() =>
  import("./pages/SchoolSettingsPage").then((m) => ({
    default: m.SchoolSettingsPage,
  })),
);
const SchoolStaffPage = lazyWithRetry(() =>
  import("./pages/SchoolStaffPage").then((m) => ({
    default: m.SchoolStaffPage,
  })),
);
const SchoolInvitePage = lazyWithRetry(() =>
  import("./pages/SchoolInvitePage").then((m) => ({
    default: m.SchoolInvitePage,
  })),
);
const SchoolInviteJoinPage = lazyWithRetry(() =>
  import("./pages/SchoolInviteJoinPage").then((m) => ({
    default: m.SchoolInviteJoinPage,
  })),
);
const MyCoursesPage = lazyWithRetry(() =>
  import("./pages/MyCoursesPage").then((m) => ({ default: m.MyCoursesPage })),
);
const SchoolsListPage = lazyWithRetry(() =>
  import("./pages/SchoolsListPage").then((m) => ({
    default: m.SchoolsListPage,
  })),
);
const PracticeMessengerPage = lazyWithRetry(() =>
  import("./pages/PracticeMessengerPage").then((m) => ({
    default: m.PracticeMessengerPage,
  })),
);
const ClassroomHostPage = lazyWithRetry(() =>
  import("./pages/ClassroomHostPage").then((m) => ({
    default: m.ClassroomHostPage,
  })),
);
const ClassroomStudentPage = lazyWithRetry(() =>
  import("./pages/ClassroomStudentPage").then((m) => ({
    default: m.ClassroomStudentPage,
  })),
);
const ClassroomReplayPage = lazyWithRetry(() =>
  import("./pages/ClassroomReplayPage").then((m) => ({
    default: m.ClassroomReplayPage,
  })),
);
const FreeClassHistoryPage = lazyWithRetry(() =>
  import("./pages/FreeClassHistoryPage").then((m) => ({
    default: m.FreeClassHistoryPage,
  })),
);
const BoardsPage = lazyWithRetry(() =>
  import("./pages/BoardsPage").then((m) => ({ default: m.BoardsPage })),
);
const BoardEditorPage = lazyWithRetry(() =>
  import("./pages/BoardEditorPage").then((m) => ({
    default: m.BoardEditorPage,
  })),
);
const ChallengesHubPage = lazyWithRetry(() =>
  import("./pages/ChallengesHubPage").then((m) => ({
    default: m.ChallengesHubPage,
  })),
);
const MyTestsPage = lazyWithRetry(() =>
  import("./pages/MyTestsPage").then((m) => ({ default: m.MyTestsPage })),
);
const MyTestFolderViewPage = lazyWithRetry(() =>
  import("./pages/MyTestFolderViewPage").then((m) => ({ default: m.MyTestFolderViewPage })),
);
const MyTestQuestionEditorPage = lazyWithRetry(() =>
  import("./pages/MyTestQuestionEditorPage").then((m) => ({ default: m.MyTestQuestionEditorPage })),
);
const MyDictionariesPage = lazyWithRetry(() =>
  import("./pages/MyDictionariesPage").then((m) => ({ default: m.MyDictionariesPage })),
);
const WordDeckViewPage = lazyWithRetry(() =>
  import("./pages/WordDeckViewPage").then((m) => ({ default: m.WordDeckViewPage })),
);
const DeckPracticePage = lazyWithRetry(() =>
  import("./pages/DeckPracticePage").then((m) => ({ default: m.DeckPracticePage })),
);
const ChallengesListPage = lazyWithRetry(() =>
  import("./pages/ChallengesListPage").then((m) => ({
    default: m.ChallengesListPage,
  })),
);
const ChallengeDetailPage = lazyWithRetry(() =>
  import("./pages/ChallengeDetailPage").then((m) => ({
    default: m.ChallengeDetailPage,
  })),
);
const ChallengeWordPracticePage = lazyWithRetry(() =>
  import("./pages/ChallengeWordPracticePage").then((m) => ({
    default: m.ChallengeWordPracticePage,
  })),
);

// Sahifa chunki yuklanayotganda ko'rsatiladi. Bo'sh (ko'rinmas) fon —
// TopProgressBar allaqachon yuklanish holatini bildiradi, shuning uchun
// bu yerda qo'shimcha spinner ko'rsatib "sakrash" effekti yaratmaymiz.
function RouteFallback() {
  return <div className="min-h-screen" aria-busy="true" />;
}

function HomeRoute() {
  const admin = useAuthStore((s) => s.admin);
  if (admin?.role === "student") return <Navigate to="/schools" replace />;
  if (admin?.role === "curator")
    return <Navigate to="/students/list" replace />;
  return <DashboardPage />;
}

// Every route gets the same errorElement. Without one, React Router falls back to its
// built-in developer error screen -- which is what users saw when a deploy invalidated the
// page chunk they were navigating to.
const withErrorBoundary = (routes: RouteObject[]): RouteObject[] =>
  routes.map((route) => ({ ...route, errorElement: <RouteErrorBoundary /> }));

const router = createBrowserRouter(
  withErrorBoundary([
  { path: "/login", element: <LoginPage /> },
  {
    path: "/",
    element: (
      <PrivateRoute>
        <HomeRoute />
      </PrivateRoute>
    ),
  },
  {
    path: "/folders/:id",
    element: (
      <TeacherRoute>
        <FolderViewPage />
      </TeacherRoute>
    ),
  },
  {
    path: "/tests/:id/edit",
    element: (
      <TeacherRoute>
        <QuestionEditorPage />
      </TeacherRoute>
    ),
  },
  {
    path: "/tests/:id/submissions",
    element: (
      <TeacherRoute>
        <SubmissionsPage />
      </TeacherRoute>
    ),
  },
  {
    path: "/submissions/:id",
    element: (
      <TeacherRoute>
        <SubmissionDetailPage />
      </TeacherRoute>
    ),
  },
  {
    path: "/history",
    element: (
      <PrivateRoute>
        <StudentHistoryPage />
      </PrivateRoute>
    ),
  },
  {
    path: "/history/:id",
    element: (
      <PrivateRoute>
        <StudentSubmissionDetailPage />
      </PrivateRoute>
    ),
  },
  { path: "/t/:slug", element: <TakeTestEntryPage /> },
  { path: "/t/:slug/take", element: <TakeTestPage /> },
  { path: "/t/:slug/result", element: <TestResultPage /> },
  {
    path: "/live",
    element: (
      <TeacherRoute>
        <LiveCreatePage />
      </TeacherRoute>
    ),
  },
  {
    path: "/live/host/:pin",
    element: (
      <TeacherRoute>
        <LiveHostPage />
      </TeacherRoute>
    ),
  },
  { path: "/live/join", element: <LiveJoinPage /> },
  {
    path: "/jamm",
    element: (
      <PrivateRoute>
        <ChallengesHubPage />
      </PrivateRoute>
    ),
  },
  {
    path: "/my-tests",
    element: (
      <PrivateRoute>
        <MyTestsPage />
      </PrivateRoute>
    ),
  },
  {
    path: "/my-tests/:id",
    element: (
      <PrivateRoute>
        <MyTestFolderViewPage />
      </PrivateRoute>
    ),
  },
  {
    path: "/my-tests/tests/:id/edit",
    element: (
      <PrivateRoute>
        <MyTestQuestionEditorPage />
      </PrivateRoute>
    ),
  },
  {
    path: "/my-dictionaries",
    element: (
      <PrivateRoute>
        <MyDictionariesPage />
      </PrivateRoute>
    ),
  },
  {
    path: "/my-dictionaries/:id",
    element: (
      <PrivateRoute>
        <WordDeckViewPage />
      </PrivateRoute>
    ),
  },
  {
    path: "/d/:slug",
    element: (
      <PrivateRoute>
        <DeckPracticePage />
      </PrivateRoute>
    ),
  },
  {
    path: "/challanges",
    element: (
      <PrivateRoute>
        <ChallengesListPage />
      </PrivateRoute>
    ),
  },
  {
    path: "/challanges/:id",
    element: (
      <PrivateRoute>
        <ChallengeDetailPage />
      </PrivateRoute>
    ),
  },
  {
    path: "/challanges/:id/practice",
    element: (
      <PrivateRoute>
        <ChallengeWordPracticePage />
      </PrivateRoute>
    ),
  },
  { path: "/challenges", element: <Navigate to="/challanges" replace /> },
  { path: "/challenges/:id", element: <Navigate to="/challanges" replace /> },
  {
    path: "/challenges/:id/practice",
    element: <Navigate to="/challanges" replace />,
  },
  { path: "/school-invite/:token", element: <SchoolInviteJoinPage /> },
  {
    path: "/live/play/:pin",
    element: (
      <PrivateRoute>
        <LivePlayPage />
      </PrivateRoute>
    ),
  },
  {
    path: "/classroom/host/:id",
    element: (
      <TeacherRoute>
        <ClassroomHostPage />
      </TeacherRoute>
    ),
  },
  // Erkin (guruhsiz) dars — login qilmagan mehmon ham havola orqali kira
  // olishi kerak, shuning uchun PrivateRoute bilan o'ralmaydi.
  {
    path: "/classroom/free/:id",
    element: <ClassroomStudentPage isFreeRoute />,
  },
  {
    path: "/classroom/:id",
    element: (
      <PrivateRoute>
        <ClassroomStudentPage />
      </PrivateRoute>
    ),
  },
  {
    path: "/classroom-history/:sessionId/replay",
    element: (
      <PrivateRoute>
        <ClassroomReplayPage />
      </PrivateRoute>
    ),
  },
  {
    path: "/boards",
    element: (
      <TeacherRoute>
        <BoardsPage />
      </TeacherRoute>
    ),
  },
  {
    path: "/boards/:id",
    element: (
      <TeacherRoute>
        <BoardEditorPage />
      </TeacherRoute>
    ),
  },
  {
    path: "/lessons",
    element: (
      <TeacherRoute>
        <CoursesPage />
      </TeacherRoute>
    ),
  },
  {
    path: "/free-classes",
    element: (
      <TeacherRoute>
        <FreeClassHistoryPage />
      </TeacherRoute>
    ),
  },
  {
    path: "/schools",
    element: (
      <PrivateRoute>
        <SchoolsListPage />
      </PrivateRoute>
    ),
  },
  {
    path: "/schools/:schoolId/courses",
    element: (
      <PrivateRoute>
        <MyCoursesPage />
      </PrivateRoute>
    ),
  },
  { path: "/my-courses", element: <Navigate to="/schools" replace /> },
  {
    path: "/messenger",
    element: (
      <PrivateRoute>
        <PracticeMessengerPage />
      </PrivateRoute>
    ),
  },
  {
    path: "/payments",
    element: (
      <TeacherRoute>
        <PaymentsPage />
      </TeacherRoute>
    ),
  },
  {
    path: "/students",
    element: (
      <TeacherRoute curatorAllowed>
        <StudentsPage />
      </TeacherRoute>
    ),
  },
  {
    path: "/students/list",
    element: (
      <TeacherRoute curatorAllowed>
        <StudentsPage />
      </TeacherRoute>
    ),
  },
  {
    path: "/students/pending",
    element: (
      <TeacherRoute curatorAllowed>
        <StudentsPage />
      </TeacherRoute>
    ),
  },
  { path: "/school", element: <Navigate to="/school/settings" replace /> },
  {
    path: "/school/settings",
    element: (
      <TeacherRoute>
        <SchoolSettingsPage />
      </TeacherRoute>
    ),
  },
  {
    path: "/school/staff",
    element: (
      <TeacherRoute>
        <SchoolStaffPage />
      </TeacherRoute>
    ),
  },
  {
    path: "/school/invite",
    element: (
      <TeacherRoute>
        <SchoolInvitePage />
      </TeacherRoute>
    ),
  },
  { path: "/admins", element: <Navigate to="/" replace /> },
  { path: "*", element: <Navigate to="/" replace /> },
  ]),
);

export default function App() {
  return (
    <>
      <TelegramBrowserModal />
      <TopProgressBar />
      <Suspense fallback={<RouteFallback />}>
        <RouterProvider router={router} />
      </Suspense>
      <Toaster richColors position="bottom-right" theme="system" />
    </>
  );
}
