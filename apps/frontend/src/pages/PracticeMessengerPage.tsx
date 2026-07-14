import { useEffect, useMemo, useRef, useState } from "react";
import {
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
import { apiGradeImageSubmission } from "../api/practiceBlocks";
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
import { formatDateTime } from "../utils/date";

function initials(name: string) {
  return (
    name
      .split(/\s+/)
      .map((part) => part[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "O"
  );
}

function previewText(chat: ApiPracticeChatPreview) {
  if (!chat.lastMessage) return "Yangi amaliyot xabarlari shu yerda chiqadi";
  if (chat.lastMessage.type === "practice_test")
    return "Test natijasi yuborildi";
  if (chat.lastMessage.type === "practice_image")
    return "Rasmli topshiriq yuborildi";
  if (chat.lastMessage.type === "practice_grade") return "Topshiriq baholandi";
  return chat.lastMessage.content;
}

function PracticeMessengerContent() {
  const admin = useAuthStore((state) => state.admin);
  const [chats, setChats] = useState<ApiPracticeChatPreview[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedChat, setSelectedChat] = useState<ApiPracticeChat | null>(
    null,
  );
  const [messages, setMessages] = useState<ApiPracticeMessage[]>([]);
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState("");
  const [replyingTo, setReplyingTo] = useState<ApiPracticeMessage | null>(null);
  const [editingMessage, setEditingMessage] = useState<ApiPracticeMessage | null>(null);
  const [scoreByMessage, setScoreByMessage] = useState<Record<string, string>>(
    {},
  );
  const [loading, setLoading] = useState(true);
  const [loadingChat, setLoadingChat] = useState(false);
  const [sending, setSending] = useState(false);
  const [fullscreenImage, setFullscreenImage] = useState<string | null>(null);
  const [testDetail, setTestDetail] = useState<SubmissionDetail | null>(null);
  const [loadingTestDetail, setLoadingTestDetail] = useState(false);
  const [activePinnedIndex, setActivePinnedIndex] = useState(0);
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null);
  const messageScrollRef = useRef<HTMLDivElement>(null);
  const messageRefs = useRef<Record<string, HTMLDivElement | null>>({});

  async function loadChats() {
    setLoading(true);
    try {
      const result = await apiGetPracticeChats();
      setChats(result.chats);
      setSelectedId((current) =>
        current && result.chats.some((chat) => chat.id === current)
          ? current
          : (result.chats[0]?.id ?? null),
      );
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
    try {
      const result = await apiGetPracticeChat(chatId);
      setSelectedChat(result.chat);
      setMessages(result.messages);
    } catch (error: any) {
      toast.error(error?.response?.data?.message ?? "Chatni yuklab bo‘lmadi");
    } finally {
      setLoadingChat(false);
    }
  }

  useEffect(() => {
    void loadChats();
  }, []);
  useEffect(() => {
    if (selectedId) void loadChat(selectedId);
    else {
      setSelectedChat(null);
      setMessages([]);
    }
  }, [selectedId]);
  useEffect(() => {
    const container = messageScrollRef.current;
    if (container) container.scrollTop = container.scrollHeight;
  }, [messages, selectedId]);

  useEffect(() => {
    setReplyingTo(null);
    setEditingMessage(null);
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

  const isCurator = !!selectedChat && selectedChat.student.id !== admin?.id;
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
      activePinnedIndex <= 0 ? pinnedMessages.length - 1 : activePinnedIndex - 1;
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
    setSending(true);
    try {
      if (editingMessage) {
        await apiUpdatePracticeMessage(selectedChat.id, editingMessage.id, draft);
        toast.success("Xabar tahrirlandi");
      } else {
        await apiSendPracticeMessage(selectedChat.id, draft, replyingTo?.id);
      }
      setDraft("");
      setReplyingTo(null);
      setEditingMessage(null);
      await Promise.all([loadChat(selectedChat.id), loadChats()]);
    } catch (error: any) {
      toast.error(error?.response?.data?.message ?? "Xabar yuborilmadi");
    } finally {
      setSending(false);
    }
  }

  function startReply(message: ApiPracticeMessage) {
    if (message.deletedAt) return;
    setEditingMessage(null);
    setReplyingTo(message);
    setDraft("");
  }

  function startEditing(message: ApiPracticeMessage) {
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
    try {
      await apiDeletePracticeMessage(selectedChat.id, message.id);
      toast.success("Xabar o‘chirildi");
      if (editingMessage?.id === message.id) cancelMessageAction();
      await Promise.all([loadChat(selectedChat.id), loadChats()]);
    } catch (error: any) {
      toast.error(error?.response?.data?.message ?? "Xabarni o‘chirib bo‘lmadi");
    }
  }

  async function gradeImage(message: ApiPracticeMessage) {
    const image = message.imageSubmissions[0] ?? message.imageSubmission;
    const maximum = Number(
      message.practice?.maxScore ?? message.metadata.maxScore ?? 0,
    );
    const score = Number(scoreByMessage[message.id]);
    if (!image || !Number.isInteger(score) || score < 0 || (maximum > 0 && score > maximum)) {
      toast.error(maximum > 0 ? `Yulduz 0 dan ${maximum} gacha bo‘lishi kerak` : "Yulduz manfiy bo‘lmasligi kerak");
      return;
    }
    try {
      await apiGradeImageSubmission(image.id, score);
      toast.success("Topshiriq baholandi");
      if (selectedChat)
        await Promise.all([loadChat(selectedChat.id), loadChats()]);
    } catch (error: any) {
      toast.error(
        error?.response?.data?.message ?? "Baholashda xatolik yuz berdi",
      );
    }
  }

  async function openTestResult(message: ApiPracticeMessage) {
    if (!message.testSubmission) return;
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
        <aside className="practice-messenger-list flex min-h-0 flex-col border-b border-gray-100 lg:border-b-0 lg:border-r">
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
                    onClick={() => setSelectedId(chat.id)}
                    className={`flex w-full gap-3 border-b border-gray-50 px-4 py-3 text-left transition-colors ${active ? "bg-indigo-50" : "hover:bg-gray-50"}`}
                  >
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-sm font-bold text-indigo-600">
                      {initials(
                        admin?.id === chat.student.id
                          ? chat.curator.name
                          : chat.student.name,
                      )}
                    </span>
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

        <section className="practice-messenger-thread flex min-h-0 min-w-0 flex-col overflow-hidden bg-gray-50/50">
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
              <header className="practice-messenger-header flex items-center justify-between border-b border-gray-100 bg-white px-5 py-3.5">
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
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-600">
                  {initials(
                    isCurator
                      ? selectedChat.student.name
                      : selectedChat.curator.name,
                  )}
                </span>
              </header>

              {pinnedMessages.length > 0 && (
                <button
                  type="button"
                  onClick={focusPreviousPinnedMessage}
                  className="practice-messenger-pins flex items-center gap-3 border-b border-gray-100 bg-white px-5 py-2.5 text-left transition-colors hover:bg-gray-50"
                  title="Oldingi pinlangan amaliyotga o‘tish"
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
                    <Pin size={16} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs font-bold text-gray-900">
                      Pinlangan amaliyotlar · {activePinnedIndex + 1}/{pinnedMessages.length}
                    </span>
                    <span className="block truncate text-xs text-gray-500">
                      {pinnedMessages[activePinnedIndex]?.practice?.title ?? "Amaliyot"}
                    </span>
                  </span>
                  <ChevronUp size={18} className="shrink-0 text-gray-400" />
                </button>
              )}

              <div ref={messageScrollRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 sm:p-5">
                {loadingChat ? (
                  <div className="flex justify-center py-12 text-gray-400">
                    <Loader2 className="animate-spin" size={24} />
                  </div>
                ) : (
                  <div className="mx-auto flex w-full max-w-4xl flex-col gap-3">
                    {messages.map((message) => {
                      const own = message.sender.id === admin?.id;
                      const practiceMessage = message.type !== "text";
                      const maxScore = Number(
                        message.practice?.maxScore ?? message.metadata.maxScore ?? 0,
                      );
                      const canManage = own && message.type === "text" && !message.deletedAt;
                      return (
                        <div
                          key={message.id}
                          ref={(element) => {
                            messageRefs.current[message.id] = element;
                          }}
                          className={`flex rounded-2xl transition-[background-color,box-shadow] duration-300 ${own ? "justify-end" : "justify-start"} ${highlightedMessageId === message.id ? "bg-indigo-100/70 p-2 shadow-[0_0_0_2px_rgba(99,102,241,0.45)]" : ""}`}
                        >
                          <div
                          className={`group relative max-w-[92%] rounded-2xl px-3.5 py-3 shadow-sm sm:max-w-[78%] ${own ? "rounded-br-md bg-indigo-600 text-white" : "rounded-bl-md border border-gray-100 bg-white text-gray-800"}`}
                          >
                            {!message.deletedAt && (
                              <div className="absolute -top-3 right-2 z-10 flex items-center rounded-lg border border-gray-100 bg-white p-0.5 opacity-0 shadow-sm transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                                <button
                                  type="button"
                                  onClick={() => startReply(message)}
                                  className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100 hover:text-indigo-600"
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
                                      className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100 hover:text-indigo-600"
                                      aria-label="Xabarni tahrirlash"
                                      title="Tahrirlash"
                                    >
                                      <Pencil size={14} />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => void deleteMessage(message)}
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
                            {!own && (
                              <p className="mb-1 text-xs font-bold text-indigo-600">
                                {message.sender.name}
                              </p>
                            )}
                            {message.replyTo && (
                              <div className={`mb-2 rounded-lg border-l-2 px-2 py-1 text-xs ${own ? "border-indigo-200 bg-indigo-500/40 text-indigo-50" : "border-indigo-400 bg-indigo-50 text-gray-600"}`}>
                                <p className={`font-bold ${own ? "text-white" : "text-indigo-700"}`}>
                                  {message.replyTo.senderName}
                                </p>
                                <p className="mt-0.5 line-clamp-2">
                                  {message.replyTo.content}
                                </p>
                              </div>
                            )}
                            {message.deletedAt ? (
                              <p className={`text-sm italic ${own ? "text-indigo-100" : "text-gray-400"}`}>
                                Xabar o‘chirildi
                              </p>
                            ) : practiceMessage ? (
                              <div>
                                <div className="flex items-start gap-2.5">
                                  <span
                                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${message.type === "practice_image" ? "bg-amber-50 text-amber-500" : message.type === "practice_grade" ? "bg-green-50 text-green-600" : "bg-indigo-50 text-indigo-500"}`}
                                  >
                                    {message.type === "practice_image" ? (
                                      <ImageIcon size={17} />
                                    ) : message.type === "practice_grade" ? (
                                      <CheckCircle2 size={17} />
                                    ) : (
                                      <ClipboardCheck size={17} />
                                    )}
                                  </span>
                                  <div>
                                    <p className="text-sm font-bold">
                                      {message.practice?.title ?? "Amaliyot"}
                                    </p>
                                    <p className="mt-0.5 text-xs text-gray-500">
                                      {message.content}
                                    </p>
                                  </div>
                                </div>
                                {message.type === "practice_test" && (
                                  <button
                                    type="button"
                                    onClick={() => void openTestResult(message)}
                                    className="mt-3 flex w-full items-center justify-between rounded-xl bg-indigo-50 px-3 py-2 text-left text-indigo-700 transition-colors hover:bg-indigo-100"
                                    title="Tanlangan javoblarni ko‘rish"
                                  >
                                    <span className="text-xs font-semibold">
                                      Natijalarni ko‘rish
                                    </span>
                                    <span className="inline-flex items-center gap-1 text-sm font-bold">
                                      <Star size={14} fill="currentColor" />{" "}
                                      {message.testSubmission?.score ?? 0} /{" "}
                                      {message.testSubmission?.total ?? 0}
                                    </span>
                                  </button>
                                )}
                                {message.type === "practice_image" &&
                                  message.imageSubmissions.length > 0 && (
                                    <>
                                      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                                        {message.imageSubmissions.map((image, index) => (
                                          <button
                                            key={image.id}
                                            type="button"
                                            onClick={() => setFullscreenImage(image.imageUrl)}
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
                                        ))}
                                      </div>
                                      {isCurator &&
                                        (message.imageSubmissions.every((image) => image.gradedAt === null) ? (
                                          <div className="mt-3 flex items-end gap-2">
                                            <label className="min-w-0 flex-1 text-xs font-semibold text-gray-500">
                                              Barcha rasmlar uchun yulduz{maxScore > 0 ? ` / ${maxScore}` : ""}
                                              <input
                                                value={
                                                  scoreByMessage[message.id] ??
                                                  ""
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
                                                className="mt-1 block w-full rounded-lg border border-gray-200 px-2.5 py-2 text-sm font-bold text-gray-900 outline-none"
                                                placeholder={maxScore > 0 ? `0 / ${maxScore}` : "Yulduz"}
                                              />
                                            </label>
                                            <button
                                              type="button"
                                              onClick={() =>
                                                void gradeImage(message)
                                              }
                                              className="rounded-lg bg-gray-900 px-3 py-2 text-xs font-bold text-white"
                                            >
                                              Baholash
                                            </button>
                                          </div>
                                        ) : (
                                          <p className="mt-3 text-sm font-bold text-green-600">
                                            {message.imageSubmissions[0]?.score} /{" "}
                                            {maxScore || "—"} yulduz berildi
                                          </p>
                                        ))}
                                    </>
                                  )}
                              </div>
                            ) : (
                              <p className="whitespace-pre-wrap text-sm leading-5">
                                {message.content}
                              </p>
                            )}
                            <p
                              className={`mt-1.5 text-right text-[10px] ${own ? "text-indigo-100" : "text-gray-400"}`}
                            >
                              {formatDateTime(message.createdAt)}{message.editedAt ? " · tahrirlangan" : ""}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  void sendMessage();
                }}
                className="practice-messenger-composer border-t border-gray-100 bg-white p-3"
              >
                {(replyingTo || editingMessage) && (
                  <div className="mx-auto mb-2 flex w-full max-w-4xl items-center gap-3 rounded-xl border-l-4 border-indigo-500 bg-indigo-50 px-3 py-2 text-xs text-gray-600">
                    <div className="min-w-0 flex-1">
                      <p className="font-bold text-indigo-700">
                        {editingMessage ? "Xabarni tahrirlash" : `${replyingTo?.sender.name} xabariga javob`}
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
                <div className="mx-auto flex w-full max-w-4xl items-end gap-2 rounded-2xl border border-gray-200 bg-gray-50 px-3 py-2 focus-within:border-indigo-300">
                  <textarea
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && !event.shiftKey) {
                        event.preventDefault();
                        void sendMessage();
                      }
                    }}
                    rows={1}
                    placeholder={editingMessage ? "Xabarni tahrirlang..." : "Xabar yozing..."}
                    className="max-h-28 min-h-6 flex-1 resize-none bg-transparent text-sm text-gray-800 outline-none placeholder:text-gray-400"
                  />
                  <button
                    type="submit"
                    disabled={sending || !draft.trim()}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-white disabled:opacity-40"
                  >
                    {editingMessage ? <Pencil size={16} /> : <Send size={17} />}
                  </button>
                </div>
              </form>
            </>
          )}
        </section>
      </div>
      {fullscreenImage && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 p-4" onClick={() => setFullscreenImage(null)}>
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
                <p className="text-base font-bold text-gray-900">Test natijasi</p>
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
