import {api} from '../lib/api';
import type {ChatPage, ChatPreview} from '../types/api';

export async function apiGetOrCreatePracticeChatForCourse(
  courseId: string,
): Promise<{chatId: string}> {
  const res = await api.post(`/practice-messenger/courses/${courseId}/chat`);
  return res.data;
}

export async function apiGetPracticeChats(): Promise<{chats: ChatPreview[]}> {
  const res = await api.get('/practice-messenger');
  return res.data;
}

export async function apiGetPracticeChat(id: string, before?: string): Promise<ChatPage> {
  const res = await api.get(`/practice-messenger/${id}`, {
    params: {before, timezoneOffsetMinutes: new Date().getTimezoneOffset()},
  });
  return res.data;
}

export async function apiSendPracticeMessage(
  chatId: string,
  content: string,
  replyToMessageId?: string,
): Promise<{id: string; createdAt: string}> {
  const res = await api.post(`/practice-messenger/${chatId}/messages`, {
    content,
    replyToMessageId,
  });
  return res.data;
}

export async function apiUpdatePracticeMessage(
  chatId: string,
  messageId: string,
  content: string,
): Promise<void> {
  await api.patch(`/practice-messenger/${chatId}/messages/${messageId}`, {content});
}

export async function apiDeletePracticeMessage(chatId: string, messageId: string): Promise<void> {
  await api.delete(`/practice-messenger/${chatId}/messages/${messageId}`);
}
