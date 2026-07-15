import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, desc, eq, gte, inArray, isNull, lt, or } from 'drizzle-orm';
import { db } from '../db';
import {
  courses,
  groupEnrollments,
  groups,
  imageSubmissions,
  lessons,
  modules,
  practiceBlocks,
  practiceChatMessages,
  practiceChatReads,
  practiceChats,
  schoolMembers,
  submissions,
} from '../db/schema';
import { PracticeMessengerGateway } from './practice-messenger.gateway';

type PracticeContext = {
  chat: typeof practiceChats.$inferSelect;
  block: typeof practiceBlocks.$inferSelect;
  lesson: typeof lessons.$inferSelect;
  course: typeof courses.$inferSelect;
};

type ChatUser = { id: string; name: string };
type ChatGroup = { name: string };
type ChatCourse = { title: string; adminId: string };
type CuratorMembership = { schoolMember: { role: string; studentId: string } | null };

@Injectable()
export class PracticeMessengerService {
  constructor(private readonly gateway: PracticeMessengerGateway) {}

  async listForUser(userId: string, role: string) {
    const curatorGroupIds = await this.findCuratorGroupIds(userId);

    const chats = await db.query.practiceChats.findMany({
      where: role === 'super'
        ? undefined
        : or(
            eq(practiceChats.studentId, userId),
            eq(practiceChats.curatorId, userId),
            curatorGroupIds.length > 0 ? inArray(practiceChats.groupId, curatorGroupIds) : undefined,
          ),
      with: { student: true, curator: true, group: true, course: true },
      orderBy: [desc(practiceChats.updatedAt)],
    });

    const lastMessages = chats.length === 0
      ? []
      : await Promise.all(chats.map((chat) => db.query.practiceChatMessages.findFirst({
          where: eq(practiceChatMessages.chatId, chat.id),
          orderBy: [desc(practiceChatMessages.createdAt)],
        })));

    return {
      chats: chats.map((chat, index) => {
        const student = chat.student as unknown as ChatUser;
        const curator = chat.curator as unknown as ChatUser;
        const group = chat.group as unknown as ChatGroup;
        const course = chat.course as unknown as ChatCourse;
        return {
          id: chat.id,
          student: { id: student.id, name: student.name },
          curator: { id: curator.id, name: curator.name },
          groupName: group.name,
          courseTitle: course.title,
          lastMessage: lastMessages[index]
            ? {
                content: lastMessages[index]!.content,
                type: lastMessages[index]!.type,
                createdAt: lastMessages[index]!.createdAt!.toISOString(),
              }
            : null,
        };
      }),
    };
  }

  async getChat(
    chatId: string,
    userId: string,
    role: string,
    before?: string,
    timezoneOffsetMinutes = 0,
  ) {
    const chat = await this.requireChatAccess(chatId, userId, role);
    if (!before) {
      await this.markChatRead(chatId, userId);
    }
    const beforeDate = before ? new Date(before) : null;
    if (beforeDate && Number.isNaN(beforeDate.getTime())) {
      throw new BadRequestException('Xabar cursori noto‘g‘ri');
    }
    const safeTimezoneOffset = Number.isFinite(timezoneOffsetMinutes)
      ? Math.max(-840, Math.min(840, timezoneOffsetMinutes))
      : 0;
    const anchor = await db.query.practiceChatMessages.findFirst({
      where: and(
        eq(practiceChatMessages.chatId, chat.id),
        beforeDate ? lt(practiceChatMessages.createdAt, beforeDate) : undefined,
      ),
      orderBy: [desc(practiceChatMessages.createdAt)],
    });

    const shiftedAnchor = anchor?.createdAt
      ? new Date(anchor.createdAt.getTime() - safeTimezoneOffset * 60_000)
      : null;
    const dayStart = shiftedAnchor
      ? new Date(
          Date.UTC(
            shiftedAnchor.getUTCFullYear(),
            shiftedAnchor.getUTCMonth(),
            shiftedAnchor.getUTCDate(),
          ) + safeTimezoneOffset * 60_000,
        )
      : null;
    const dayEnd = dayStart
      ? new Date(dayStart.getTime() + 24 * 60 * 60 * 1000)
      : null;
    const messages = dayStart && dayEnd
      ? await db.query.practiceChatMessages.findMany({
          where: and(
            eq(practiceChatMessages.chatId, chat.id),
            gte(practiceChatMessages.createdAt, dayStart),
            lt(practiceChatMessages.createdAt, dayEnd),
          ),
          with: { sender: true, practiceBlock: true, testSubmission: true, imageSubmission: true },
          orderBy: [asc(practiceChatMessages.createdAt)],
        })
      : [];

    const imageBlockIds = [...new Set(
      messages
        .filter((message) => message.type === 'practice_image' && message.practiceBlockId)
        .map((message) => message.practiceBlockId!),
    )];
    const allImageSubmissions = imageBlockIds.length === 0
      ? []
      : await db.query.imageSubmissions.findMany({
          where: inArray(imageSubmissions.practiceBlockId, imageBlockIds),
          orderBy: [asc(imageSubmissions.submittedAt)],
        });
    const imageSubmissionsByPractice = new Map<string, typeof allImageSubmissions>();
    for (const submission of allImageSubmissions) {
      const key = `${submission.practiceBlockId}:${submission.studentId}`;
      imageSubmissionsByPractice.set(key, [
        ...(imageSubmissionsByPractice.get(key) ?? []),
        submission,
      ]);
    }
    const renderedImagePractices = new Set<string>();
    const loadedMessageIds = new Set(messages.map((message) => message.id));
    const externalReplyIds = [...new Set(
      messages
        .map((message) => message.replyToMessageId)
        .filter((id): id is string => !!id && !loadedMessageIds.has(id)),
    )];
    const externalReplyMessages = externalReplyIds.length === 0
      ? []
      : await db.query.practiceChatMessages.findMany({
          where: inArray(practiceChatMessages.id, externalReplyIds),
          with: { sender: true },
        });
    const messageById = new Map(
      [...messages, ...externalReplyMessages].map((message) => [message.id, message]),
    );
    const student = chat.student as unknown as ChatUser;
    const curator = chat.curator as unknown as ChatUser;
    const group = chat.group as unknown as ChatGroup;
    const course = chat.course as unknown as ChatCourse;

    const olderMessage = dayStart
      ? await db.query.practiceChatMessages.findFirst({
          where: and(
            eq(practiceChatMessages.chatId, chat.id),
            lt(practiceChatMessages.createdAt, dayStart),
          ),
          orderBy: [desc(practiceChatMessages.createdAt)],
        })
      : null;

    return {
      chat: {
        id: chat.id,
        student: { id: student.id, name: student.name },
        curator: { id: curator.id, name: curator.name },
        groupName: group.name,
        courseTitle: course.title,
      },
      messages: messages.flatMap((message) => {
        const imagePracticeKey = `${message.practiceBlockId}:${message.senderId}`;
        if (message.type === 'practice_image' && renderedImagePractices.has(imagePracticeKey)) {
          return [];
        }
        if (message.type === 'practice_image') renderedImagePractices.add(imagePracticeKey);
        const groupedImages = message.type === 'practice_image'
          ? imageSubmissionsByPractice.get(imagePracticeKey) ?? []
          : [];
        return [{
        id: message.id,
        sender: {
          id: (message.sender as unknown as ChatUser).id,
          name: (message.sender as unknown as ChatUser).name,
        },
        type: message.type,
        content: message.content,
        createdAt: message.createdAt!.toISOString(),
        editedAt: message.editedAt?.toISOString() ?? null,
        deletedAt: message.deletedAt?.toISOString() ?? null,
        replyTo: message.replyToMessageId
          ? (() => {
              const repliedMessage = messageById.get(message.replyToMessageId);
              return repliedMessage
                ? {
                    id: repliedMessage.id,
                    senderName: (repliedMessage.sender as unknown as ChatUser).name,
                    content: repliedMessage.deletedAt
                      ? 'Xabar o‘chirildi'
                      : repliedMessage.content,
                    type: repliedMessage.type,
                  }
                : null;
            })()
          : null,
        metadata: {
          ...message.metadata,
          maxScore:
            message.practiceBlock?.maxScore ?? message.metadata.maxScore ?? 0,
        },
        practice: message.practiceBlock
          ? {
              id: message.practiceBlock.id,
              title: message.practiceBlock.description || 'Amaliyot',
              maxScore: message.practiceBlock.maxScore,
            }
          : null,
        testSubmission: message.testSubmission
          ? { id: message.testSubmission.id, score: message.testSubmission.score, total: message.testSubmission.total }
          : null,
        imageSubmission: message.imageSubmission
          ? {
              id: message.imageSubmission.id,
              imageUrl: message.imageSubmission.imageUrl,
              score: message.imageSubmission.score,
              gradedAt: message.imageSubmission.gradedAt?.toISOString() ?? null,
            }
          : null,
        imageSubmissions: groupedImages.map((submission) => ({
          id: submission.id,
          imageUrl: submission.imageUrl,
          score: submission.score,
          gradedAt: submission.gradedAt?.toISOString() ?? null,
          submittedAt: submission.submittedAt!.toISOString(),
        })),
      }];
      }),
      hasMore: olderMessage !== undefined && olderMessage !== null,
      nextCursor: dayStart?.toISOString() ?? null,
    };
  }

  async sendText(
    chatId: string,
    senderId: string,
    role: string,
    content: string,
    replyToMessageId?: string,
  ) {
    const value = content.trim();
    if (!value) throw new BadRequestException('Xabar bo‘sh bo‘lmasligi kerak');
    const chat = await this.requireChatAccess(chatId, senderId, role);
    if (replyToMessageId) {
      const repliedMessage = await db.query.practiceChatMessages.findFirst({
        where: and(
          eq(practiceChatMessages.id, replyToMessageId),
          eq(practiceChatMessages.chatId, chat.id),
        ),
      });
      if (!repliedMessage) throw new NotFoundException('Javob beriladigan xabar topilmadi');
    }
    const [message] = await db.insert(practiceChatMessages).values({
      chatId: chat.id,
      senderId,
      type: 'text',
      content: value.slice(0, 2000),
      replyToMessageId: replyToMessageId ?? null,
    }).returning();
    await this.touchChat(chat.id);
    await this.broadcastNewMessage(
      { ...chat, courseAdminId: (chat.course as unknown as ChatCourse).adminId },
      {
        id: message.id,
        chatId: chat.id,
        senderId,
        type: 'text',
        content: message.content,
        createdAt: message.createdAt!.toISOString(),
      },
    );
    return { id: message.id, createdAt: message.createdAt!.toISOString() };
  }

  async updateText(chatId: string, messageId: string, userId: string, role: string, content: string) {
    const value = content.trim();
    if (!value) throw new BadRequestException('Xabar bo‘sh bo‘lmasligi kerak');
    await this.requireChatAccess(chatId, userId, role);
    const message = await this.requireOwnTextMessage(chatId, messageId, userId);
    const [updated] = await db.update(practiceChatMessages)
      .set({ content: value.slice(0, 2000), editedAt: new Date() })
      .where(eq(practiceChatMessages.id, message.id))
      .returning();
    await this.touchChat(chatId);
    return { id: updated.id, editedAt: updated.editedAt!.toISOString() };
  }

  async deleteText(chatId: string, messageId: string, userId: string, role: string) {
    await this.requireChatAccess(chatId, userId, role);
    const message = await this.requireOwnTextMessage(chatId, messageId, userId);
    await db.update(practiceChatMessages)
      .set({ content: '', deletedAt: new Date(), editedAt: null, replyToMessageId: null })
      .where(eq(practiceChatMessages.id, message.id));
    await this.touchChat(chatId);
  }

  async createTestSubmissionMessage(submissionId: string) {
    const submission = await db.query.submissions.findFirst({ where: eq(submissions.id, submissionId) });
    if (!submission?.userId) return;
    const block = await db.query.practiceBlocks.findFirst({ where: eq(practiceBlocks.testId, submission.testId) });
    if (!block) return;
    const context = await this.resolvePracticeContext(block, submission.userId);
    if (!context) return;

    const exists = await db.query.practiceChatMessages.findFirst({
      where: eq(practiceChatMessages.testSubmissionId, submission.id),
    });
    if (exists) return;

    const content = `${context.lesson.title} darsidagi test amaliyotini yubordi.`;
    const [message] = await db.insert(practiceChatMessages).values({
      chatId: context.chat.id,
      senderId: submission.userId,
      type: 'practice_test',
      content,
      practiceBlockId: block.id,
      testSubmissionId: submission.id,
      metadata: {
        lessonTitle: context.lesson.title,
        practiceTitle: block.description || 'Test amaliyoti',
        score: submission.score ?? 0,
        total: submission.total ?? 0,
      },
    }).returning();
    await this.touchChat(context.chat.id);
    await this.broadcastNewMessage(
      { ...context.chat, courseAdminId: context.course.adminId },
      {
        id: message.id,
        chatId: context.chat.id,
        senderId: submission.userId,
        type: 'practice_test',
        content,
        createdAt: message.createdAt!.toISOString(),
      },
    );
  }

  async createImageSubmissionMessage(imageSubmissionId: string) {
    const submission = await db.query.imageSubmissions.findFirst({ where: eq(imageSubmissions.id, imageSubmissionId) });
    if (!submission) return;
    const block = await db.query.practiceBlocks.findFirst({ where: eq(practiceBlocks.id, submission.practiceBlockId) });
    if (!block) return;
    const context = await this.resolvePracticeContext(block, submission.studentId);
    if (!context) return;

    const existingMessage = await db.query.practiceChatMessages.findFirst({
      where: and(
        eq(practiceChatMessages.chatId, context.chat.id),
        eq(practiceChatMessages.senderId, submission.studentId),
        eq(practiceChatMessages.practiceBlockId, block.id),
        eq(practiceChatMessages.type, 'practice_image'),
      ),
    });
    if (existingMessage) {
      await this.touchChat(context.chat.id);
      return;
    }

    const content = `${context.lesson.title} darsidagi rasmli topshiriqqa rasm yubordi.`;
    const [message] = await db.insert(practiceChatMessages).values({
      chatId: context.chat.id,
      senderId: submission.studentId,
      type: 'practice_image',
      content,
      practiceBlockId: block.id,
      imageSubmissionId: submission.id,
      metadata: {
        lessonTitle: context.lesson.title,
        practiceTitle: block.description || 'Rasmli topshiriq',
        maxScore: block.maxScore ?? 0,
      },
    }).returning();
    await this.touchChat(context.chat.id);
    await this.broadcastNewMessage(
      { ...context.chat, courseAdminId: context.course.adminId },
      {
        id: message.id,
        chatId: context.chat.id,
        senderId: submission.studentId,
        type: 'practice_image',
        content,
        createdAt: message.createdAt!.toISOString(),
      },
    );
  }

  async createImageGradeMessage(imageSubmissionId: string, graderId: string, score: number) {
    const submission = await db.query.imageSubmissions.findFirst({ where: eq(imageSubmissions.id, imageSubmissionId) });
    if (!submission) return;
    const block = await db.query.practiceBlocks.findFirst({ where: eq(practiceBlocks.id, submission.practiceBlockId) });
    if (!block) return;
    const context = await this.resolvePracticeContext(block, submission.studentId);
    if (!context) return;

    const content = `${block.description || 'Rasmli topshiriq'} baholandi: ${score} / ${block.maxScore ?? 0}.`;
    const metadata = { score, maxScore: block.maxScore ?? 0 };

    const existingMessage = await db.query.practiceChatMessages.findFirst({
      where: and(
        eq(practiceChatMessages.imageSubmissionId, submission.id),
        eq(practiceChatMessages.type, 'practice_grade'),
      ),
    });
    if (existingMessage) {
      const [updated] = await db
        .update(practiceChatMessages)
        .set({ senderId: graderId, content, metadata })
        .where(eq(practiceChatMessages.id, existingMessage.id))
        .returning();
      await this.touchChat(context.chat.id);
      await this.broadcastNewMessage(
        { ...context.chat, courseAdminId: context.course.adminId },
        {
          id: updated.id,
          chatId: context.chat.id,
          senderId: graderId,
          type: 'practice_grade',
          content,
          createdAt: updated.createdAt!.toISOString(),
        },
      );
      return;
    }

    const [message] = await db.insert(practiceChatMessages).values({
      chatId: context.chat.id,
      senderId: graderId,
      type: 'practice_grade',
      content,
      practiceBlockId: block.id,
      imageSubmissionId: submission.id,
      metadata,
    }).returning();
    await this.touchChat(context.chat.id);
    await this.broadcastNewMessage(
      { ...context.chat, courseAdminId: context.course.adminId },
      {
        id: message.id,
        chatId: context.chat.id,
        senderId: graderId,
        type: 'practice_grade',
        content,
        createdAt: message.createdAt!.toISOString(),
      },
    );
  }

  private async resolvePracticeContext(block: typeof practiceBlocks.$inferSelect, studentId: string): Promise<PracticeContext | null> {
    const lesson = await db.query.lessons.findFirst({ where: eq(lessons.id, block.lessonId) });
    if (!lesson) return null;
    const module = await db.query.modules.findFirst({ where: eq(modules.id, lesson.moduleId) });
    if (!module) return null;
    const course = await db.query.courses.findFirst({ where: eq(courses.id, module.courseId) });
    if (!course) return null;

    const studentMembers = await db.query.schoolMembers.findMany({
      where: and(eq(schoolMembers.studentId, studentId), eq(schoolMembers.role, 'student')),
    });
    if (studentMembers.length === 0) return null;
    const enrollments = await db.query.groupEnrollments.findMany({
      where: (enrollment, operators) => and(
        operators.inArray(groupEnrollments.schoolMemberId, studentMembers.map((member) => member.id)),
        isNull(groupEnrollments.removedAt),
      ),
    });
    if (enrollments.length === 0) return null;
    const possibleGroups = await db.query.groups.findMany({
      where: (group, operators) => operators.inArray(groups.id, enrollments.map((enrollment) => enrollment.groupId)),
    });
    const group = possibleGroups.find((item) => item.courseId === course.id);
    if (!group) return null;

    const curatorEnrollments = await db.query.groupEnrollments.findMany({
      where: and(eq(groupEnrollments.groupId, group.id), isNull(groupEnrollments.removedAt)),
      with: { schoolMember: true },
    });
    const curator = (curatorEnrollments as unknown as CuratorMembership[])
      .find((enrollment) => enrollment.schoolMember?.role === 'curator');
    const curatorId = curator?.schoolMember?.studentId ?? course.adminId;

    const [chat] = await db.insert(practiceChats).values({
      groupId: group.id,
      courseId: course.id,
      studentId,
      curatorId,
    }).onConflictDoUpdate({
      target: [practiceChats.groupId, practiceChats.studentId],
      set: { curatorId, updatedAt: new Date() },
    }).returning();
    return { chat, block, lesson, course };
  }

  // All groups where userId is currently an active curator (school-membership
  // scoped, mirrors the resolution used by requireChatAccess/isCuratorOfChatGroup
  // and the grading-authorization checks in practice-blocks.service.ts).
  private async findCuratorGroupIds(userId: string): Promise<string[]> {
    const curatorMemberships = await db.query.schoolMembers.findMany({
      where: and(eq(schoolMembers.studentId, userId), eq(schoolMembers.role, 'curator')),
      with: { enrollments: true },
    });
    return curatorMemberships.flatMap((member) =>
      member.enrollments.filter((enrollment) => !enrollment.removedAt).map((enrollment) => enrollment.groupId),
    );
  }

  private async requireChatAccess(chatId: string, userId: string, role: string) {
    const chat = await db.query.practiceChats.findFirst({
      where: eq(practiceChats.id, chatId),
      with: { student: true, curator: true, group: true, course: true },
    });
    if (!chat) throw new NotFoundException('Chat topilmadi');
    const course = chat.course as unknown as ChatCourse;
    if (role === 'super' || chat.studentId === userId || chat.curatorId === userId || course.adminId === userId) return chat;
    if (await this.isCuratorOfChatGroup(chat.groupId, chat.studentId, userId)) return chat;
    throw new ForbiddenException('Bu chatga kirish huquqingiz yo‘q');
  }

  // A chat is bound to a single curatorId at creation time (see resolvePracticeContext),
  // but a group can have more than one curator, and the grader validated by
  // assertCanGradeImage/assertCanGradeOral (practice-blocks.service.ts) isn't
  // necessarily the one stored on the chat. Any curator sharing the student's
  // school and this group must still be able to open the chat their grade wrote into.
  private async isCuratorOfChatGroup(groupId: string, studentId: string, graderId: string) {
    const studentMembership = await db.query.schoolMembers.findFirst({
      where: and(eq(schoolMembers.studentId, studentId), eq(schoolMembers.role, 'student')),
    });
    const curatorMembership = await db.query.schoolMembers.findFirst({
      where: and(eq(schoolMembers.studentId, graderId), eq(schoolMembers.role, 'curator')),
    });
    if (!studentMembership || !curatorMembership || studentMembership.schoolId !== curatorMembership.schoolId) {
      return false;
    }
    const curatorEnrollment = await db.query.groupEnrollments.findFirst({
      where: and(
        eq(groupEnrollments.schoolMemberId, curatorMembership.id),
        eq(groupEnrollments.groupId, groupId),
        isNull(groupEnrollments.removedAt),
      ),
    });
    return !!curatorEnrollment;
  }

  // Everyone who should receive a real-time notification for this chat:
  // the student, the course-owning admin, and every currently-active
  // curator of the chat's group (not just the single curatorId frozen on
  // the chat row — see isCuratorOfChatGroup for why that's insufficient).
  private async resolveChatRecipientIds(chat: {
    studentId: string;
    curatorId: string;
    groupId: string;
    courseAdminId: string;
  }): Promise<string[]> {
    const recipientIds = new Set<string>([chat.studentId, chat.curatorId, chat.courseAdminId]);

    const curatorEnrollments = await db.query.groupEnrollments.findMany({
      where: and(eq(groupEnrollments.groupId, chat.groupId), isNull(groupEnrollments.removedAt)),
      with: { schoolMember: true },
    });
    for (const enrollment of curatorEnrollments as unknown as CuratorMembership[]) {
      if (enrollment.schoolMember?.role === 'curator') {
        recipientIds.add(enrollment.schoolMember.studentId);
      }
    }

    return [...recipientIds];
  }

  private async requireOwnTextMessage(chatId: string, messageId: string, userId: string) {
    const message = await db.query.practiceChatMessages.findFirst({
      where: and(
        eq(practiceChatMessages.id, messageId),
        eq(practiceChatMessages.chatId, chatId),
      ),
    });
    if (!message) throw new NotFoundException('Xabar topilmadi');
    if (message.senderId !== userId) throw new ForbiddenException('Faqat o‘z xabaringizni o‘zgartira olasiz');
    if (message.type !== 'text') throw new BadRequestException('Amaliyot xabarini o‘zgartirib bo‘lmaydi');
    if (message.deletedAt) throw new BadRequestException('Xabar allaqachon o‘chirilgan');
    return message;
  }

  private async touchChat(chatId: string) {
    await db.update(practiceChats).set({ updatedAt: new Date() }).where(eq(practiceChats.id, chatId));
  }

  private async markChatRead(chatId: string, userId: string) {
    await db.insert(practiceChatReads).values({ chatId, userId, lastReadAt: new Date() }).onConflictDoUpdate({
      target: [practiceChatReads.chatId, practiceChatReads.userId],
      set: { lastReadAt: new Date() },
    });
  }

  // Chat ids with at least one message newer than this user's last-read
  // timestamp (or never read at all, if the chat exists but no read row
  // does — treated as unread), across every chat the user participates in
  // (student, curator of the group, or course admin — same scoping as
  // listForUser).
  async getUnreadChatIds(userId: string, role: string): Promise<string[]> {
    const curatorGroupIds = await this.findCuratorGroupIds(userId);
    const chats = await db.query.practiceChats.findMany({
      where: role === 'super'
        ? undefined
        : or(
            eq(practiceChats.studentId, userId),
            eq(practiceChats.curatorId, userId),
            curatorGroupIds.length > 0 ? inArray(practiceChats.groupId, curatorGroupIds) : undefined,
          ),
    });
    if (chats.length === 0) return [];

    const chatIds = chats.map((chat) => chat.id);
    const reads = await db.query.practiceChatReads.findMany({
      where: and(inArray(practiceChatReads.chatId, chatIds), eq(practiceChatReads.userId, userId)),
    });
    const lastReadByChatId = new Map(reads.map((read) => [read.chatId, read.lastReadAt]));

    const lastMessages = await Promise.all(
      chats.map((chat) => db.query.practiceChatMessages.findFirst({
        where: eq(practiceChatMessages.chatId, chat.id),
        orderBy: [desc(practiceChatMessages.createdAt)],
      })),
    );

    return chats
      .filter((chat, index) => {
        const lastMessage = lastMessages[index];
        if (!lastMessage || lastMessage.senderId === userId) return false;
        const lastReadAt = lastReadByChatId.get(chat.id);
        return !lastReadAt || lastMessage.createdAt!.getTime() > lastReadAt.getTime();
      })
      .map((chat) => chat.id);
  }

  private async broadcastNewMessage(
    chat: { id: string; studentId: string; curatorId: string; groupId: string; courseAdminId: string },
    message: { id: string; chatId: string; senderId: string; type: string; content: string; createdAt: string },
  ) {
    const recipientIds = await this.resolveChatRecipientIds(chat);
    const notifyIds = recipientIds.filter((id) => id !== message.senderId);
    if (notifyIds.length === 0) return;
    this.gateway.notifyNewMessage(notifyIds, message);
  }
}
