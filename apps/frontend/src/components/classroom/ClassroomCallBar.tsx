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
  audioOutputs?: MediaDeviceInfo[];
  activeAudioOutputId?: string | null;
  onSwitchAudioOutput?: (deviceId: string) => void;
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
  audioOutputs, activeAudioOutputId, onSwitchAudioOutput,
  micDisabled, onEndCall, endCallTitle, hidden, menu, theme = 'light',
  onSendReaction, handRaised, onToggleHandRaise,
}: Props) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const isDark = theme === 'dark';

  // Barcha tugmalar uchun birlashgan base klass — MicControl bilan bir xil hajm, glass effekt
  const btnBase = isDark
    ? 'flex items-center justify-center h-11 w-11 rounded-full bg-[#1f2023]/80 backdrop-blur-md text-white shadow-md ring-1 ring-white/10 hover:bg-[#2a2b2f]/90 transition-all active:scale-95'
    : 'flex items-center justify-center h-11 w-11 rounded-full bg-[#f1f3f4]/85 backdrop-blur-md text-[#1f2023] shadow-md ring-1 ring-black/5 hover:bg-[#e8eaed]/95 transition-all active:scale-95';

  return (
    <div
      className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 transition-transform duration-300 ease-in-out"
      style={{ transform: hidden ? "translateY(200px)" : "translateY(0)" }}
    >
      {/* Emoji picker popover */}
      {pickerOpen && (
        <div className={`absolute bottom-[60px] left-1/2 -translate-x-1/2 z-20 flex items-center gap-1 rounded-full px-3 py-2 shadow-2xl backdrop-blur-xl border max-w-[90vw] overflow-x-auto no-scrollbar touch-pan-x ${
          isDark ? 'bg-[#1f2023]/90 border-white/10' : 'bg-white/90 border-gray-200'
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
        audioOutputs={audioOutputs}
        activeAudioOutputId={activeAudioOutputId}
        onSwitchAudioOutput={onSwitchAudioOutput}
        disabled={micDisabled}
        theme={theme}
      />

      {/* Sticker / Reaksiya */}
      {onSendReaction && (
        <button
          type="button"
          onClick={() => setPickerOpen((v) => !v)}
          className={pickerOpen
            ? 'flex items-center justify-center h-11 w-11 rounded-full bg-indigo-600/70 backdrop-blur-md ring-1 ring-white/15 text-white shadow-md transition-all active:scale-95'
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
            ? 'flex items-center justify-center h-11 w-11 rounded-full bg-emerald-600/70 backdrop-blur-md ring-1 ring-white/15 text-white shadow-md shadow-emerald-500/30 transition-all active:scale-95'
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
        className="flex items-center justify-center h-11 w-11 rounded-full bg-red-500/80 backdrop-blur-md ring-1 ring-white/15 text-white shadow-md hover:bg-red-600/90 transition-all active:scale-95"
        title={endCallTitle}
      >
        <PhoneOff size={20} />
      </button>
    </div>
  );
}
