import client from './client';

export interface ApiPracticeChatPreview {
  id: string;
  student: { id: string; name: string };
  curator: { id: string; name: string };
  groupName: string;
  courseTitle: string;
  lastMessage: { content: string; type: string; createdAt: string } | null;
}

export interface ApiPracticeMessage {
  id: string;
  sender: { id: string; name: string };
  type: 'text' | 'practice_test' | 'practice_image' | 'practice_grade';
  content: string;
  createdAt: string;
  editedAt: string | null;
  deletedAt: string | null;
  replyTo: {
    id: string;
    senderName: string;
    content: string;
    type: string;
  } | null;
  metadata: Record<string, unknown>;
  practice: { id: string; title: string; maxScore: number | null } | null;
  testSubmission: { id: string; score: number | null; total: number | null } | null;
  imageSubmission: {
    id: string;
    imageUrl: string;
    score: number | null;
    gradedAt: string | null;
  } | null;
  imageSubmissions: Array<{
    id: string;
    imageUrl: string;
    score: number | null;
    gradedAt: string | null;
    submittedAt: string;
  }>;
}

export interface ApiPracticeChat {
  id: string;
  student: { id: string; name: string };
  curator: { id: string; name: string };
  groupName: string;
  courseTitle: string;
}

export async function apiGetPracticeChats(): Promise<{ chats: ApiPracticeChatPreview[] }> {
  const response = await client.get('/practice-messenger');
  return response.data;
}

export async function apiGetUnreadPracticeChatIds(): Promise<string[]> {
  const response = await client.get('/practice-messenger/unread');
  return response.data;
}

export interface ApiPracticeChatPage {
  chat: ApiPracticeChat;
  messages: ApiPracticeMessage[];
  hasMore: boolean;
  nextCursor: string | null;
}

export async function apiGetPracticeChat(
  id: string,
  before?: string,
): Promise<ApiPracticeChatPage> {
  const response = await client.get(`/practice-messenger/${id}`, {
    params: {
      before,
      timezoneOffsetMinutes: new Date().getTimezoneOffset(),
    },
  });
  return response.data;
}

export async function apiSendPracticeMessage(
  chatId: string,
  content: string,
  replyToMessageId?: string,
): Promise<void> {
  await client.post(`/practice-messenger/${chatId}/messages`, {
    content,
    replyToMessageId,
  });
}

export async function apiUpdatePracticeMessage(
  chatId: string,
  messageId: string,
  content: string,
): Promise<void> {
  await client.patch(`/practice-messenger/${chatId}/messages/${messageId}`, {
    content,
  });
}

export async function apiDeletePracticeMessage(
  chatId: string,
  messageId: string,
): Promise<void> {
  await client.delete(`/practice-messenger/${chatId}/messages/${messageId}`);
}
