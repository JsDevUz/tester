import { PhoneOff } from "lucide-react";
import { MicControl } from "./MicControl";

interface Props {
  micEnabled: boolean;
  onToggleMic: () => void;
  audioInputs: MediaDeviceInfo[];
  activeAudioInputId: string | null;
  onSwitchAudioInput: (deviceId: string) => void;
  micDisabled: boolean;
  onEndCall: () => void;
  endCallTitle: string;
  // Auto-hide overlay bilan pastga sirg'alib yashirinishi kerak bo'lsa
  // (o'quvchi ekrani) — ustoz uchun bermasdan har doim ko'rinadigan qoladi.
  hidden?: boolean;
}

// Mikrofon + qo'ng'iroqni tugatish (Darsni yakunlash / Darsdan chiqish)
// tugmalari — ekranning eng pastida, host va student sahifalarida bir xil
// ko'rinishda ishlatiladi.
export function ClassroomCallBar({
  micEnabled, onToggleMic, audioInputs, activeAudioInputId, onSwitchAudioInput,
  micDisabled, onEndCall, endCallTitle, hidden,
}: Props) {
  return (
    <div
      className="absolute bottom-2 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2 transition-transform duration-300 ease-in-out sm:bottom-6 sm:translate-y-0!"
      style={{ transform: hidden ? "translateY(200px)" : "translateY(0)" }}
    >
      <MicControl
        micEnabled={micEnabled}
        onToggleMic={onToggleMic}
        audioInputs={audioInputs}
        activeAudioInputId={activeAudioInputId}
        onSwitchAudioInput={onSwitchAudioInput}
        disabled={micDisabled}
      />
      <button
        type="button"
        onClick={onEndCall}
        className="p-3 rounded-full bg-red-500 text-white shadow-md hover:bg-red-600"
        title={endCallTitle}
      >
        <PhoneOff size={18} />
      </button>
    </div>
  );
}
