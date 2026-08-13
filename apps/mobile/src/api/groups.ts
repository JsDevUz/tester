import {api} from '../lib/api';
import type {
  ApiMyCourse,
  ApiMyCourseDetail,
  ApiMyCourseLeaderboard,
  ApiMySchool,
} from '../types/api';

export async function apiGetMySchools(): Promise<ApiMySchool[]> {
  const res = await api.get('/my/schools');
  return res.data;
}

export async function apiGetMyCourses(schoolId?: string): Promise<ApiMyCourse[]> {
  const res = await api.get('/my/courses', {params: schoolId ? {schoolId} : undefined});
  return res.data;
}

export async function apiGetMyCourseDetail(courseId: string): Promise<ApiMyCourseDetail> {
  const res = await api.get(`/my/courses/${courseId}`);
  return res.data;
}

export async function apiGetMyCourseLeaderboard(
  courseId: string,
): Promise<ApiMyCourseLeaderboard> {
  const res = await api.get(`/my/courses/${courseId}/leaderboard`);
  return res.data;
}

export async function apiMarkLessonComplete(
  lessonId: string,
): Promise<{completedAt: string}> {
  const res = await api.post(`/lessons/${lessonId}/complete`);
  return res.data;
}

export async function apiGetSchoolJoinPreview(token: string): Promise<{schoolName: string}> {
  const res = await api.get(`/school-invite/${token}`);
  return res.data;
}

export async function apiJoinSchool(token: string): Promise<{id: string}> {
  const res = await api.post(`/school-invite/${token}`);
  return res.data;
}
