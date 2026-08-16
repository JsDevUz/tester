import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, ChevronUp, Mic, MicOff, Volume2 } from "lucide-react";

interface Props {
  micEnabled: boolean;
  onToggleMic: () => void;
  audioInputs: MediaDeviceInfo[];
  activeAudioInputId: string | null;
  onSwitchAudioInput: (deviceId: string) => void;
  audioOutputs?: MediaDeviceInfo[];
  activeAudioOutputId?: string | null;
  onSwitchAudioOutput?: (deviceId: string) => void;
  disabled?: boolean;
  theme?: 'light' | 'dark';
}

// Mikrofon yoqish/o'chirish + qaysi mikrofon/karnay qurilmasi ishlatilishini
// tanlash uchun birlashtirilgan pill: asosiy tugma mikrofonni almashtiradi,
// chevron esa MIC/SPEAKERS bo'limli qurilmalar panelini ochadi (LiveKit
// switchActiveDevice orqali). Mikrofon o'chirilganda butun pill (chevron
// qismi ham) qizg'ish fonga o'tadi.
export function MicControl({
  micEnabled, onToggleMic, audioInputs, activeAudioInputId, onSwitchAudioInput,
  audioOutputs = [], activeAudioOutputId = null, onSwitchAudioOutput,
  disabled, theme = 'light',
}: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const isDark = theme === 'dark';

  // Mikrofon yoqilgan holda fon: dark → shaffof brand (glass), light → shaffof oq
  // Mikrofon o'chirilganda har doim qizg'ish
  const pillBg = micEnabled
    ? (isDark ? 'rgba(31,32,35,0.85)' : 'rgba(241,243,244,0.9)')
    : 'oklch(63.7% .237 25.331 / 0.92)';

  useEffect(() => {
    if (!menuOpen) return;
    function handlePointerDown(e: PointerEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [menuOpen]);

  const hasOutputs = audioOutputs.length > 0 && !!onSwitchAudioOutput;
  const hasDevices = audioInputs.length > 1 || hasOutputs;

  return (
    <div ref={wrapRef} className="relative">
      <div
        className={`flex items-center rounded-full shadow-md backdrop-blur-md ring-1 h-[44px] p-0 transition-colors ${hasDevices ? "gap-0.5" : ""} ${isDark ? "ring-white/10" : "ring-black/5"}`}
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
            title="Audio qurilmalarni tanlash"
          >
            {menuOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
        )}
        <button
          type="button"
          onClick={onToggleMic}
          disabled={disabled}
          className={`flex items-center justify-center rounded-full disabled:opacity-40 disabled:cursor-not-allowed p-3 ${micEnabled
            ? (isDark ? "text-white hover:bg-white/10" : "text-[#1f2023] hover:bg-gray-200")
            : "bg-red-700 text-white"
            }`}
          title={disabled ? "Ovoz o'chirilgan" : micEnabled ? "Mikrofonni o'chirish" : "Mikrofonni yoqish"}
        >
          {micEnabled ? <Mic size={18} /> : <MicOff size={18} />}
        </button>
      </div>

      {menuOpen && (
        <div className="classroom-panel-in absolute bottom-full mb-2 left-1/2 -translate-x-1/2 z-40 w-72 max-w-[85vw] rounded-2xl bg-[#1f2023]/90 backdrop-blur-xl shadow-2xl ring-1 ring-white/10 overflow-hidden text-white">
          <DeviceSection
            icon={<Mic size={13} />}
            label="MIC"
            devices={audioInputs}
            activeId={activeAudioInputId}
            onSelect={(id) => { onSwitchAudioInput(id); setMenuOpen(false); }}
            fallbackLabel="Noma'lum mikrofon"
          />
          {hasOutputs && (
            <DeviceSection
              icon={<Volume2 size={13} />}
              label="SPEAKERS"
              devices={audioOutputs}
              activeId={activeAudioOutputId}
              onSelect={(id) => { onSwitchAudioOutput!(id); setMenuOpen(false); }}
              fallbackLabel="Noma'lum karnay"
              divider
            />
          )}
        </div>
      )}
    </div>
  );
}

function DeviceSection({
  icon, label, devices, activeId, onSelect, fallbackLabel, divider,
}: {
  icon: React.ReactNode;
  label: string;
  devices: MediaDeviceInfo[];
  activeId: string | null;
  onSelect: (deviceId: string) => void;
  fallbackLabel: string;
  divider?: boolean;
}) {
  if (devices.length === 0) return null;
  return (
    <div className={divider ? "border-t border-white/10" : ""}>
      <div className="flex items-center gap-1.5 px-3.5 pt-3 pb-1.5 text-[11px] font-semibold tracking-wide text-white/40">
        {icon}
        {label}
      </div>
      <div className="pb-2">
        {devices.map((d) => {
          const active = d.deviceId === activeId;
          return (
            <button
              key={d.deviceId}
              type="button"
              onClick={() => onSelect(d.deviceId)}
              className={`flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-sm transition-colors ${active ? "bg-white/10" : "hover:bg-white/5"
                }`}
            >
              <span className={`flex h-4 w-4 shrink-0 items-center justify-center ${active ? "text-indigo-400" : "text-transparent"}`}>
                <Check size={14} strokeWidth={3} />
              </span>
              <span className={`truncate ${active ? "text-white font-medium" : "text-white/70"}`}>
                {d.label || fallbackLabel}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
