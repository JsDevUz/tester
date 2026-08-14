import type React from "react";
import { useState, useMemo } from "react";

const BACKEND =
  import.meta.env.VITE_API_URL?.replace("/api/v1", "") ??
  "http://localhost:3001";

export function mediaUrl(url: string) {
  return url.startsWith("http") ? url : `${BACKEND}${url}`;
}

export function SliderInput({
  options,
  value,
  onChange,
  locked,
}: {
  options: Array<{ text: string }>;
  value: string;
  onChange: (v: string) => void;
  locked?: boolean;
}) {
  const min = options[0] ? parseFloat(options[0].text) : 0;
  const max = options[1] ? parseFloat(options[1].text) : 100;
  const step = options[2] ? parseFloat(options[2].text) : 1;
  const current =
    value !== "" ? parseFloat(value) : Math.round((min + max) / 2);
  return (
    <div className="flex flex-col gap-2">
      <div className="text-center text-3xl font-bold text-gray-900">
        {current}
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={current}
        disabled={locked}
        onChange={(e) => onChange(e.target.value)}
        className="w-full accent-gray-900 h-2 cursor-pointer disabled:opacity-60"
      />
      <div className="flex justify-between text-xs text-gray-400">
        <span>{min}</span>
        <span>{max}</span>
      </div>
    </div>
  );
}

export function DropPinInput({
  imageUrl,
  value,
  onChange,
  locked,
}: {
  imageUrl: string;
  value: string;
  onChange: (v: string) => void;
  locked?: boolean;
}) {
  const pin = value ? value.split(",").map(Number) : null;
  function handleClick(e: React.MouseEvent<HTMLDivElement>) {
    if (locked) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width).toFixed(4);
    const y = ((e.clientY - rect.top) / rect.height).toFixed(4);
    onChange(`${x},${y}`);
  }
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-gray-400">Rasmda to'g'ri joyni bosing</p>
      <div
        className={`relative w-full rounded-2xl overflow-hidden select-none ${locked ? "cursor-default" : "cursor-crosshair"}`}
        onClick={handleClick}
      >
        {imageUrl ? (
          <img
            src={imageUrl}
            alt=""
            className="w-full object-contain pointer-events-none"
            draggable={false}
          />
        ) : (
          <div className="w-full h-48 bg-gray-100 flex items-center justify-center text-gray-400 text-sm">
            Rasm yo'q
          </div>
        )}
        {pin && (
          <div
            className="absolute w-6 h-6 -translate-x-1/2 -translate-y-1/2 pointer-events-none"
            style={{ left: `${pin[0] * 100}%`, top: `${pin[1] * 100}%` }}
          >
            <div className="w-6 h-6 rounded-full bg-red-500 border border-white shadow-lg flex items-center justify-center">
              <div className="w-2 h-2 rounded-full bg-white" />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function MatchingInput({
  options,
  selected,
  onSelect,
  locked,
}: {
  options: Array<{ id: string; text: string }>;
  selected: string[];
  onSelect: (ids: string[]) => void;
  locked?: boolean;
}) {
  const lefts = useMemo(
    () =>
      [...options.filter((_, i) => i % 2 === 0)].sort(
        () => Math.random() - 0.5,
      ),
    [options],
  );
  const rights = useMemo(
    () =>
      [...options.filter((_, i) => i % 2 !== 0)].sort(
        () => Math.random() - 0.5,
      ),
    [options],
  );
  const [pendingLeft, setPendingLeft] = useState<string | null>(null);

  const pairedLeftIds = selected.filter((_, i) => i % 2 === 0);
  const pairedRightIds = selected.filter((_, i) => i % 2 !== 0);

  function tapLeft(id: string) {
    if (locked) return;
    const existingIdx = pairedLeftIds.indexOf(id);
    if (existingIdx !== -1) {
      const newSel = [...selected];
      newSel.splice(existingIdx * 2, 2);
      onSelect(newSel);
    }
    setPendingLeft(id);
  }
  function tapRight(id: string) {
    if (locked || !pendingLeft) return;
    const existingIdx = pairedRightIds.indexOf(id);
    const newSel =
      existingIdx !== -1
        ? selected.filter((_, i) => Math.floor(i / 2) !== existingIdx)
        : [...selected];
    onSelect([...newSel, pendingLeft, id]);
    setPendingLeft(null);
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-gray-400">
        Chap tomondagini bosing, keyin mos o'ng tomondagini bosing
      </p>
      <div className="grid grid-cols-2 gap-2">
        <div className="flex flex-col gap-2">
          {lefts.map((opt) => {
            const isPaired = pairedLeftIds.includes(opt.id);
            const isPending = pendingLeft === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => tapLeft(opt.id)}
                className={`px-3 py-2.5 rounded-2xl border text-left transition-colors text-sm ${isPending
                  ? "bg-gray-900 text-white border-gray-900"
                  : isPaired
                    ? "bg-gray-100 border-gray-300 text-gray-700"
                    : "bg-white border-border text-gray-700 hover:border-gray-300"
                  } ${locked ? "pointer-events-none" : ""}`}
              >
                {opt.text}
              </button>
            );
          })}
        </div>
        <div className="flex flex-col gap-2">
          {rights.map((opt) => {
            const isPaired = pairedRightIds.includes(opt.id);
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => tapRight(opt.id)}
                disabled={(!pendingLeft && !isPaired) || locked}
                className={`px-3 py-2.5 rounded-2xl border text-left transition-colors text-sm ${isPaired
                  ? "bg-gray-100 border-gray-300 text-gray-700"
                  : pendingLeft
                    ? "bg-white border-border text-gray-700 hover:border-green-400 hover:bg-green-50"
                    : "bg-gray-50 border-border text-gray-400"
                  }`}
              >
                {opt.text}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function ArrangeInput({
  options,
  selected,
  onSelect,
  locked,
}: {
  options: Array<{ id: string; text: string }>;
  selected: string[];
  onSelect: (ids: string[]) => void;
  locked?: boolean;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="min-h-14 p-3 border border-dashed border-gray-300 rounded-2xl flex flex-wrap gap-2 items-center bg-gray-50">
        {selected.length === 0 && (
          <span className="text-xs text-gray-300 px-1">
            Bo'laklarni bosib joylashtiring...
          </span>
        )}
        {selected.map((id) => {
          const opt = options.find((o) => o.id === id);
          return opt ? (
            <button
              key={id}
              type="button"
              disabled={locked}
              onClick={() => onSelect(selected.filter((x) => x !== id))}
              className="px-3.5 py-2 bg-gray-900 text-white rounded-xl  hover:bg-gray-800 active:scale-95 transition-all text-sm"
            >
              {opt.text}
            </button>
          ) : null;
        })}
      </div>
      <div className="flex flex-wrap gap-2">
        {options
          .filter((o) => !selected.includes(o.id))
          .map((opt) => (
            <button
              key={opt.id}
              type="button"
              disabled={locked}
              onClick={() => onSelect([...selected, opt.id])}
              className="px-3.5 py-2 bg-white rounded-xl text-gray-700 hover:border-gray-400 hover:text-gray-900 active:scale-95 transition-all text-sm"
            >
              {opt.text}
            </button>
          ))}
      </div>
    </div>
  );
}

export function ReorderInput({
  options,
  selected,
  onSelect,
  locked,
}: {
  options: Array<{ id: string; text: string }>;
  selected: string[];
  onSelect: (ids: string[]) => void;
  locked?: boolean;
}) {
  const ids = selected.length > 0 ? selected : options.map((o) => o.id);
  function move(idx: number, dir: -1 | 1) {
    if (locked) return;
    const j = idx + dir;
    if (j < 0 || j >= ids.length) return;
    const next = [...ids];
    [next[idx], next[j]] = [next[j], next[idx]];
    onSelect(next);
  }
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-gray-400 mb-1">
        Tugmalar bilan to'g'ri tartibga soling
      </p>
      {ids.map((id, pos) => {
        const opt = options.find((o) => o.id === id);
        if (!opt) return null;
        return (
          <div
            key={id}
            className="flex items-center gap-2 px-4 py-3 rounded-2xl border bg-white border-border"
          >
            <span className="text-gray-300 text-sm font-mono w-5 shrink-0">
              {pos + 1}.
            </span>
            <span className="flex-1 text-gray-800 text-sm">{opt.text}</span>
            <div className="flex flex-col gap-0.5">
              <button
                type="button"
                disabled={locked || pos === 0}
                onClick={() => move(pos, -1)}
                className="text-gray-400 disabled:opacity-30 px-1"
              >
                ▲
              </button>
              <button
                type="button"
                disabled={locked || pos === ids.length - 1}
                onClick={() => move(pos, 1)}
                className="text-gray-400 disabled:opacity-30 px-1"
              >
                ▼
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

