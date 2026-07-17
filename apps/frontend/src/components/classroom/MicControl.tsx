import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronUp, Mic, MicOff } from "lucide-react";

interface Props {
  micEnabled: boolean;
  onToggleMic: () => void;
  audioInputs: MediaDeviceInfo[];
  activeAudioInputId: string | null;
  onSwitchAudioInput: (deviceId: string) => void;
  disabled?: boolean;
}

// Mikrofon yoqish/o'chirish + qaysi mikrofon qurilmasi ishlatilishini
// tanlash uchun birlashtirilgan pill: asosiy tugma mikrofonni almashtiradi,
// chevron esa qurilmalar ro'yxatini ochadi (LiveKit switchActiveDevice orqali).
// Mikrofon o'chirilganda butun pill (chevron qismi ham) qizg'ish fonga o'tadi.
export function MicControl({ micEnabled, onToggleMic, audioInputs, activeAudioInputId, onSwitchAudioInput, disabled }: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

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
        className={`flex items-center gap-0.5 rounded-full p-1 shadow-md transition-colors ${
          micEnabled ? "bg-gray-800" : "bg-red-50"
        }`}
      >
        {hasDevices && (
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            disabled={disabled}
            className={`flex items-center justify-center w-9 h-9 rounded-full disabled:opacity-40 ${
              micEnabled ? "text-gray-300 hover:bg-white/10" : "text-red-400 hover:bg-red-100"
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
          className={`flex items-center justify-center w-9 h-9 rounded-full disabled:opacity-40 disabled:cursor-not-allowed ${
            micEnabled ? "text-white hover:bg-white/10" : "bg-red-100 text-red-500"
          }`}
          title={disabled ? "Ovoz o'chirilgan" : micEnabled ? "Mikrofonni o'chirish" : "Mikrofonni yoqish"}
        >
          {micEnabled ? <Mic size={17} /> : <MicOff size={17} />}
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
              className={`w-full text-left px-3 py-2 text-sm truncate hover:bg-gray-50 ${
                d.deviceId === activeAudioInputId ? "text-indigo-600 font-medium" : "text-gray-700"
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
