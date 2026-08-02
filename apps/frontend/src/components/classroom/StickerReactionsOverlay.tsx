

export interface StickerReactionItem {
  id: string;
  userId: string;
  emoji: string;
  userName: string;
  isSelf: boolean;
}

interface Props {
  reactions: StickerReactionItem[];
}

// Rang palitrasidan foydalanuvchi ismi bo'yicha rang tanlash
const NAME_COLORS = [
  "#1a73e8", "#0f9d58", "#f4511e", "#ab47bc",
  "#00acc1", "#fb8c00", "#e91e63", "#43a047",
];

function getNameColor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return NAME_COLORS[Math.abs(hash) % NAME_COLORS.length];
}

// Har bir reaction uchun random horizontal pozitsiya va SwingPath
function getAnimProps(id: string) {
  // ID dan deterministik "random" qiymat olish
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = id.charCodeAt(i) + ((hash << 5) - hash);
  const r = (n: number) => ((Math.abs(hash * (n + 1) * 2654435761) >>> 0) % 1000) / 1000;

  // left: 4% dan 72% gacha (right tomondan chiqib ketmasin)
  const leftPct = 4 + r(1) * 68;

  // Swing amplitude: ± 30px
  const swingX = (r(2) - 0.5) * 60;

  // Wave frequency
  const freq = 0.8 + r(3) * 1.4;

  // Animation duration: 3.2s - 4.0s
  const dur = 3.2 + r(4) * 0.8;

  // Delay: 0 - 0.3s
  const delay = r(5) * 0.3;

  return { leftPct, swingX, freq, dur, delay };
}

export function StickerReactionsOverlay({ reactions }: Props) {
  if (!reactions || reactions.length === 0) return null;

  return (
    <>
      <style>{`
        @keyframes gmeetFloat {
          0% {
            transform: translate3d(0, 0, 0) scale(0.5);
            opacity: 0;
          }
          8% {
            transform: translate3d(0, -6vh, 0) scale(1.15);
            opacity: 1;
          }
          35% {
            transform: translate3d(var(--sx1), -30vh, 0) scale(1);
            opacity: 1;
          }
          65% {
            transform: translate3d(var(--sx2), -60vh, 0) scale(0.95);
            opacity: 0.9;
          }
          88% {
            transform: translate3d(var(--sx3), -82vh, 0) scale(0.85);
            opacity: 0.4;
          }
          100% {
            transform: translate3d(0, -95vh, 0) scale(0.75);
            opacity: 0;
          }
        }
        .gmeet-sticker {
          will-change: transform, opacity;
          animation: gmeetFloat var(--dur) linear var(--delay) forwards;
        }
        @keyframes popIn {
          0%   { transform: scale(0); }
          65%  { transform: scale(1.2); }
          85%  { transform: scale(0.95); }
          100% { transform: scale(1); }
        }
        .gmeet-emoji {
          will-change: transform;
          animation: popIn 0.35s ease-out forwards;
          display: inline-block;
        }
      `}</style>

      {reactions.map((r) => {
        const { leftPct, swingX, dur, delay } = getAnimProps(r.id);
        const sx1 = swingX * 0.3;
        const sx2 = -swingX * 0.6;
        const sx3 = swingX * 0.4;
        const sx4 = -swingX * 0.2;

        const nameColor = r.isSelf ? "#1a73e8" : getNameColor(r.userName);
        const displayName = r.isSelf ? "Siz" : r.userName;

        return (
          <div
            key={r.id}
            className="gmeet-sticker fixed bottom-20 z-50 pointer-events-none select-none flex flex-col items-center gap-1"
            style={{
              left: `${leftPct}%`,
              "--dur": `${dur}s`,
              "--delay": `${delay}s`,
              "--sx1": `${sx1}px`,
              "--sx2": `${sx2}px`,
              "--sx3": `${sx3}px`,
              "--sx4": `${sx4}px`,
            } as React.CSSProperties}
          >
            {/* Emoji — katta, animatsiyali */}
            <span className="gmeet-emoji text-4xl leading-none drop-shadow-lg">{r.emoji}</span>

            {/* Faqat ism + rangli fon — pill emas, rounded tag */}
            <span
              className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold text-white whitespace-nowrap shadow-md"
              style={{ backgroundColor: nameColor }}
            >
              {displayName}
            </span>
          </div>
        );
      })}
    </>
  );
}
