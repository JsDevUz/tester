import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  Loader2,
  MessageCircle,
  X,
} from "lucide-react";
import { toast } from "sonner";
import {
  apiGradeImageSubmission,
  apiGradeTestPracticeSubmission,
} from "../api/practiceBlocks";
import { apiGetSubmission, type SubmissionDetail } from "../api/submissions";
import { AnswerResultCard } from "../components/AnswerResultCard";
import {
  apiGetPracticeChat,
  apiGetPracticeChats,
  apiDeletePracticeMessage,
  apiSendPracticeMessage,
  apiUpdatePracticeMessage,
  type ApiPracticeChat,
  type ApiPracticeChatPreview,
  type ApiPracticeMessage,
} from "../api/practiceMessenger";
import { AppShell } from "../components/AppShell";
import { StudentShell } from "../components/student/StudentShell";
import { useAuthStore } from "../stores/authStore";
import { usePracticeMessengerStore } from "../stores/practiceMessengerStore";
import {
  connectPracticeMessengerSocket,
  type PracticeMessengerSocketPayload,
} from "../api/practiceMessengerSocket";
import { PracticeChatList } from "../components/practice-messenger/PracticeChatList";
import { PracticeChatHeader } from "../components/practice-messenger/PracticeChatHeader";
import { PracticeMessageBubble } from "../components/practice-messenger/PracticeMessageBubble";
import { PracticeMessageInput } from "../components/practice-messenger/PracticeMessageInput";
import { messageDateKey, messageDateLabel } from "../components/practice-messenger/practiceMessengerUtils";

function PracticeMessengerContent() {
  const navigate = useNavigate();
  const admin = useAuthStore((state) => state.admin);
  const token = useAuthStore((state) => state.token);
  const setActiveChatId = usePracticeMessengerStore((state) => state.setActiveChatId);
  const [searchParams] = useSearchParams();
  const requestedCourseId = searchParams.get("courseId");
  const [chats, setChats] = useState<ApiPracticeChatPreview[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedChat, setSelectedChat] = useState<ApiPracticeChat | null>(null);
  const [messages, setMessages] = useState<ApiPracticeMessage[]>([]);
  const [query, setQuery] = useState("");
  const [mobileThreadOpen, setMobileThreadOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [replyingTo, setReplyingTo] = useState<ApiPracticeMessage | null>(null);
  const [editingMessage, setEditingMessage] = useState<ApiPracticeMessage | null>(null);
  const [scoreByMessage, setScoreByMessage] = useState<Record<string, string>>({});
  const [editingGradeMessageId, setEditingGradeMessageId] = useState<string | null>(null);
  const [activeMessageActionsId, setActiveMessageActionsId] = useState<string | null>(null);
  const [messagePendingDelete, setMessagePendingDelete] = useState<ApiPracticeMessage | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingChat, setLoadingChat] = useState(false);
  const [loadingOlderMessages, setLoadingOlderMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [deletingMessage, setDeletingMessage] = useState(false);
  const [fullscreenImage, setFullscreenImage] = useState<string | null>(null);
  const [testDetail, setTestDetail] = useState<SubmissionDetail | null>(null);
  const [loadingTestDetail, setLoadingTestDetail] = useState(false);
  const [activePinnedIndex, setActivePinnedIndex] = useState(0);
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null);
  const messageScrollRef = useRef<HTMLDivElement>(null);
  const draftRef = useRef<HTMLTextAreaElement>(null);
  const messageRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const selectedIdRef = useRef<string | null>(null);
  const nextCursorRef = useRef<string | null>(null);
  const loadingOlderMessagesRef = useRef(false);
  const hasOlderMessagesRef = useRef(false);
  const scrollToBottomAfterRenderRef = useRef(false);

  async function loadChats() {
    setLoading(true);
    try {
      const result = await apiGetPracticeChats();
      setChats(result.chats);
      setSelectedId((current) => {
        if (requestedCourseId) {
          const matching = result.chats.find((chat) => chat.courseId === requestedCourseId);
          if (matching) return matching.id;
        }
        return current && result.chats.some((chat) => chat.id === current) ? current : null;
      });
    } catch (error: any) {
      toast.error(error?.response?.data?.message ?? "Chatlarni yuklab bo‘lmadi");
    } finally {
      setLoading(false);
    }
  }

  async function loadChat(chatId: string) {
    setLoadingChat(true);
    setLoadingOlderMessages(false);
    loadingOlderMessagesRef.current = false;
    hasOlderMessagesRef.current = false;
    nextCursorRef.current = null;
    try {
      const result = await apiGetPracticeChat(chatId);
      if (selectedIdRef.current !== chatId) return;
      setSelectedChat(result.chat);
      setMessages(result.messages);
      hasOlderMessagesRef.current = result.hasMore;
      nextCursorRef.current = result.nextCursor;
      window.requestAnimationFrame(() => {
        const container = messageScrollRef.current;
        if (container) container.scrollTop = container.scrollHeight;
      });
    } catch (error: any) {
      toast.error(error?.response?.data?.message ?? "Chatni yuklab bo‘lmadi");
    } finally {
      if (selectedIdRef.current === chatId) setLoadingChat(false);
    }
  }

  async function loadOlderMessages() {
    const chatId = selectedIdRef.current;
    const cursor = nextCursorRef.current;
    if (!chatId || !cursor || !hasOlderMessagesRef.current || loadingOlderMessagesRef.current) {
      return;
    }

    const container = messageScrollRef.current;
    const previousScrollHeight = container?.scrollHeight ?? 0;
    loadingOlderMessagesRef.current = true;
    setLoadingOlderMessages(true);
    try {
      const result = await apiGetPracticeChat(chatId, cursor);
      if (selectedIdRef.current !== chatId) return;
      setSelectedChat(result.chat);
      setMessages((current) => {
        const currentIds = new Set(current.map((message) => message.id));
        const older = result.messages.filter((message) => !currentIds.has(message.id));
        return [...older, ...current];
      });
      hasOlderMessagesRef.current = result.hasMore;
      nextCursorRef.current = result.nextCursor;
      window.requestAnimationFrame(() => {
        const nextContainer = messageScrollRef.current;
        if (!nextContainer) return;
        const addedHeight = nextContainer.scrollHeight - previousScrollHeight;
        nextContainer.scrollTop = Math.max(0, addedHeight);
      });
    } catch (error: any) {
      toast.error(error?.response?.data?.message ?? "Eski xabarlarni yuklab bo‘lmadi");
    } finally {
      loadingOlderMessagesRef.current = false;
      setLoadingOlderMessages(false);
    }
  }

  useEffect(() => {
    void loadChats();
  }, [requestedCourseId]);

  useEffect(() => {
    selectedIdRef.current = selectedId;
    setActiveChatId(selectedId);
    if (!selectedId) {
      setSelectedChat(null);
      setMessages([]);
      hasOlderMessagesRef.current = false;
      nextCursorRef.current = null;
      return;
    }
    void loadChat(selectedId);
  }, [selectedId, setActiveChatId]);

  useEffect(() => {
    return () => {
      setActiveChatId(null);
    };
  }, [setActiveChatId]);

  useEffect(() => {
    if (!scrollToBottomAfterRenderRef.current) return;
    const container = messageScrollRef.current;
    if (!container) return;
    container.scrollTop = container.scrollHeight;
    scrollToBottomAfterRenderRef.current = false;
  }, [messages]);

  useEffect(() => {
    if (!token) return undefined;
    const socket = connectPracticeMessengerSocket(token);

    const handleNewMessage = (payload: PracticeMessengerSocketPayload) => {
      setChats((current) =>
        current
          .map((chat) =>
            chat.id === payload.chatId
              ? {
                  ...chat,
                  lastMessage: {
                    content: payload.content,
                    type: payload.type,
                    createdAt: payload.createdAt,
                  },
                }
              : chat,
          )
          .sort((a, b) => {
            const timeA = a.lastMessage ? new Date(a.lastMessage.createdAt).getTime() : 0;
            const timeB = b.lastMessage ? new Date(b.lastMessage.createdAt).getTime() : 0;
            return timeB - timeA;
          }),
      );

      if (payload.chatId !== selectedIdRef.current) return;
      setMessages((current) => {
        if (current.some((item) => item.id === payload.id)) {
          return current.map((item) =>
            item.id === payload.id
              ? {
                  ...item,
                  content: payload.content,
                  type: payload.type as any,
                  createdAt: payload.createdAt,
                }
              : item,
          );
        }
        if (selectedIdRef.current) {
          void loadChat(selectedIdRef.current);
        }
        return current;
      });

      const container = messageScrollRef.current;
      const isNearBottom =
        !container ||
        container.scrollHeight - container.scrollTop - container.clientHeight < 120;
      if (isNearBottom || payload.senderId === admin?.id) {
        scrollToBottomAfterRenderRef.current = true;
      }
    };

    const handleMessageUpdated = (payload: PracticeMessengerSocketPayload) => {
      setChats((current) =>
        current.map((chat) =>
          chat.id === payload.chatId && chat.lastMessage
            ? {
                ...chat,
                lastMessage: {
                  ...chat.lastMessage,
                  content: payload.content,
                  type: payload.type,
                },
              }
            : chat,
        ),
      );

      if (payload.chatId !== selectedIdRef.current) return;
      setMessages((current) =>
        current.map((item) =>
          item.id === payload.id
            ? {
                ...item,
                content: payload.content,
                editedAt: payload.editedAt ?? new Date().toISOString(),
              }
            : item,
        ),
      );
    };

    const handleMessageDeleted = (payload: { chatId: string; messageId: string }) => {
      setChats((current) =>
        current.map((chat) =>
          chat.id === payload.chatId && chat.lastMessage
            ? {
                ...chat,
                lastMessage: {
                  ...chat.lastMessage,
                  content: "Xabar o‘chirildi",
                },
              }
            : chat,
        ),
      );

      if (payload.chatId !== selectedIdRef.current) return;
      setMessages((current) =>
        current.map((item) =>
          item.id === payload.messageId
            ? {
                ...item,
                content: "Xabar o‘chirildi",
                deletedAt: new Date().toISOString(),
              }
            : item,
        ),
      );
    };

    socket.on("practice:message:new", handleNewMessage);
    socket.on("practice:message:updated", handleMessageUpdated);
    socket.on("practice:message:deleted", handleMessageDeleted);

    return () => {
      socket.off("practice:message:new", handleNewMessage);
      socket.off("practice:message:updated", handleMessageUpdated);
      socket.off("practice:message:deleted", handleMessageDeleted);
    };
  }, [token, admin?.id]);

  const isCurator = admin?.role === "curator" || admin?.role === "super";

  const pinnedMessages = useMemo(
    () => messages.filter((message) => message.type !== "text" && !message.deletedAt),
    [messages],
  );

  function focusPreviousPinnedMessage() {
    if (pinnedMessages.length === 0) return;
    const nextIndex = (activePinnedIndex + 1) % pinnedMessages.length;
    const target = pinnedMessages[nextIndex];
    if (!target) return;
    setActivePinnedIndex(nextIndex);
    const element = messageRefs.current[target.id];
    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "center" });
      setHighlightedMessageId(target.id);
      window.setTimeout(() => {
        setHighlightedMessageId((current) => (current === target.id ? null : current));
      }, 1600);
    }
  }

  function startReply(message: ApiPracticeMessage) {
    setActiveMessageActionsId(null);
    setEditingMessage(null);
    setReplyingTo(message);
    draftRef.current?.focus();
  }

  function startEditing(message: ApiPracticeMessage) {
    setActiveMessageActionsId(null);
    setReplyingTo(null);
    setEditingMessage(message);
    setDraft(message.content);
  }

  function cancelMessageAction() {
    setReplyingTo(null);
    setEditingMessage(null);
    setDraft("");
  }

  async function deleteMessage(message: ApiPracticeMessage) {
    if (!selectedChat) return;
    setActiveMessageActionsId(null);
    setDeletingMessage(true);
    try {
      await apiDeletePracticeMessage(selectedChat.id, message.id);
      toast.success("Xabar o‘chirildi");
      setMessagePendingDelete(null);
      if (editingMessage?.id === message.id) cancelMessageAction();
      setMessages((current) => current.filter((item) => item.id !== message.id));
    } catch (error: any) {
      toast.error(error?.response?.data?.message ?? "Xabarni o‘chirib bo‘lmadi");
    } finally {
      setDeletingMessage(false);
    }
  }

  async function sendMessage() {
    if (!selectedChat || !draft.trim() || sending) return;
    const content = draft.trim();
    setSending(true);
    try {
      if (editingMessage) {
        await apiUpdatePracticeMessage(selectedChat.id, editingMessage.id, content);
        setMessages((current) =>
          current.map((item) =>
            item.id === editingMessage.id
              ? { ...item, content, editedAt: new Date().toISOString() }
              : item,
          ),
        );
        cancelMessageAction();
        toast.success("Xabar tahrirlandi");
      } else {
        const created = await apiSendPracticeMessage(
          selectedChat.id,
          content,
          replyingTo ? replyingTo.id : undefined,
        );
        const newMessage: ApiPracticeMessage = {
          id: created.id,
          sender: {
            id: admin?.id ?? "",
            name: admin?.name ?? "Siz",
            avatarUrl: admin?.avatarUrl ?? null,
          },
          type: "text",
          content,
          createdAt: created.createdAt,
          editedAt: null,
          deletedAt: null,
          replyTo: replyingTo
            ? {
                id: replyingTo.id,
                senderName: replyingTo.sender.name,
                content: replyingTo.content,
                type: replyingTo.type,
              }
            : null,
          metadata: {},
          practice: null,
          testSubmission: null,
          imageSubmission: null,
          imageSubmissions: [],
        };
        setMessages((current) => [...current, newMessage]);
        setChats((current) =>
          current.map((c) =>
            c.id === selectedChat.id
              ? {
                  ...c,
                  lastMessage: {
                    content,
                    type: "text",
                    createdAt: created.createdAt,
                  },
                }
              : c,
          ),
        );
        cancelMessageAction();
        scrollToBottomAfterRenderRef.current = true;
      }
    } catch (error: any) {
      toast.error(error?.response?.data?.message ?? "Xabarni yuborib bo‘lmadi");
    } finally {
      setSending(false);
    }
  }

  async function gradeImage(message: ApiPracticeMessage) {
    const image = message.imageSubmissions[0] ?? message.imageSubmission;
    const maximum = Number(message.practice?.maxScore ?? message.metadata.maxScore ?? 0);
    const score = Number(scoreByMessage[message.id]);
    if (!image || !Number.isInteger(score) || score < 0 || (maximum > 0 && score > maximum)) {
      toast.error(
        maximum > 0
          ? `Yulduz 0 dan ${maximum} gacha bo‘lishi kerak`
          : "Yulduz manfiy bo‘lmasligi kerak",
      );
      return;
    }
    try {
      const wasEditing = editingGradeMessageId === message.id;
      await apiGradeImageSubmission(image.id, score);
      setEditingGradeMessageId(null);
      setScoreByMessage((state) => {
        const next = { ...state };
        delete next[message.id];
        return next;
      });
      toast.success(wasEditing ? "Baho yangilandi" : "Topshiriq baholandi");
      if (selectedChat) await Promise.all([loadChat(selectedChat.id), loadChats()]);
    } catch (error: any) {
      toast.error(error?.response?.data?.message ?? "Baholashda xatolik yuz berdi");
    }
  }

  async function gradeTestPractice(message: ApiPracticeMessage) {
    const maximum = Number(message.practice?.maxScore ?? 0);
    const score = Number(scoreByMessage[message.id]);
    if (!message.testSubmission || maximum <= 0 || !Number.isInteger(score) || score < 0 || score > maximum) {
      toast.error(`Yulduz 0 dan ${maximum} gacha bo‘lishi kerak`);
      return;
    }
    try {
      await apiGradeTestPracticeSubmission(message.testSubmission.id, score);
      setEditingGradeMessageId(null);
      setScoreByMessage((state) => {
        const next = { ...state };
        delete next[message.id];
        return next;
      });
      toast.success("Test amaliyoti yulduzi yangilandi");
      if (selectedChat) await Promise.all([loadChat(selectedChat.id), loadChats()]);
    } catch (error: any) {
      toast.error(error?.response?.data?.message ?? "Yulduzni saqlab bo‘lmadi");
    }
  }

  function startEditingImageGrade(message: ApiPracticeMessage, score: number) {
    setEditingGradeMessageId(message.id);
    setScoreByMessage((state) => ({ ...state, [message.id]: String(score) }));
  }

  function cancelEditingImageGrade(messageId: string) {
    setEditingGradeMessageId(null);
    setScoreByMessage((state) => {
      const next = { ...state };
      delete next[messageId];
      return next;
    });
  }

  async function openTestResult(message: ApiPracticeMessage) {
    if (!message.testSubmission) return;
    if (!isCurator) {
      navigate(`/history/${message.testSubmission.id}`);
      return;
    }
    setLoadingTestDetail(true);
    setTestDetail(null);
    try {
      const detail = await apiGetSubmission(message.testSubmission.id);
      setTestDetail(detail);
    } catch (error: any) {
      toast.error(error?.response?.data?.message ?? "Test natijasini yuklab bo‘lmadi");
    } finally {
      setLoadingTestDetail(false);
    }
  }

  return (
    <div className="practice-messenger-root flex h-full min-h-0 flex-col overflow-hidden lg:rounded-3xl shadow-none border border-black/10 dark:border-white/10">
      {activeMessageActionsId && (
        <div
          className="fixed inset-0 z-40 bg-transparent"
          onClick={() => setActiveMessageActionsId(null)}
        />
      )}
      <div className="grid min-h-0 flex-1 overflow-hidden lg:grid-cols-[360px_minmax(0,1fr)]">
        <PracticeChatList
          chats={chats}
          selectedId={selectedId}
          query={query}
          loading={loading}
          mobileThreadOpen={mobileThreadOpen}
          currentUserId={admin?.id}
          onQueryChange={setQuery}
          onSelectChat={(chatId) => {
            setSelectedId(chatId);
            setMobileThreadOpen(true);
          }}
        />

        <section
          className={`practice-messenger-thread min-h-0 min-w-0 flex-col overflow-hidden lg:flex ${
            mobileThreadOpen ? "flex" : "hidden"
          }`}
        >
          {!selectedChat ? (
            <div className="flex flex-1 flex-col items-center justify-center px-6 text-center text-[var(--text-muted)]">
              <MessageCircle size={48} className="mb-3 opacity-30 text-[var(--text-primary)]" />
              <p className="font-bold text-[var(--text-primary)]">Amaliyot chatini tanlang</p>
              <p className="mt-1 text-sm text-[var(--text-muted)]">Yangi topshiriqlar va xabarlar shu yerda turadi.</p>
            </div>
          ) : (
            <>
              <PracticeChatHeader
                chat={selectedChat}
                isCurator={isCurator}
                pinnedMessages={pinnedMessages}
                activePinnedIndex={activePinnedIndex}
                onBack={() => setMobileThreadOpen(false)}
                onFocusPreviousPinned={focusPreviousPinnedMessage}
              />

              <div
                ref={messageScrollRef}
                onScroll={(e) => {
                  if (e.currentTarget.scrollTop <= 24) {
                    void loadOlderMessages();
                  }
                }}
                className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 sm:p-5"
              >
                {loadingChat ? (
                  <div className="flex justify-center py-12 text-[var(--text-muted)]">
                    <Loader2 className="animate-spin" size={24} />
                  </div>
                ) : (
                  <>
                    {loadingOlderMessages && (
                      <div className="sticky top-1 z-10 mb-2 flex justify-center">
                        <span className="flex items-center gap-2 rounded-full bg-[var(--card-bg)] px-3 py-1.5 text-xs font-semibold text-[var(--text-muted)]">
                          <Loader2 className="animate-spin" size={14} /> Oldingi xabarlar yuklanmoqda...
                        </span>
                      </div>
                    )}
                    <div className="mx-auto flex w-full max-w-5xl flex-col gap-2">
                      {messages.map((message, index) => {
                        const startsDateGroup =
                          index === 0 ||
                          messageDateKey(message.createdAt) !==
                            messageDateKey(messages[index - 1].createdAt);
                        return (
                          <Fragment key={message.id}>
                            {startsDateGroup && (
                              <div className="practice-message-date sticky top-0 z-[1] flex justify-center py-1.5">
                                <span className="rounded-full bg-[var(--card-bg)] px-3 py-1 text-xs font-semibold text-[var(--text-muted)]">
                                  {messageDateLabel(message.createdAt)}
                                </span>
                              </div>
                            )}
                            <PracticeMessageBubble
                              message={message}
                              currentUserId={admin?.id}
                              isCurator={isCurator}
                              activeMessageActionsId={activeMessageActionsId}
                              highlighted={highlightedMessageId === message.id}
                              scoreByMessage={scoreByMessage}
                              editingGradeMessageId={editingGradeMessageId}
                              onSetMessageRef={(el) => {
                                messageRefs.current[message.id] = el;
                              }}
                              onToggleActions={setActiveMessageActionsId}
                              onReply={startReply}
                              onStartEditing={startEditing}
                              onDeletePrompt={setMessagePendingDelete}
                              onOpenTestResult={openTestResult}
                              onGradeImage={gradeImage}
                              onGradeTest={gradeTestPractice}
                              onStartEditingImageGrade={startEditingImageGrade}
                              onCancelEditingImageGrade={cancelEditingImageGrade}
                              onScoreChange={(messageId, val) =>
                                setScoreByMessage((state) => ({ ...state, [messageId]: val }))
                              }
                              onOpenFullscreenImage={setFullscreenImage}
                            />
                          </Fragment>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>

              <PracticeMessageInput
                draft={draft}
                sending={sending}
                replyingTo={replyingTo}
                editingMessage={editingMessage}
                draftRef={draftRef}
                onDraftChange={setDraft}
                onSend={sendMessage}
                onCancelAction={cancelMessageAction}
              />
            </>
          )}
        </section>
      </div>

      {messagePendingDelete && (
        <div
          className="fixed inset-0 z-[100] flex items-end justify-center bg-black/50 p-4 sm:items-center"
          onClick={(e) => {
            if (e.target === e.currentTarget && !deletingMessage) {
              setMessagePendingDelete(null);
            }
          }}
        >
          <div className="w-full max-w-sm rounded-3xl bg-[var(--surface-bg)] p-6 shadow-2xl">
            <h2 className="text-base font-bold text-[var(--text-primary)]">Xabarni o‘chirish</h2>
            <p className="mt-2 text-sm leading-5 text-[var(--text-muted)]">
              Bu xabarni o‘chirmoqchimisiz? Bu amalni ortga qaytarib bo‘lmaydi.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setMessagePendingDelete(null)}
                disabled={deletingMessage}
                className="rounded-xl bg-black/5 dark:bg-white/5 px-4 py-2.5 text-sm font-bold text-[var(--text-primary)] transition-colors hover:bg-black/10 dark:hover:bg-white/10 disabled:opacity-50 cursor-pointer"
              >
                Bekor qilish
              </button>
              <button
                type="button"
                onClick={() => void deleteMessage(messagePendingDelete)}
                disabled={deletingMessage}
                className="inline-flex min-w-24 items-center justify-center rounded-xl bg-red-600 px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-red-700 disabled:opacity-60 cursor-pointer"
              >
                {deletingMessage ? <Loader2 size={16} className="animate-spin" /> : "O‘chirish"}
              </button>
            </div>
          </div>
        </div>
      )}

      {fullscreenImage && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 p-4"
          onClick={() => setFullscreenImage(null)}
        >
          <button
            type="button"
            onClick={() => setFullscreenImage(null)}
            className="absolute right-5 top-5 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
            aria-label="Rasmni yopish"
          >
            <X size={22} />
          </button>
          <img
            src={fullscreenImage}
            alt="O‘quvchi yuborgan rasm"
            className="max-h-full max-w-full rounded-lg object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}

      {(loadingTestDetail || testDetail) && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
          <div className="flex max-h-[min(720px,calc(100vh-2rem))] w-full max-w-2xl flex-col overflow-hidden rounded-3xl bg-[var(--surface-bg)] shadow-2xl">
            <div className="flex items-center justify-between border-b border-black/5 dark:border-white/5 px-6 py-4">
              <div>
                <p className="text-base font-bold text-[var(--text-primary)]">Test natijasi</p>
                {testDetail && (
                  <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                    {testDetail.score ?? 0} / {testDetail.total ?? 0} yulduz
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => setTestDetail(null)}
                className="rounded-lg p-1.5 text-[var(--text-muted)] hover:bg-black/5 dark:hover:bg-white/10 hover:text-[var(--text-primary)] transition-colors cursor-pointer"
                aria-label="Natijani yopish"
              >
                <X size={20} />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-5">
              {loadingTestDetail ? (
                <div className="flex justify-center py-12 text-[var(--text-muted)]">
                  <Loader2 className="animate-spin" size={24} />
                </div>
              ) : testDetail?.answers.length ? (
                <div className="flex flex-col gap-2">
                  {testDetail.answers.map((answer, index) => (
                    <AnswerResultCard key={answer.questionId} answer={answer} index={index} />
                  ))}
                </div>
              ) : (
                <p className="py-10 text-center text-sm text-[var(--text-muted)]">Javoblar topilmadi.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function PracticeMessengerPage() {
  const admin = useAuthStore((state) => state.admin);
  const content = <PracticeMessengerContent />;
  return admin?.role === "student" ? (
    <StudentShell>{content}</StudentShell>
  ) : (
    <AppShell>{content}</AppShell>
  );
}
