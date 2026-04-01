import { cn } from "@/lib/utils";

interface NumberStepperProps {
  className?: string;
  inputClassName?: string;
  max?: number;
  min?: number;
  onChange: (value: number) => void;
  step?: number;
  unit?: string;
  value: number;
}

export function NumberStepper({
  value,
  onChange,
  min,
  max,
  step = 1,
  unit,
  className,
  inputClassName,
}: NumberStepperProps) {
  const decrement = () => {
    const next = value - step;
    if (min === undefined || next >= min) {
      onChange(next);
    }
  };
  const increment = () => {
    const next = value + step;
    if (max === undefined || next <= max) {
      onChange(next);
    }
  };

  const canDec = min === undefined || value - step >= min;
  const canInc = max === undefined || value + step <= max;

  return (
    <div className="inline-flex items-center gap-1.5">
      <div
        className={cn(
          "inline-flex h-8 items-center overflow-hidden rounded-md border border-gray-700/60 bg-gray-800",
          className
        )}
      >
        <button
          className="h-full select-none px-2 text-base text-gray-400 leading-none transition-colors hover:bg-gray-700 hover:text-gray-100 disabled:cursor-not-allowed disabled:opacity-25"
          disabled={!canDec}
          onClick={decrement}
          tabIndex={-1}
          type="button"
        >
          −
        </button>
        <input
          className={cn(
            "w-14 border-gray-700/60 border-x bg-transparent text-center text-gray-100 text-sm tabular-nums focus:outline-none",
            "[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none",
            inputClassName
          )}
          max={max}
          min={min}
          onChange={(e) => {
            const n = Number(e.target.value);
            if (
              (min === undefined || n >= min) &&
              (max === undefined || n <= max)
            ) {
              onChange(n);
            }
          }}
          step={step}
          type="number"
          value={value}
        />
        <button
          className="h-full select-none px-2 text-base text-gray-400 leading-none transition-colors hover:bg-gray-700 hover:text-gray-100 disabled:cursor-not-allowed disabled:opacity-25"
          disabled={!canInc}
          onClick={increment}
          tabIndex={-1}
          type="button"
        >
          +
        </button>
      </div>
      {unit && (
        <span className="select-none text-gray-500 text-xs">{unit}</span>
      )}
    </div>
  );
}
