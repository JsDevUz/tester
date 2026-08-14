import type { ApiPracticeChatPreview } from "../../api/practiceMessenger";

export function previewText(chat: ApiPracticeChatPreview): string {
  if (!chat.lastMessage) return "Yangi amaliyot xabarlari shu yerda chiqadi";
  if (chat.lastMessage.type === "practice_test") return "Test natijasi yuborildi";
  if (chat.lastMessage.type === "practice_image") return "Rasmli topshiriq yuborildi";
  if (chat.lastMessage.type === "practice_grade") return "Topshiriq baholandi";
  return chat.lastMessage.content;
}

export function messageDateKey(value: string | Date): string {
  const date = new Date(value);
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

export function messageDateLabel(value: string): string {
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

export function messageTime(value: string): string {
  return new Intl.DateTimeFormat("uz-UZ", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}
