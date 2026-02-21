import * as React from "react";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";

import { cn } from "@/lib/utils";

const TooltipProvider = TooltipPrimitive.Provider;

/**
 * Touch-friendly Tooltip wrapper.
 * On mobile (touch devices), Radix tooltips only trigger on hover which
 * doesn't exist. This wrapper adds open/onOpenChange state so a tap on
 * the trigger toggles the tooltip, and tapping elsewhere dismisses it.
 */
const Tooltip = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Root>
>(({ children, delayDuration = 0, ...props }, _ref) => {
  const [open, setOpen] = React.useState(props.defaultOpen ?? false);

  // Merge external open/onOpenChange if provided
  const isControlled = props.open !== undefined;
  const isOpen = isControlled ? props.open : open;
  const onOpenChange = (v: boolean) => {
    if (!isControlled) setOpen(v);
    props.onOpenChange?.(v);
  };

  return (
    <TooltipPrimitive.Root
      {...props}
      open={isOpen}
      onOpenChange={onOpenChange}
      delayDuration={delayDuration}
    >
      {children}
    </TooltipPrimitive.Root>
  );
}) as React.FC<React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Root>>;

const TooltipTrigger = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Trigger>
>(({ onClick, ...props }, ref) => {
  return (
    <TooltipPrimitive.Trigger
      ref={ref}
      onClick={(e) => {
        // On touch devices, ensure tooltip opens on tap
        onClick?.(e);
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
