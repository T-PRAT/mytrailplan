import { cn } from "@/lib/utils"

interface NumberStepperProps {
  value: number
  onChange: (value: number) => void
  min?: number
  max?: number
  step?: number
  unit?: string
  className?: string
  inputClassName?: string
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
    const next = value - step
    if (min === undefined || next >= min) onChange(next)
  }
  const increment = () => {
    const next = value + step
    if (max === undefined || next <= max) onChange(next)
  }

  const canDec = min === undefined || value - step >= min
  const canInc = max === undefined || value + step <= max

  return (
    <div className="inline-flex items-center gap-1.5">
      <div className={cn("inline-flex items-center rounded-md overflow-hidden bg-gray-800 border border-gray-700/60 h-8", className)}>
        <button
          type="button"
          onClick={decrement}
          disabled={!canDec}
          className="px-2 text-gray-400 hover:text-gray-100 hover:bg-gray-700 transition-colors disabled:opacity-25 disabled:cursor-not-allowed h-full select-none text-base leading-none"
          tabIndex={-1}
        >
          −
        </button>
        <input
          type="number"
          value={value}
          min={min}
          max={max}
          step={step}
          onChange={e => {
            const n = Number(e.target.value)
            if ((min === undefined || n >= min) && (max === undefined || n <= max)) onChange(n)
          }}
          className={cn(
            "w-14 bg-transparent text-gray-100 text-sm text-center tabular-nums focus:outline-none border-x border-gray-700/60",
            "[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none",
            inputClassName,
          )}
        />
        <button
          type="button"
          onClick={increment}
          disabled={!canInc}
          className="px-2 text-gray-400 hover:text-gray-100 hover:bg-gray-700 transition-colors disabled:opacity-25 disabled:cursor-not-allowed h-full select-none text-base leading-none"
          tabIndex={-1}
        >
          +
        </button>
      </div>
      {unit && <span className="text-xs text-gray-500 select-none">{unit}</span>}
    </div>
  )
}
