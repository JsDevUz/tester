import client from './client';

export interface ApiSchool {
  id: string;
  adminId: string;
  name: string;
  description: string;
  imageUrl: string | null;
  inviteToken: string;
  inviteRegenerationsRemaining: number;
  inviteRegenerationResetAt: string | null;
  createdAt: string;
}

export interface ApiSchoolStaffMember {
  id: string;
  studentId: string;
  name: string;
  phone: string;
  role: 'curator' | 'teacher_staff';
  avatarUrl: string | null;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

export interface ApiStudentSearchResult {
  id: string;
  name: string;
  phone: string;
  avatarUrl: string | null;
}

export async function apiGetSchool(): Promise<ApiSchool> {
  const res = await client.get('/school');
  return res.data;
}

export async function apiUpdateSchool(data: { name?: string; description?: string; imageUrl?: string }): Promise<ApiSchool> {
  const res = await client.patch('/school', data);
  return res.data;
}

export async function apiRegenerateInviteToken(): Promise<ApiSchool> {
  const res = await client.post('/school/invite/regenerate');
  return res.data;
}

export async function apiGetSchoolJoinPreview(token: string): Promise<{ schoolName: string }> {
  const res = await client.get(`/school-invite/${token}`);
  return res.data;
}

export async function apiJoinSchool(token: string): Promise<{ id: string }> {
  const res = await client.post(`/school-invite/${token}`);
  return res.data;
}

export async function apiGetSchoolStaff(limit = 7, offset = 0): Promise<PaginatedResponse<ApiSchoolStaffMember>> {
  const res = await client.get('/school/staff', { params: { limit, offset } });
  return res.data;
}

export interface ApiSchoolStudent {
  id: string;
  name: string;
  telegramName: string | null;
  phone: string | null;
  productsCount: number;
  totalPaid: number;
  avatarUrl: string | null;
}

export async function apiListAllStudents(limit = 7, offset = 0, query = ''): Promise<PaginatedResponse<ApiSchoolStudent>> {
  const res = await client.get('/school/students', { params: { limit, offset, q: query || undefined } });
  return res.data;
}

export async function apiCreateStudent(input: { name: string; phone: string; password: string }): Promise<{
  student: { id: string; name: string; phone: string; role: string; avatarUrl: string | null };
  membership: { id: string; joinedAt: string | null };
}> {
  const res = await client.post('/school/students', input);
  return res.data;
}

export async function apiUpdateStudentName(studentId: string, name: string): Promise<{ id: string; name: string; telegramName: string | null; phone: string | null; avatarUrl: string | null }> {
  const res = await client.patch(`/school/students/${studentId}/name`, { name });
  return res.data;
}

export async function apiUpdateStudentPassword(studentId: string, password: string): Promise<{ ok: boolean }> {
  const res = await client.patch(`/school/students/${studentId}/password`, { password });
  return res.data;
}

export async function apiRemoveStudent(studentId: string): Promise<void> {
  await client.delete(`/school/students/${studentId}`);
}

export interface ApiSchoolEnrollment {
  studentId: string;
  studentName: string;
  studentTelegramName: string | null;
  studentPhone: string | null;
  studentAvatarUrl: string | null;
  active: boolean;
  courseId: string;
  courseTitle: string;
  groupName: string;
  planName: string | null;
  joinedAt: string | null;
  lessonsCompleted: number;
  lessonsTotal: number;
  progressPercent: number;
  starsEarned: number;
  starsMax: number;
}

export async function apiListEnrollments(limit = 7, offset = 0, query = '', course = ''): Promise<PaginatedResponse<ApiSchoolEnrollment>> {
  const res = await client.get('/school/students/enrollments', { params: { limit, offset, q: query || undefined, course: course || undefined } });
  return res.data;
}

export interface ApiStudentLessonVideoProgress {
  id: string;
  label: string;
  durationSec: number | null;
  watchedPercent: number | null;
  lastWatchedAt: string | null;
  segments: Array<{ startSec: number; endSec: number }>;
}

export interface ApiStudentLessonProgress {
  id: string;
  moduleTitle: string;
  title: string;
  completedAt: string | null;
  completionScore: number | null;
  earnedCompletionScore: number | null;
  status: 'completed' | 'current' | 'not_started';
  videoBlocks: ApiStudentLessonVideoProgress[];
  practiceBlocks: Array<{
    id: string;
    type: 'test' | 'image' | 'oral';
    title: string;
    description: string;
    maxScore: number | null;
    earnedScore: number | null;
    submissions: Array<{
      id: string;
      submittedAt: string;
      score: number;
      total: number;
      earnedScore: number | null;
      scoreOverridden: boolean;
      scoreOverriddenAt: string | null;
    }>;
    imageSubmissions: Array<{
      id: string;
      imageUrl: string;
      submittedAt: string;
      score: number | null;
      graded: boolean;
    }>;
    oralGrade: { score: number; gradedAt: string } | null;
  }>;
}

export interface ApiStudentCourseProgress {
  student: { id: string; name: string; phone: string | null; avatarUrl: string | null };
  course: { id: string; title: string; groupName: string; joinedAt: string | null };
  lastActivityAt: string | null;
  lessonsCompleted: number;
  lessonsTotal: number;
  progressPercent: number;
  currentLessonId: string | null;
  lessons: ApiStudentLessonProgress[];
}

export async function apiGetStudentCourseProgress(studentId: string, courseId: string): Promise<ApiStudentCourseProgress> {
  const res = await client.get(`/school/students/${studentId}/courses/${courseId}/progress`);
  return res.data;
}

export interface ApiSchoolStudentWithoutGroup {
  id: string;
  name: string;
  phone: string | null;
  joinedAt: string;
  avatarUrl: string | null;
}

export async function apiGetStudentsWithoutGroup(): Promise<ApiSchoolStudentWithoutGroup[]> {
  const res = await client.get('/school/students/without-group');
  return res.data;
}

export async function apiSearchStudents(query: string): Promise<ApiStudentSearchResult[]> {
  const res = await client.get('/school/students/search', { params: { q: query } });
  return res.data;
}

export async function apiAddSchoolStaff(studentId: string, role: 'curator' | 'teacher_staff'): Promise<ApiSchoolStaffMember> {
  const res = await client.post('/school/staff', { studentId, role });
  return res.data;
}

export async function apiRemoveSchoolStaff(memberId: string): Promise<void> {
  await client.delete(`/school/staff/${memberId}`);
}
