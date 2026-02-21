import * as React from "react";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";

import { cn } from "@/lib/utils";

const TooltipProvider = TooltipPrimitive.Provider;

// Shared context to allow trigger to toggle tooltip on touch
const TouchToggleContext = React.createContext<{
  toggle: () => void;
} | null>(null);

/**
 * Touch-friendly Tooltip wrapper.
 * On mobile/touch, Radix tooltips only work on hover. This wrapper
 * manages open state and lets the trigger toggle on tap.
 */
const Tooltip: React.FC<React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Root>> = ({
  children,
  delayDuration = 0,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
  ...props
}) => {
  const [internalOpen, setInternalOpen] = React.useState(false);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;

  const onOpenChange = React.useCallback((v: boolean) => {
    if (!isControlled) setInternalOpen(v);
    controlledOnOpenChange?.(v);
  }, [isControlled, controlledOnOpenChange]);

  const toggle = React.useCallback(() => {
    onOpenChange(!open);
  }, [open, onOpenChange]);

  // Close on outside tap (for mobile)
  React.useEffect(() => {
    if (!open) return;
    const handleTouch = () => {
      // Small delay to let the trigger click fire first
      setTimeout(() => onOpenChange(false), 150);
    };
    document.addEventListener('touchstart', handleTouch, { passive: true });
    return () => document.removeEventListener('touchstart', handleTouch);
  }, [open, onOpenChange]);

  return (
    <TouchToggleContext.Provider value={{ toggle }}>
      <TooltipPrimitive.Root
        {...props}
        open={open}
        onOpenChange={onOpenChange}
        delayDuration={delayDuration}
      >
        {children}
      </TooltipPrimitive.Root>
    </TouchToggleContext.Provider>
  );
};

const TooltipTrigger = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Trigger>
>(({ onClick, onTouchEnd, ...props }, ref) => {
  const ctx = React.useContext(TouchToggleContext);

  return (
    <TooltipPrimitive.Trigger
      ref={ref}
      onClick={(e) => {
        onClick?.(e);
      }}
      onTouchEnd={(e) => {
        // Toggle tooltip on tap for touch devices
        e.stopPropagation();
        ctx?.toggle();
        onTouchEnd?.(e);
      }}
      {...props}
    />
  );
});
TooltipTrigger.displayName = "TooltipTrigger";

const TooltipContent = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(({ className, sideOffset = 4, collisionPadding = 16, align = "center", ...props }, ref) => (
  <TooltipPrimitive.Portal>
    <TooltipPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      collisionPadding={collisionPadding}
      avoidCollisions={true}
      align={align}
      className={cn(
        "z-[9999] overflow-hidden rounded-md bg-popover px-3 py-1.5 text-sm text-popover-foreground shadow-md animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 max-w-[calc(100vw-32px)]",
        className,
      )}
      {...props}
    />
  </TooltipPrimitive.Portal>
));
TooltipContent.displayName = TooltipPrimitive.Content.displayName;

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider };
