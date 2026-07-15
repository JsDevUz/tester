import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  ChevronUp,
  ClipboardCheck,
  ImageIcon,
  Loader2,
  Maximize2,
  MessageCircle,
  Pencil,
  Pin,
  Reply,
  Search,
  Send,
  Star,
  Trash2,
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
import { UserAvatar } from "../components/UserAvatar";
import { useAuthStore } from "../stores/authStore";
import { usePracticeMessengerStore } from "../stores/practiceMessengerStore";
import {
  connectPracticeMessengerSocket,
  type PracticeMessengerSocketPayload,
} from "../api/practiceMessengerSocket";
import { formatDateTime } from "../utils/date";

function previewText(chat: ApiPracticeChatPreview) {
  if (!chat.lastMessage) return "Yangi amaliyot xabarlari shu yerda chiqadi";
  if (chat.lastMessage.type === "practice_test")
    return "Test natijasi yuborildi";
  if (chat.lastMessage.type === "practice_image")
    return "Rasmli topshiriq yuborildi";
  if (chat.lastMessage.type === "practice_grade") return "Topshiriq baholandi";
  return chat.lastMessage.content;
}

function messageDateKey(value: string | Date) {
  const date = new Date(value);
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function messageDateLabel(value: string) {
  const date = new Date(value);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);

  if (messageDateKey(value) === messageDateKey(today)) {
    return "Bugun";
  }
  if (messageDateKey(value) === messageDateKey(yesterday)) {
    return "Kecha";
  }

  return new Intl.DateTimeFormat("uz-UZ", {
    day: "numeric",
    month: "long",
    year: date.getFullYear() === today.getFullYear() ? undefined : "numeric",
  }).format(date);
}

function messageTime(value: string) {
  return new Intl.DateTimeFormat("uz-UZ", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

function PracticeMessengerContent() {
  const navigate = useNavigate();
  const admin = useAuthStore((state) => state.admin);
  const token = useAuthStore((state) => state.token);
  const setActiveChatId = usePracticeMessengerStore(
    (state) => state.setActiveChatId,
  );
  const [searchParams] = useSearchParams();
  const requestedCourseId = searchParams.get("courseId");
  const [chats, setChats] = useState<ApiPracticeChatPreview[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedChat, setSelectedChat] = useState<ApiPracticeChat | null>(
    null,
  );
  const [messages, setMessages] = useState<ApiPracticeMessage[]>([]);
  const [query, setQuery] = useState("");
  const [mobileThreadOpen, setMobileThreadOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [replyingTo, setReplyingTo] = useState<ApiPracticeMessage | null>(null);
  const [editingMessage, setEditingMessage] =
    useState<ApiPracticeMessage | null>(null);
  const [scoreByMessage, setScoreByMessage] = useState<Record<string, string>>(
    {},
  );
  const [editingGradeMessageId, setEditingGradeMessageId] = useState<
    string | null
  >(null);
  const [activeMessageActionsId, setActiveMessageActionsId] = useState<
    string | null
  >(null);
  const [messagePendingDelete, setMessagePendingDelete] =
    useState<ApiPracticeMessage | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingChat, setLoadingChat] = useState(false);
  const [loadingOlderMessages, setLoadingOlderMessages] = useState(false);
  const [hasOlderMessages, setHasOlderMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [deletingMessage, setDeletingMessage] = useState(false);
  const [fullscreenImage, setFullscreenImage] = useState<string | null>(null);
  const [testDetail, setTestDetail] = useState<SubmissionDetail | null>(null);
  const [loadingTestDetail, setLoadingTestDetail] = useState(false);
  const [activePinnedIndex, setActivePinnedIndex] = useState(0);
  const [highlightedMessageId, setHighlightedMessageId] = useState<
    string | null
  >(null);
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
      toast.error(
        error?.response?.data?.message ?? "Chatlarni yuklab bo‘lmadi",
      );
    } finally {
      setLoading(false);
    }
  }

  async function loadChat(chatId: string) {
    setLoadingChat(true);
    setLoadingOlderMessages(false);
    loadingOlderMessagesRef.current = false;
    setHasOlderMessages(false);
    hasOlderMessagesRef.current = false;
    nextCursorRef.current = null;
    try {
      const result = await apiGetPracticeChat(chatId);
      if (selectedIdRef.current !== chatId) return;
      setSelectedChat(result.chat);
      setMessages(result.messages);
      setHasOlderMessages(result.hasMore);
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
    if (
      !chatId ||
      !cursor ||
      !hasOlderMessagesRef.current ||
      loadingOlderMessagesRef.current
    ) {
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
        return [
          ...result.messages.filter((message) => !currentIds.has(message.id)),
          ...current,
        ];
      });
      setHasOlderMessages(result.hasMore);
      hasOlderMessagesRef.current = result.hasMore;
      nextCursorRef.current = result.nextCursor;
      window.requestAnimationFrame(() => {
        const currentContainer = messageScrollRef.current;
        if (currentContainer) {
          currentContainer.scrollTop =
            currentContainer.scrollHeight - previousScrollHeight;
        }
      });
    } catch (error: any) {
      toast.error(
        error?.response?.data?.message ?? "Oldingi xabarlarni yuklab bo‘lmadi",
      );
    } finally {
      loadingOlderMessagesRef.current = false;
      if (selectedIdRef.current === chatId) setLoadingOlderMessages(false);
    }
  }

  useEffect(() => {
    void loadChats();
  }, []);
  useEffect(() => {
    selectedIdRef.current = selectedId;
    setActiveChatId(selectedId);
    return () => setActiveChatId(null);
  }, [selectedId]);
  useEffect(() => {
    if (!token) return;
    const socket = connectPracticeMessengerSocket(token);
    function handleNewMessage(payload: PracticeMessengerSocketPayload) {
      if (selectedIdRef.current === payload.chatId)
        void loadChat(payload.chatId);
      void loadChats();
    }
    socket.on("new_message", handleNewMessage);
    return () => {
      socket.off("new_message", handleNewMessage);
    };
  }, [token]);
  useEffect(() => {
    if (selectedId) void loadChat(selectedId);
    else {
      setSelectedChat(null);
      setMessages([]);
    }
  }, [selectedId]);
  useEffect(() => {
    const container = messageScrollRef.current;
    if (
      container &&
      !loadingChat &&
      !loadingOlderMessages &&
      hasOlderMessages &&
      container.scrollHeight <= container.clientHeight + 8
    ) {
      void loadOlderMessages();
    }
  }, [
    messages,
    selectedId,
    loadingChat,
    loadingOlderMessages,
    hasOlderMessages,
  ]);

  useEffect(() => {
    if (loadingChat || !scrollToBottomAfterRenderRef.current) return;
    scrollToBottomAfterRenderRef.current = false;
    window.requestAnimationFrame(() => {
      const container = messageScrollRef.current;
      if (container) container.scrollTop = container.scrollHeight;
    });
  }, [messages, loadingChat]);

  useEffect(() => {
    setReplyingTo(null);
    setEditingMessage(null);
    setEditingGradeMessageId(null);
    setActiveMessageActionsId(null);
    setMessagePendingDelete(null);
    setDraft("");
  }, [selectedId]);

  const visibleChats = useMemo(() => {
    const value = query.trim().toLocaleLowerCase();
    if (!value) return chats;
    return chats.filter((chat) =>
      `${chat.student.name} ${chat.courseTitle} ${chat.groupName}`
        .toLocaleLowerCase()
        .includes(value),
    );
  }, [chats, query]);

  const isCurator =
    admin?.role === "curator" ||
    admin?.role === "teacher" ||
    admin?.role === "super";
  const pinnedMessages = useMemo(
    () =>
      messages.filter(
        (message) =>
          message.type === "practice_test" || message.type === "practice_image",
      ),
    [messages],
  );

  useEffect(() => {
    setActivePinnedIndex(Math.max(0, pinnedMessages.length - 1));
  }, [pinnedMessages.length, selectedId]);

  function focusPreviousPinnedMessage() {
    if (pinnedMessages.length === 0) return;
    const nextIndex =
      activePinnedIndex <= 0
        ? pinnedMessages.length - 1
        : activePinnedIndex - 1;
    const message = pinnedMessages[nextIndex];
    setActivePinnedIndex(nextIndex);
    setHighlightedMessageId(message.id);
    messageRefs.current[message.id]?.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
    window.setTimeout(() => setHighlightedMessageId(null), 1600);
  }

  async function sendMessage() {
    if (!selectedChat || !draft.trim()) return;
    const sendingNewMessage = !editingMessage;
    setSending(true);
    try {
      if (editingMessage) {
        await apiUpdatePracticeMessage(
          selectedChat.id,
          editingMessage.id,
          draft,
        );
        toast.success("Xabar tahrirlandi");
      } else {
        await apiSendPracticeMessage(selectedChat.id, draft, replyingTo?.id);
      }
      setDraft("");
      setReplyingTo(null);
      setEditingMessage(null);
      draftRef.current?.blur();
      if (sendingNewMessage) scrollToBottomAfterRenderRef.current = true;
      await Promise.all([loadChat(selectedChat.id), loadChats()]);
      const refreshLayout = () => {
        window.scrollTo(0, 0);
        document.documentElement.scrollTop = 0;
        document.body.scrollTop = 0;
        window.dispatchEvent(new Event("resize"));
        const container = messageScrollRef.current;
        if (container) container.scrollTop = container.scrollHeight;
      };
      window.requestAnimationFrame(refreshLayout);
      window.setTimeout(refreshLayout, 350);
    } catch (error: any) {
      toast.error(error?.response?.data?.message ?? "Xabar yuborilmadi");
    } finally {
      setSending(false);
    }
  }

  function startReply(message: ApiPracticeMessage) {
    if (message.deletedAt) return;
    setActiveMessageActionsId(null);
    setEditingMessage(null);
    setReplyingTo(message);
    setDraft("");
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
      await Promise.all([loadChat(selectedChat.id), loadChats()]);
    } catch (error: any) {
      toast.error(
        error?.response?.data?.message ?? "Xabarni o‘chirib bo‘lmadi",
      );
    } finally {
      setDeletingMessage(false);
    }
  }

  async function gradeImage(message: ApiPracticeMessage) {
    const image = message.imageSubmissions[0] ?? message.imageSubmission;
    const maximum = Number(
      message.practice?.maxScore ?? message.metadata.maxScore ?? 0,
    );
    const score = Number(scoreByMessage[message.id]);
    if (
      !image ||
      !Number.isInteger(score) ||
      score < 0 ||
      (maximum > 0 && score > maximum)
    ) {
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
      if (selectedChat)
        await Promise.all([loadChat(selectedChat.id), loadChats()]);
    } catch (error: any) {
      toast.error(
        error?.response?.data?.message ?? "Baholashda xatolik yuz berdi",
      );
    }
  }

  async function gradeTestPractice(message: ApiPracticeMessage) {
    const maximum = Number(message.practice?.maxScore ?? 0);
    const score = Number(scoreByMessage[message.id]);
    if (
      !message.testSubmission ||
      maximum <= 0 ||
      !Number.isInteger(score) ||
      score < 0 ||
      score > maximum
    ) {
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
      if (selectedChat)
        await Promise.all([loadChat(selectedChat.id), loadChats()]);
    } catch (error: any) {
      toast.error(
        error?.response?.data?.message ?? "Yulduzni saqlab bo‘lmadi",
      );
    }
  }

  function startEditingImageGrade(message: ApiPracticeMessage, score: number) {
    setEditingGradeMessageId(message.id);
    setScoreByMessage((state) => ({
      ...state,
      [message.id]: String(score),
    }));
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
      toast.error(
        error?.response?.data?.message ?? "Test natijasini yuklab bo‘lmadi",
      );
    } finally {
      setLoadingTestDetail(false);
    }
  }

  return (
    <div className="practice-messenger-root flex h-full min-h-0 flex-col overflow-hidden bg-white lg:rounded-2xl">
      <div className="grid min-h-0 flex-1 overflow-hidden lg:grid-cols-[340px_minmax(0,1fr)]">
        <aside
          className={`practice-messenger-list min-h-0 flex-col border-b border-gray-100 lg:flex lg:border-b-0 lg:border-r ${mobileThreadOpen ? "hidden" : "flex"}`}
        >
          <div className="border-b border-gray-100 p-3">
            <label className="flex items-center gap-2 rounded-xl bg-gray-100 px-3 py-2.5 text-gray-400">
              <Search size={17} />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Qidirish"
                className="min-w-0 flex-1 bg-transparent text-sm text-gray-800 outline-none placeholder:text-gray-400"
              />
            </label>
          </div>
          <div className="max-h-64 flex-1 overflow-y-auto lg:max-h-none">
            {loading ? (
              <div className="flex justify-center py-12 text-gray-400">
                <Loader2 className="animate-spin" size={24} />
              </div>
            ) : visibleChats.length === 0 ? (
              <div className="px-5 py-12 text-center text-sm text-gray-400">
                Hali amalyot chati yo‘q.
              </div>
            ) : (
              visibleChats.map((chat) => {
                const active = chat.id === selectedId;
                return (
                  <button
                    key={chat.id}
                    type="button"
                    onClick={() => {
                      setSelectedId(chat.id);
                      setMobileThreadOpen(true);
                    }}
                    className={`flex w-full gap-3 border-b border-gray-50 px-4 py-3 text-left transition-colors ${active ? "practice-messenger-chat-active" : "hover:bg-gray-50"}`}
                  >
                    <UserAvatar
                      name={admin?.id === chat.student.id ? chat.curator.name : chat.student.name}
                      avatarUrl={admin?.id === chat.student.id ? chat.curator.avatarUrl : chat.student.avatarUrl}
                      className="practice-messenger-avatar h-11 w-11 rounded-full text-sm font-bold"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-bold text-gray-900">
                          {admin?.id === chat.student.id
                            ? chat.curator.name
                            : chat.student.name}
                        </span>
                        <span className="shrink-0 text-[11px] text-gray-400">
                          {chat.lastMessage
                            ? formatDateTime(chat.lastMessage.createdAt)
                            : ""}
                        </span>
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-gray-500">
                        {previewText(chat)}
                      </span>
                      <span className="mt-1 block truncate text-[11px] text-gray-400">
                        {chat.courseTitle} · {chat.groupName}
                      </span>
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </aside>

        <section
          className={`practice-messenger-thread min-h-0 min-w-0 flex-col overflow-hidden bg-gray-50/50 lg:flex ${mobileThreadOpen ? "flex" : "hidden"}`}
        >
          {!selectedChat ? (
            <div className="flex flex-1 flex-col items-center justify-center px-6 text-center text-gray-400">
              <MessageCircle size={48} className="mb-3 text-gray-200" />
              <p className="font-semibold text-gray-600">
                Amalyot chatini tanlang
              </p>
              <p className="mt-1 text-sm">
                Yangi topshiriqlar va xabarlar shu yerda turadi.
              </p>
            </div>
          ) : (
            <>
              <header className="practice-messenger-header flex items-center justify-between border-b border-gray-100 bg-white px-3 py-3.5 sm:px-5">
                <div className="flex min-w-0 items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setMobileThreadOpen(false)}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 lg:hidden"
                    aria-label="Chatlar ro‘yxatiga qaytish"
                    title="Orqaga"
                  >
                    <ArrowLeft size={20} />
                  </button>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-gray-900">
                      {isCurator
                        ? selectedChat.student.name
                        : selectedChat.curator.name}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-gray-400">
                      {selectedChat.courseTitle} · {selectedChat.groupName}
                    </p>
                  </div>
                </div>
                <UserAvatar
                  name={isCurator ? selectedChat.student.name : selectedChat.curator.name}
                  avatarUrl={isCurator ? selectedChat.student.avatarUrl : selectedChat.curator.avatarUrl}
                  className="practice-messenger-avatar h-9 w-9 rounded-full text-xs font-bold"
                />
              </header>

              {pinnedMessages.length > 0 && (
                <button
                  type="button"
                  onClick={focusPreviousPinnedMessage}
                  className="practice-messenger-pins flex items-center gap-3 border-b border-gray-100 bg-white px-5 py-2.5 text-left transition-colors hover:bg-gray-50"
                  title="Oldingi qadalgan amaliyotga o‘tish"
                >
                  <span className="practice-messenger-accent-icon flex h-8 w-8 shrink-0 items-center justify-center rounded-lg">
                    <Pin size={16} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs font-bold text-gray-900">
                      Qadalgan amaliyotlar · {activePinnedIndex + 1}/
                      {pinnedMessages.length}
                    </span>
                    <span className="block truncate text-xs text-gray-500">
                      {pinnedMessages[activePinnedIndex]?.practice?.title ??
                        "Amaliyot"}
                    </span>
                  </span>
                  <ChevronUp size={18} className="shrink-0 text-gray-400" />
                </button>
              )}

              <div
                ref={messageScrollRef}
                onScroll={(event) => {
                  if (event.currentTarget.scrollTop <= 24) {
                    void loadOlderMessages();
                  }
                }}
                className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 sm:p-5"
              >
                {loadingChat ? (
                  <div className="flex justify-center py-12 text-gray-400">
                    <Loader2 className="animate-spin" size={24} />
                  </div>
                ) : (
                  <>
                    {loadingOlderMessages && (
                      <div className="sticky top-1 z-10 mb-2 flex justify-center">
                        <span className="flex items-center gap-2 rounded-full bg-gray-100 px-3 py-1.5 text-xs font-semibold text-gray-500 shadow-sm">
                          <Loader2 className="animate-spin" size={14} /> Oldingi
                          xabarlar yuklanmoqda...
                        </span>
                      </div>
                    )}
                    <div className="mx-auto flex w-full max-w-5xl flex-col gap-2">
                      {messages.map((message, index) => {
                        const own = message.sender.id === admin?.id;
                        const startsDateGroup =
                          index === 0 ||
                          messageDateKey(message.createdAt) !==
                            messageDateKey(messages[index - 1].createdAt);
                        const practiceMessage = message.type !== "text";
                        const maxScore = Number(
                          message.practice?.maxScore ??
                            message.metadata.maxScore ??
                            0,
                        );
                        const gradedImage = message.imageSubmissions.find(
                          (image) =>
                            image.gradedAt !== null && image.score !== null,
                        );
                        const imageIsGraded =
                          maxScore > 0 &&
                          message.imageSubmissions.length > 0 &&
                          message.imageSubmissions.every(
                            (image) =>
                              image.gradedAt !== null && image.score !== null,
                          );
                        const editingImageGrade =
                          editingGradeMessageId === message.id;
                        const canManage =
                          own && message.type === "text" && !message.deletedAt;
                        return (
                          <Fragment key={message.id}>
                            {startsDateGroup && (
                              <div className="practice-message-date sticky top-0 z-[1] flex justify-center py-1.5">
                                <span className="rounded-full px-3 py-1 text-xs font-semibold text-gray-500 backdrop-blur-sm">
                                  {messageDateLabel(message.createdAt)}
                                </span>
                              </div>
                            )}
                            <div
                              ref={(element) => {
                                messageRefs.current[message.id] = element;
                              }}
                              className={`flex px-1 transition-[background-color,box-shadow] duration-300 ${own ? "justify-end" : "justify-start"} ${highlightedMessageId === message.id ? "practice-messenger-highlighted rounded-2xl p-2" : ""}`}
                            >
                              <div
                                onClick={(event) => {
                                  if (
                                    message.deletedAt ||
                                    !window.matchMedia("(max-width: 639px)")
                                      .matches ||
                                    (event.target as HTMLElement).closest(
                                      "button, a, input, textarea",
                                    )
                                  ) {
                                    return;
                                  }
                                  setActiveMessageActionsId((current) =>
                                    current === message.id ? null : message.id,
                                  );
                                }}
                                className={`practice-message-bubble group relative max-w-[92%] px-4 pb-2.5 shadow-sm sm:max-w-[78%] ${activeMessageActionsId === message.id ? "pt-9 sm:pt-2.5" : "pt-2.5"} ${
                                  own
                                    ? practiceMessage
                                      ? "practice-message-own rounded-[22px] rounded-br-[6px] bg-gray-800 text-gray-50"
                                      : "practice-message-own rounded-[22px] rounded-br-[6px]"
                                    : "practice-message-incoming rounded-[22px] rounded-bl-[6px]"
                                }`}
                              >
                                {!message.deletedAt && (
                                  <div
                                    onClick={(event) => event.stopPropagation()}
                                    className={`absolute right-2 top-1 z-10 flex items-center rounded-lg border border-gray-100 bg-white p-0.5 shadow-sm transition-opacity sm:bottom-full sm:top-auto sm:mb-1 sm:pointer-events-auto sm:opacity-0 sm:group-hover:opacity-100 sm:focus-within:opacity-100 ${activeMessageActionsId === message.id ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"}`}
                                  >
                                    <button
                                      type="button"
                                      onClick={() => startReply(message)}
                                      className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-900"
                                      aria-label="Xabarga javob berish"
                                      title="Javob berish"
                                    >
                                      <Reply size={14} />
                                    </button>
                                    {canManage && (
                                      <>
                                        <button
                                          type="button"
                                          onClick={() => startEditing(message)}
                                          className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-900"
                                          aria-label="Xabarni tahrirlash"
                                          title="Tahrirlash"
                                        >
                                          <Pencil size={14} />
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setActiveMessageActionsId(null);
                                            setMessagePendingDelete(message);
                                          }}
                                          className="rounded-md p-1.5 text-gray-500 hover:bg-red-50 hover:text-red-600"
                                          aria-label="Xabarni o‘chirish"
                                          title="O‘chirish"
                                        >
                                          <Trash2 size={14} />
                                        </button>
                                      </>
                                    )}
                                  </div>
                                )}
                                {message.replyTo && (
                                  <div
                                    className={`practice-message-reply mb-2 rounded-[10px] border-l-[3px] px-3 py-1.5 text-left ${own ? "practice-message-reply-own border-white bg-white/15 text-white" : "practice-message-reply-incoming bg-white/65 text-gray-700"}`}
                                  >
                                    <p
                                      className={`truncate text-sm font-semibold ${own ? "text-white" : ""}`}
                                    >
                                      {message.replyTo.senderName}
                                    </p>
                                    <p className="line-clamp-2 text-sm leading-5 opacity-90">
                                      {message.replyTo.content}
                                    </p>
                                  </div>
                                )}
                                {message.deletedAt ? (
                                  <p
                                    className={`text-sm italic ${own ? "text-gray-300" : "text-gray-400"}`}
                                  >
                                    Xabar o‘chirildi
                                  </p>
                                ) : practiceMessage ? (
                                  <div>
                                    <div className="flex items-start gap-2.5">
                                      <span
                                        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${message.type === "practice_image" ? "bg-amber-50 text-amber-500" : message.type === "practice_grade" ? "bg-green-50 text-green-600" : "practice-messenger-accent-icon"}`}
                                      >
                                        {message.type === "practice_image" ? (
                                          <ImageIcon size={17} />
                                        ) : message.type ===
                                          "practice_grade" ? (
                                          <CheckCircle2 size={17} />
                                        ) : (
                                          <ClipboardCheck size={17} />
                                        )}
                                      </span>
                                      <div>
                                        <p className="text-sm font-bold">
                                          {message.practice?.title ??
                                            "Amaliyot"}
                                        </p>
                                        <p
                                          className={`mt-0.5 text-xs ${own ? "text-gray-300" : "text-gray-500"}`}
                                        >
                                          {message.content}
                                        </p>
                                      </div>
                                    </div>
                                    {message.type === "practice_test" && (
                                      <>
                                        <button
                                          type="button"
                                          onClick={() =>
                                            void openTestResult(message)
                                          }
                                          className="practice-messenger-result mt-3 flex w-full items-center justify-between rounded-xl px-3 py-2 text-left transition-opacity hover:opacity-90"
                                          title="Tanlangan javoblarni ko‘rish"
                                        >
                                          <span className="text-xs font-semibold">
                                            Natijalarni ko‘rish
                                          </span>
                                          <span className="text-sm font-bold">
                                            {message.testSubmission?.score ?? 0} /{" "}
                                            {message.testSubmission?.total ?? 0}
                                          </span>
                                        </button>
                                        {isCurator &&
                                          (maxScore <= 0 ? (
                                            <p className="mt-2 text-xs font-semibold text-amber-500">
                                              Maksimal yulduz belgilanmagan
                                            </p>
                                          ) : editingGradeMessageId ===
                                            message.id ? (
                                            <div className="mt-2 flex items-end gap-2">
                                              <label className="min-w-0 flex-1 text-xs font-semibold text-gray-400">
                                                Amaliyot yulduzi / {maxScore}
                                                <input
                                                  type="number"
                                                  min={0}
                                                  max={maxScore}
                                                  value={
                                                    scoreByMessage[message.id] ?? ""
                                                  }
                                                  onChange={(event) =>
                                                    setScoreByMessage((state) => ({
                                                      ...state,
                                                      [message.id]: event.target.value,
                                                    }))
                                                  }
                                                  className="mt-1 block w-full rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-2 text-sm font-bold text-gray-900 outline-none focus:border-gray-900"
                                                />
                                              </label>
                                              <button
                                                type="button"
                                                onClick={() =>
                                                  void gradeTestPractice(message)
                                                }
                                                className="practice-messenger-primary rounded-lg px-3 py-2 text-xs font-bold"
                                              >
                                                Saqlash
                                              </button>
                                              <button
                                                type="button"
                                                onClick={() =>
                                                  cancelEditingImageGrade(message.id)
                                                }
                                                className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 text-gray-500"
                                                aria-label="Bekor qilish"
                                              >
                                                <X size={15} />
                                              </button>
                                            </div>
                                          ) : (
                                            <div className="mt-2 flex items-center justify-between gap-3">
                                              <p className="inline-flex items-center gap-1 text-sm font-bold text-amber-500">
                                                <Star size={14} fill="currentColor" />
                                                {message.testSubmission?.practiceScore ?? 0} / {maxScore}
                                                {message.testSubmission?.scoreOverridden && (
                                                  <span className="text-[10px] font-medium text-gray-400">
                                                    qo‘lda
                                                  </span>
                                                )}
                                              </p>
                                              <button
                                                type="button"
                                                onClick={() =>
                                                  startEditingImageGrade(
                                                    message,
                                                    message.testSubmission
                                                      ?.practiceScore ?? 0,
                                                  )
                                                }
                                                className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-bold text-gray-700"
                                              >
                                                <Pencil size={13} /> Tahrirlash
                                              </button>
                                            </div>
                                          ))}
                                      </>
                                    )}
                                    {message.type === "practice_image" &&
                                      message.imageSubmissions.length > 0 && (
                                        <>
                                          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                                            {message.imageSubmissions.map(
                                              (image, index) => (
                                                <button
                                                  key={image.id}
                                                  type="button"
                                                  onClick={() =>
                                                    setFullscreenImage(
                                                      image.imageUrl,
                                                    )
                                                  }
                                                  className="group relative aspect-[4/3] overflow-hidden rounded-xl bg-gray-100"
                                                  aria-label={`${index + 1}-rasmni katta ochish`}
                                                >
                                                  <img
                                                    src={image.imageUrl}
                                                    alt={`O‘quvchi yuborgan rasm ${index + 1}`}
                                                    className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
                                                  />
                                                  <span className="absolute inset-0 flex items-center justify-center bg-black/0 text-white opacity-0 transition-colors group-hover:bg-black/35 group-hover:opacity-100">
                                                    <Maximize2 size={20} />
                                                  </span>
                                                </button>
                                              ),
                                            )}
                                          </div>
                                          {isCurator &&
                                            (maxScore <= 0 ? (
                                              <div className="mt-3 rounded-xl border border-amber-400/30 bg-amber-50 px-3 py-2.5">
                                                <p className="text-xs font-bold text-amber-600">
                                                  Maksimal yulduz belgilanmagan
                                                </p>
                                                <p className="mt-1 text-xs text-gray-500">
                                                  Baholashdan oldin kurs
                                                  kontentidagi amaliyot
                                                  sozlamalarida maksimal
                                                  yulduzni belgilang.
                                                </p>
                                              </div>
                                            ) : !imageIsGraded ||
                                              editingImageGrade ? (
                                              <div className="mt-3 flex items-end gap-2">
                                                <label className="min-w-0 flex-1 text-xs font-semibold text-gray-500">
                                                  Barcha rasmlar uchun yulduz
                                                  {` / ${maxScore}`}
                                                  <input
                                                    value={
                                                      scoreByMessage[
                                                        message.id
                                                      ] ?? ""
                                                    }
                                                    onChange={(event) =>
                                                      setScoreByMessage(
                                                        (state) => ({
                                                          ...state,
                                                          [message.id]:
                                                            event.target.value,
                                                        }),
                                                      )
                                                    }
                                                    inputMode="numeric"
                                                    className="mt-1 block w-full rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-2 text-sm font-bold text-gray-900 outline-none focus:border-gray-900"
                                                    placeholder={`0 / ${maxScore}`}
                                                  />
                                                </label>
                                                <button
                                                  type="button"
                                                  onClick={() =>
                                                    void gradeImage(message)
                                                  }
                                                  className="practice-messenger-primary rounded-lg px-3 py-2 text-xs font-bold transition-colors"
                                                >
                                                  {editingImageGrade
                                                    ? "Saqlash"
                                                    : "Baholash"}
                                                </button>
                                                {editingImageGrade && (
                                                  <button
                                                    type="button"
                                                    onClick={() =>
                                                      cancelEditingImageGrade(
                                                        message.id,
                                                      )
                                                    }
                                                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-gray-200 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900"
                                                    aria-label="Baho tahririni bekor qilish"
                                                    title="Bekor qilish"
                                                  >
                                                    <X size={15} />
                                                  </button>
                                                )}
                                              </div>
                                            ) : (
                                              <div className="mt-3 flex items-center justify-between gap-3">
                                                <p className="text-sm font-bold text-green-600">
                                                  {gradedImage?.score} /{" "}
                                                  {maxScore} yulduz berildi
                                                </p>
                                                <button
                                                  type="button"
                                                  onClick={() =>
                                                    startEditingImageGrade(
                                                      message,
                                                      gradedImage!.score!,
                                                    )
                                                  }
                                                  className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-bold text-gray-700 transition-colors hover:bg-gray-100"
                                                >
                                                  <Pencil size={13} />{" "}
                                                  Tahrirlash
                                                </button>
                                              </div>
                                            ))}
                                        </>
                                      )}
                                  </div>
                                ) : (
                                  <p className="whitespace-pre-wrap text-[15px] leading-[21px]">
                                    {message.content}
                                  </p>
                                )}
                                <div
                                  className={`mt-0.5 flex items-center justify-end gap-1 text-[11px] leading-4 ${own ? "opacity-60" : "text-slate-500"}`}
                                >
                                  <span>{messageTime(message.createdAt)}</span>
                                  {message.editedAt ? " · tahrirlangan" : ""}
                                  {own && <Check size={14} strokeWidth={2} />}
                                </div>
                              </div>
                            </div>
                          </Fragment>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>

              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  void sendMessage();
                }}
                className="practice-messenger-composer border-t border-gray-100 bg-white p-2 sm:p-3"
              >
                {(replyingTo || editingMessage) && (
                  <div className="practice-messenger-replying mx-auto mb-2 flex w-full max-w-4xl items-center gap-3 rounded-xl border-l-4 px-3 py-2 text-xs text-gray-600">
                    <div className="min-w-0 flex-1">
                      <p className="practice-messenger-replying-title font-bold">
                        {editingMessage
                          ? "Xabarni tahrirlash"
                          : `${replyingTo?.sender.name} xabariga javob`}
                      </p>
                      <p className="mt-0.5 truncate">
                        {(editingMessage ?? replyingTo)?.content}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={cancelMessageAction}
                      className="rounded-md p-1 text-gray-400 hover:bg-white hover:text-gray-700"
                      aria-label="Amalni bekor qilish"
                    >
                      <X size={16} />
                    </button>
                  </div>
                )}
                <div className="mx-auto flex w-full max-w-4xl items-center gap-2 rounded-xl border border-gray-200 bg-gray-50 px-2.5 py-1.5 transition-colors focus-within:border-gray-900 sm:rounded-2xl sm:px-3 sm:py-2">
                  <textarea
                    ref={draftRef}
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && !event.shiftKey) {
                        event.preventDefault();
                        void sendMessage();
                      }
                    }}
                    rows={1}
                    placeholder={
                      editingMessage
                        ? "Xabarni tahrirlang..."
                        : "Xabar yozing..."
                    }
                    className="max-h-24 min-h-5 flex-1 resize-none !bg-transparent text-sm leading-5 text-gray-800 outline-none placeholder:text-gray-400 sm:max-h-28 sm:min-h-6"
                  />
                  <button
                    type="submit"
                    disabled={sending || !draft.trim()}
                    className="practice-messenger-primary practice-messenger-send-button flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors disabled:opacity-100 sm:h-9 sm:w-9"
                  >
                    {editingMessage ? <Pencil size={16} /> : <Send size={17} />}
                  </button>
                </div>
              </form>
            </>
          )}
        </section>
      </div>
      {messagePendingDelete && (
        <div
          className="fixed inset-0 z-[100] flex items-end justify-center bg-black/50 p-4 sm:items-center"
          onClick={(event) => {
            if (
              event.target === event.currentTarget &&
              !deletingMessage
            ) {
              setMessagePendingDelete(null);
            }
          }}
        >
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl">
            <h2 className="text-base font-bold text-gray-900">
              Xabarni o‘chirish
            </h2>
            <p className="mt-2 text-sm leading-5 text-gray-500">
              Bu xabarni o‘chirmoqchimisiz? Bu amalni ortga qaytarib bo‘lmaydi.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setMessagePendingDelete(null)}
                disabled={deletingMessage}
                className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-bold text-gray-700 transition-colors hover:bg-gray-100 disabled:opacity-50"
              >
                Bekor qilish
              </button>
              <button
                type="button"
                onClick={() => void deleteMessage(messagePendingDelete)}
                disabled={deletingMessage}
                className="inline-flex min-w-24 items-center justify-center rounded-xl bg-red-600 px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-red-700 disabled:opacity-60"
              >
                {deletingMessage ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  "O‘chirish"
                )}
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
            onClick={(event) => event.stopPropagation()}
          />
        </div>
      )}
      {(loadingTestDetail || testDetail) && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
          <div className="flex max-h-[min(720px,calc(100vh-2rem))] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
              <div>
                <p className="text-base font-bold text-gray-900">
                  Test natijasi
                </p>
                {testDetail && (
                  <p className="mt-0.5 text-xs text-gray-400">
                    {testDetail.score ?? 0} / {testDetail.total ?? 0} yulduz
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => setTestDetail(null)}
                className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                aria-label="Natijani yopish"
              >
                <X size={20} />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              {loadingTestDetail ? (
                <div className="flex justify-center py-12 text-gray-400">
                  <Loader2 className="animate-spin" size={24} />
                </div>
              ) : testDetail?.answers.length ? (
                <div className="flex flex-col gap-3">
                  {testDetail.answers.map((answer, index) => (
                    <AnswerResultCard
                      key={answer.questionId}
                      answer={answer}
                      index={index}
                    />
                  ))}
                </div>
              ) : (
                <p className="py-10 text-center text-sm text-gray-400">
                  Javoblar topilmadi.
                </p>
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
