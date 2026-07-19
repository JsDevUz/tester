import { useState } from "react";
import { ChevronDown, ChevronUp, PhoneOff } from "lucide-react";
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
// tugmalari — ekran markazi pastida, host va student sahifalarida bir xil
// ko'rinishda ishlatiladi. Mobil uchun: pastida chevron tugma bor —
// bosilsa panel pastga surilib yashiriladi (sahifa/zoom qatoriga xalaqit
// bermasin), keyin xuddi shu joyda chiqadigan chevron-up orqali qaytariladi.
export function ClassroomCallBar({
  micEnabled, onToggleMic, audioInputs, activeAudioInputId, onSwitchAudioInput,
  micDisabled, onEndCall, endCallTitle, hidden,
}: Props) {
  const [collapsed, setCollapsed] = useState(false);
  // Chevron bilan yashirish faqat mobilda kerak (pastki sahifa/zoom qatoriga
  // joy bo'shatish uchun) — desktopda kenglik yetarli, shuning uchun u yerda
  // panel doim bottom-6'da ko'rinib turadi va chevron chiqmaydi.
  const effectivelyHidden = hidden || collapsed;

  return (
    <>
      <div
        // Tor mobil ekranlarda bottom-16 (pastki sahifa/zoom/split qatoridan
        // yuqoriroq) kerak — aks holda markazdan chetlarga kengaygan ikkala
        // guruh to'qnashardi. Desktopda (sm+) esa kenglik yetarli bo'lgani
        // uchun pastroq (bottom-6) turadi va doim ko'rinadi.
        className="absolute bottom-16 left-1/2 -translate-x-1/2 z-10 flex flex-col items-center gap-1.5 transition-transform duration-300 ease-in-out sm:bottom-6 sm:translate-y-0!"
        style={{ transform: effectivelyHidden ? "translateY(200px)" : "translateY(0)" }}
      >
        <div className="flex items-center gap-2">
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
        <button
          type="button"
          onClick={() => setCollapsed(true)}
          title="Yashirish"
          aria-label="Mikrofon panelini yashirish"
          className="rounded-full bg-white/90 p-1 text-gray-400 shadow-md backdrop-blur-sm hover:bg-gray-100 hover:text-gray-600 sm:hidden"
        >
          <ChevronDown size={14} />
        </button>
      </div>

      {collapsed && !hidden && (
        <button
          type="button"
          onClick={() => setCollapsed(false)}
          title="Ko'rsatish"
          aria-label="Mikrofon panelini ko'rsatish"
          className="absolute bottom-16 left-1/2 z-10 -translate-x-1/2 rounded-full bg-white/90 p-1.5 text-gray-500 shadow-md backdrop-blur-sm transition-colors hover:bg-gray-100 sm:hidden"
        >
          <ChevronUp size={16} />
        </button>
      )}
    </>
  );
}
