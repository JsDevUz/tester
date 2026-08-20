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
  /** Shows a "reconnecting" badge so a dropped connection is visible rather than silent. */
  voiceReconnecting?: boolean;
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
  micDisabled,
  voiceReconnecting = false, onEndCall, endCallTitle, hidden, menu, theme = 'light',
  onSendReaction, handRaised, onToggleHandRaise,
}: Props) {
  const [pickerOpen, setPickerOpen] = useState(false);

  // Barcha tugmalar uchun birlashgan base klass — glass effekt
  const btnBase = 'glass flex items-center justify-center h-11 w-11 rounded-full text-[var(--text-primary)] shadow-md hover:bg-black/10 dark:hover:bg-white/15 transition-all active:scale-95 cursor-pointer';

  return (
    <div
      className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 transition-transform duration-300 ease-in-out"
      style={{ transform: hidden ? "translateY(200px)" : "translateY(0)" }}
    >
      {voiceReconnecting && (
        <div className="absolute -top-9 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-amber-500 px-3 py-1 text-xs font-semibold text-white shadow-md">
          Ovoz qayta ulanmoqda...
        </div>
      )}

      {/* Emoji picker popover */}
      {pickerOpen && (
        <div className="glass-card absolute bottom-[60px] left-1/2 -translate-x-1/2 z-20 flex items-center gap-1 rounded-full px-3 py-2 shadow-2xl max-w-[90vw] overflow-x-auto no-scrollbar touch-pan-x">
          {STICKER_EMOJIS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              onClick={() => {
                onSendReaction?.(emoji);
                setPickerOpen(false);
              }}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xl transition-transform hover:scale-125 hover:bg-black/10 dark:hover:bg-white/15 active:scale-95 cursor-pointer"
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
            ? 'flex items-center justify-center h-11 w-11 rounded-full bg-indigo-600 text-white shadow-md transition-all active:scale-95 cursor-pointer'
            : `${btnBase} cursor-pointer`}
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
            ? 'flex items-center justify-center h-11 w-11 rounded-full bg-emerald-600 text-white shadow-md shadow-emerald-500/30 transition-all active:scale-95 cursor-pointer'
            : `${btnBase} cursor-pointer`}
          title={handRaised ? "Qo'lni tushirish" : "Qo'l ko'tarish"}
        >
          <Hand size={20} />
        </button>
      )}

      {/* Menu (uchta nuqta) */}
      {menu && (
        <div className="relative">
          {menu}
        </div>
      )}

      {/* Chiqish */}
      <button
        type="button"
        onClick={onEndCall}
        className="flex items-center justify-center h-11 w-11 rounded-full bg-red-600 text-white shadow-md hover:bg-red-700 transition-all active:scale-95 cursor-pointer"
        title={endCallTitle}
      >
        <PhoneOff size={20} />
      </button>
    </div>
  );
}
