import { Range, Root, Thumb, Track } from "@radix-ui/react-slider";
import {
  type ComponentPropsWithoutRef,
  type ElementRef,
  forwardRef,
} from "react";

import { cn } from "@/lib/utils";

const Slider = forwardRef<
  ElementRef<typeof Root>,
  ComponentPropsWithoutRef<typeof Root>
>(({ className, ...props }, ref) => (
  <Root
    className={cn(
      "relative flex w-full touch-none select-none items-center",
      className
    )}
    ref={ref}
    {...props}
  >
    <Track className="relative h-1.5 w-full grow overflow-hidden rounded-full bg-gray-700">
      <Range className="absolute h-full bg-blue-400" />
    </Track>
    <Thumb className="block h-4 w-4 rounded-full border-2 border-blue-400 bg-gray-900 shadow transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-400 disabled:pointer-events-none disabled:opacity-50" />
  </Root>
));
Slider.displayName = Root.displayName;

export { Slider };
