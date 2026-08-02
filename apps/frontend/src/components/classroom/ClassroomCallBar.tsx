import { useState } from "react";
import { Hand, PhoneOff, Smile } from "lucide-react";
import { MicControl } from "./MicControl";

const STICKER_EMOJIS = ['💖', '👍', '🎉', '👏', '😂', '😮', '😢', '🤔', '👎'];

interface Props {
  micEnabled: boolean;
  onToggleMic: () => void;
  audioInputs: MediaDeviceInfo[];
  activeAudioInputId: string | null;
  onSwitchAudioInput: (deviceId: string) => void;
  micDisabled: boolean;
  onEndCall: () => void;
  endCallTitle: string;
  hidden?: boolean;
  menu?: React.ReactNode;
  theme?: 'light' | 'dark';
  onSendReaction?: (emoji: string) => void;
  handRaised?: boolean;
  onToggleHandRaise?: () => void;
}

export function ClassroomCallBar({
  micEnabled, onToggleMic, audioInputs, activeAudioInputId, onSwitchAudioInput,
  micDisabled, onEndCall, endCallTitle, hidden, menu, theme = 'light',
  onSendReaction, handRaised, onToggleHandRaise,
}: Props) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const isDark = theme === 'dark';

  // Barcha tugmalar uchun birlashgan base klass — MicControl bilan bir xil hajm
  const btnBase = isDark
    ? 'flex items-center justify-center h-11 w-11 rounded-full bg-[#3c4043] text-white shadow-md hover:bg-[#4a4d51] transition-all active:scale-95'
    : 'flex items-center justify-center h-11 w-11 rounded-full bg-[#f1f3f4] text-[#3c4043] shadow-md hover:bg-[#e8eaed] border border-gray-200/70 transition-all active:scale-95';

  return (
    <div
      className="absolute bottom-[10px] left-1/2 -translate-x-1/2 z-10 flex items-center gap-2 transition-transform duration-300 ease-in-out"
      style={{ transform: hidden ? "translateY(200px)" : "translateY(0)" }}
    >
      {/* Emoji picker popover */}
      {pickerOpen && (
        <div className={`absolute bottom-[60px] left-1/2 -translate-x-1/2 z-20 flex items-center gap-1 rounded-full px-3 py-2 shadow-2xl backdrop-blur-md border max-w-[90vw] overflow-x-auto no-scrollbar touch-pan-x ${
          isDark ? 'bg-[#28292c] border-white/10' : 'bg-white border-gray-200'
        }`}>
          {STICKER_EMOJIS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              onClick={() => {
                onSendReaction?.(emoji);
                setPickerOpen(false);
              }}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xl transition-transform hover:scale-125 hover:bg-black/10 dark:hover:bg-white/15 active:scale-95"
            >
              {emoji}
            </button>
          ))}
        </div>
      )}

      {/* Mikrofon */}
      <MicControl
        micEnabled={micEnabled}
        onToggleMic={onToggleMic}
        audioInputs={audioInputs}
        activeAudioInputId={activeAudioInputId}
        onSwitchAudioInput={onSwitchAudioInput}
        disabled={micDisabled}
        theme={theme}
      />

      {/* Sticker / Reaksiya */}
      {onSendReaction && (
        <button
          type="button"
          onClick={() => setPickerOpen((v) => !v)}
          className={pickerOpen
            ? 'flex items-center justify-center h-11 w-11 rounded-full bg-indigo-600 text-white shadow-md transition-all active:scale-95'
            : btnBase}
          title="Reaksiya bildirish"
        >
          <Smile size={20} />
        </button>
      )}

      {/* Qo'l ko'tarish */}
      {onToggleHandRaise && (
        <button
          type="button"
          onClick={onToggleHandRaise}
          className={handRaised
            ? 'flex items-center justify-center h-11 w-11 rounded-full bg-emerald-600 text-white shadow-md shadow-emerald-500/30 transition-all active:scale-95'
            : btnBase}
          title={handRaised ? "Qo'lni tushirish" : "Qo'l ko'tarish"}
        >
          <Hand size={20} />
        </button>
      )}

      {/* Menu (uchta nuqta) */}
      {menu && (
        <div className="relative">
          {/* menu o'z trigger tugmasini o'zi chiqaradi,
              lekin agar u faqat popover bo'lsa — wrapper chiqaramiz */}
          {menu}
        </div>
      )}

      {/* Chiqish */}
      <button
        type="button"
        onClick={onEndCall}
        className="flex items-center justify-center h-11 w-11 rounded-full bg-red-500 text-white shadow-md hover:bg-red-600 transition-all active:scale-95"
        title={endCallTitle}
      >
        <PhoneOff size={20} />
      </button>
    </div>
  );
}
