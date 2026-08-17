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
  disabled, theme: _theme = 'light',
}: Props) {
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

  const hasOutputs = audioOutputs.length > 0 && !!onSwitchAudioOutput;

  return (
    <div ref={wrapRef} className="relative inline-flex items-center select-none">
      {/* Google Meet style Split Pill Button */}
      <div
        className={`flex items-center h-11 rounded-full overflow-hidden shadow-lg transition-all duration-200 ${
          micEnabled
            ? "bg-[#37393e] text-white"
            : "bg-[#601410] text-[#fce8e6]"
        }`}
      >
        {/* Left Segment: Audio Settings Chevron */}
        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          disabled={disabled}
          className={`flex h-full w-9 sm:w-10 items-center justify-center transition-colors disabled:opacity-40 cursor-pointer ${
            micEnabled
              ? "bg-[#37393e] hover:bg-[#43464c] text-[#c4c7c5] hover:text-white"
              : "bg-[#601410] hover:bg-[#731915] text-[#fce8e6]"
          }`}
          title="Audio settings"
        >
          {menuOpen ? <ChevronDown size={17} strokeWidth={2.5} /> : <ChevronUp size={17} strokeWidth={2.5} />}
        </button>

        {/* Right Segment: Microphone Toggle Button */}
        <button
          type="button"
          onClick={onToggleMic}
          disabled={disabled}
          className={`flex h-full w-12 sm:w-13 items-center justify-center rounded-r-full rounded-l-xl transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer ${
            micEnabled
              ? "bg-[#45474f] hover:bg-[#50535c] text-white"
              : "bg-[#f9d8d6] hover:bg-[#fad0cd] text-[#601410]"
          }`}
          title={disabled ? "Ovoz o'chirilgan" : micEnabled ? "Mikrofonni o'chirish" : "Mikrofonni yoqish"}
        >
          {micEnabled ? (
            <Mic size={19} strokeWidth={2.2} />
          ) : (
            <MicOff size={19} strokeWidth={2.2} />
          )}
        </button>
      </div>

      {menuOpen && (
        <div className="classroom-panel-in glass-card absolute bottom-full mb-3 left-1/2 -translate-x-1/2 z-50 w-72 max-w-[88vw] rounded-3xl p-2.5 shadow-2xl text-[var(--text-primary)] overflow-hidden animate-in fade-in zoom-in-95 duration-150">
          <div className="px-3 pt-1 pb-2 border-b border-black/5 dark:border-white/10">
            <p className="text-xs font-bold text-[var(--text-primary)] tracking-wide">Audio settings</p>
          </div>
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
    <div className={divider ? "border-t border-black/5 dark:border-white/10 mt-1" : ""}>
      <div className="flex items-center gap-1.5 px-3.5 pt-3 pb-1.5 text-[11px] font-bold tracking-wider text-[var(--text-muted)]">
        <span className="text-indigo-600 dark:text-indigo-400">{icon}</span>
        <span>{label}</span>
      </div>
      <div className="pb-1 flex flex-col gap-0.5">
        {devices.map((d) => {
          const active = d.deviceId === activeId;
          return (
            <button
              key={d.deviceId}
              type="button"
              onClick={() => onSelect(d.deviceId)}
              className={`flex w-full items-center gap-2.5 px-3 py-2 rounded-xl text-left text-xs transition-all cursor-pointer ${
                active
                  ? "bg-indigo-600 text-white font-bold shadow-md"
                  : "text-[var(--text-secondary)] hover:bg-[var(--card-hover)] hover:text-[var(--text-primary)] font-medium"
              }`}
            >
              <span className={`flex h-4 w-4 shrink-0 items-center justify-center ${active ? "text-white" : "text-transparent"}`}>
                <Check size={13} strokeWidth={3} />
              </span>
              <span className="truncate">
                {d.label || fallbackLabel}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
