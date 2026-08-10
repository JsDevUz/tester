export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
}

export function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
  className = "",
}: {
  value: T;
  options: SegmentedOption<T>[];
  onChange: (value: T) => void;
  className?: string;
}) {
  return (
    <div className={`flex h-[44px] w-full rounded-2xl bg-gray-100 p-1 border border-gray-200/80 dark:bg-zinc-800 dark:border-zinc-700 ${className}`}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={`flex-1 rounded-xl text-sm font-semibold transition-all ${
            value === option.value
              ? "bg-indigo-600 text-white shadow-sm"
              : "text-gray-500 hover:text-gray-900 dark:text-zinc-400 dark:hover:text-zinc-200"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
