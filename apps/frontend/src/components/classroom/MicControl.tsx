import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronUp, Mic, MicOff } from "lucide-react";

interface Props {
  micEnabled: boolean;
  onToggleMic: () => void;
  audioInputs: MediaDeviceInfo[];
  activeAudioInputId: string | null;
  onSwitchAudioInput: (deviceId: string) => void;
  disabled?: boolean;
  theme?: 'light' | 'dark';
}

// Mikrofon yoqish/o'chirish + qaysi mikrofon qurilmasi ishlatilishini
// tanlash uchun birlashtirilgan pill: asosiy tugma mikrofonni almashtiradi,
// chevron esa qurilmalar ro'yxatini ochadi (LiveKit switchActiveDevice orqali).
// Mikrofon o'chirilganda butun pill (chevron qismi ham) qizg'ish fonga o'tadi.
export function MicControl({ micEnabled, onToggleMic, audioInputs, activeAudioInputId, onSwitchAudioInput, disabled, theme = 'light' }: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const isDark = theme === 'dark';

  // Mikrofon yoqilgan holda fon: dark → #3c4043, light → #f1f3f4
  // Mikrofon o'chirilganda har doim qizg'ish
  const pillBg = micEnabled
    ? (isDark ? '#3c4043' : '#f1f3f4')
    : 'oklch(63.7% .237 25.331)';

  useEffect(() => {
    if (!menuOpen) return;
    function handlePointerDown(e: PointerEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [menuOpen]);

  const hasDevices = audioInputs.length > 1;

  return (
    <div ref={wrapRef} className="relative">
      <div
        className={`flex items-center rounded-full shadow-md h-[44px] p-0 transition-colors ${hasDevices ? "gap-0.5" : ""}`}
        style={{ backgroundColor: pillBg }}
      >
        {hasDevices && (
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            disabled={disabled}
            className={`flex items-center justify-center p-2.5 ml-1 rounded-full disabled:opacity-40 ${micEnabled
              ? (isDark ? "text-gray-300 hover:bg-white/10" : "text-gray-500 hover:bg-gray-200")
              : "text-white hover:bg-red-100"
              }`}
            title="Mikrofon qurilmasini tanlash"
          >
            {menuOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
        )}
        <button
          type="button"
          onClick={onToggleMic}
          disabled={disabled}
          className={`flex items-center justify-center rounded-full disabled:opacity-40 disabled:cursor-not-allowed p-3 ${micEnabled
            ? (isDark ? "text-white hover:bg-white/10" : "text-[#3c4043] hover:bg-gray-200")
            : "bg-red-700 text-white"
            }`}
          title={disabled ? "Ovoz o'chirilgan" : micEnabled ? "Mikrofonni o'chirish" : "Mikrofonni yoqish"}
        >
          {micEnabled ? <Mic size={18} /> : <MicOff size={18} />}
        </button>
      </div>

      {menuOpen && (
        <div className="classroom-panel-in absolute bottom-full mb-2 left-1/2 -translate-x-1/2 z-40 w-56 rounded-xl bg-white shadow-xl ring-1 ring-black/5 overflow-hidden">
          <div className="px-3 py-2 text-xs font-semibold text-gray-400 border-b border-gray-100">Mikrofon</div>
          {audioInputs.map((d) => (
            <button
              key={d.deviceId}
              type="button"
              onClick={() => { onSwitchAudioInput(d.deviceId); setMenuOpen(false); }}
              className={`w-full text-left px-3 py-2 text-sm truncate hover:bg-gray-50 ${d.deviceId === activeAudioInputId ? "text-indigo-600 font-medium" : "text-gray-700"
                }`}
            >
              {d.label || "Noma'lum mikrofon"}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
