import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
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
import { PrivateRoute } from './components/PrivateRoute';
import { SuperAdminRoute } from './components/SuperAdminRoute';
import { TopProgressBar } from './components/TopProgressBar';

export default function App() {
  return (
    <BrowserRouter>
      <TopProgressBar />
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<PrivateRoute><DashboardPage /></PrivateRoute>} />
        <Route path="/folders/:id" element={<PrivateRoute><FolderViewPage /></PrivateRoute>} />
        <Route path="/tests/:id/edit" element={<PrivateRoute><QuestionEditorPage /></PrivateRoute>} />
        <Route path="/tests/:id/submissions" element={<PrivateRoute><SubmissionsPage /></PrivateRoute>} />
        <Route path="/submissions/:id" element={<PrivateRoute><SubmissionDetailPage /></PrivateRoute>} />
        <Route path="/t/:slug" element={<TakeTestEntryPage />} />
        <Route path="/t/:slug/take" element={<TakeTestPage />} />
        <Route path="/t/:slug/result" element={<TestResultPage />} />
        <Route path="/admins" element={<SuperAdminRoute><AdminsPage /></SuperAdminRoute>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
