import { useState, useEffect, useRef, useCallback, ReactNode, useId } from 'react';
import { createPortal } from 'react-dom';
import { X, GripHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useIsMobile } from '@/hooks/use-mobile';
import { pushPopup, removePopup } from '@/lib/popup-stack';

interface DraggablePopupProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
  title?: ReactNode;
  footer?: ReactNode;
  width?: number;
  maxHeight?: string;
  zIndex?: number;
  className?: string;
  /** Extra class for the scrollable body wrapper */
  bodyClassName?: string;
  /** Extra class for the drag bar / header */
  headerClassName?: string;
  /** Content rendered inline inside the drag bar (between grip icon and close button) */
  headerContent?: ReactNode;
}

export function DraggablePopup({
  open,
  onOpenChange,
  children,
  title,
  footer,
  width = 480,
  maxHeight = '85vh',
  zIndex = 200,
  className = '',
  bodyClassName = '',
  headerClassName = '',
  headerContent,
}: DraggablePopupProps) {
  const isMobile = useIsMobile();
  const popupId = useId();
  const getCenteredPosition = useCallback(() => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    return { x: (w - width) / 2, y: Math.max(40, (h - 500) / 2) };
  }, [width]);

  const [position, setPosition] = useState(getCenteredPosition);
  const [isDragging, setIsDragging] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const isDraggingRef = useRef(false);
  const positionRef = useRef(getCenteredPosition());
  const dragStartRef = useRef({ x: 0, y: 0, posX: 0, posY: 0 });
  const popupRef = useRef<HTMLDivElement>(null);

  // Re-center on open and trigger entrance animation
  useEffect(() => {
    if (open && !isMobile) {
      const newPos = getCenteredPosition();
      setPosition(newPos);
      positionRef.current = newPos;
      // Reset visibility then trigger animation on next frame
      setIsVisible(false);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setIsVisible(true));
      });
    } else if (open && isMobile) {
      setIsVisible(false);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setIsVisible(true));
      });
    } else {
      setIsVisible(false);
    }
  }, [open, isMobile, getCenteredPosition]);

  // Register with popup stack for layered ESC handling
  useEffect(() => {
    if (!open) return;
    pushPopup(popupId, () => onOpenChange(false));
    return () => removePopup(popupId);
  }, [open, popupId, onOpenChange]);

  // Mobile body scroll lock
  useEffect(() => {
    if (!open || !isMobile) return;
    const scrollY = window.scrollY;
    document.body.style.position = 'fixed';
    document.body.style.top = `-${scrollY}px`;
    document.body.style.left = '0';
    document.body.style.right = '0';
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.left = '';
      document.body.style.right = '';
      document.body.style.overflow = '';
      window.scrollTo(0, scrollY);
    };
  }, [open, isMobile]);

  // Drag handlers
  const handleDragStart = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest('button, a, input, [role="button"]')) return;
    isDraggingRef.current = true;
    setIsDragging(true);
    dragStartRef.current = { x: e.clientX, y: e.clientY, posX: positionRef.current.x, posY: positionRef.current.y };
    e.preventDefault();
  }, []);

  useEffect(() => {
    if (!isDraggingRef.current) positionRef.current = position;
  }, [position]);

  useEffect(() => {
    if (!isDragging) return;
    const handleMouseMove = (e: MouseEvent) => {
      e.preventDefault();
      const newX = dragStartRef.current.posX + (e.clientX - dragStartRef.current.x);
      const newY = dragStartRef.current.posY + (e.clientY - dragStartRef.current.y);
      positionRef.current = { x: newX, y: newY };
      if (popupRef.current) {
        popupRef.current.style.left = `${newX}px`;
        popupRef.current.style.top = `${newY}px`;
      }
    };
    const handleMouseUp = () => {
      isDraggingRef.current = false;
      setIsDragging(false);
      setPosition(positionRef.current);
    };
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);

  if (!open) return null;

  const handleClose = () => onOpenChange(false);

  const dragBar = (
    <div
      className={`flex items-center justify-between border-b bg-muted/30 shrink-0 ${headerClassName} ${
        isMobile
          ? 'px-3 py-1.5'
          : `px-4 py-2 ${isDragging ? 'cursor-grabbing' : 'cursor-grab'} select-none`
      }`}
      onMouseDown={!isMobile ? handleDragStart : undefined}
    >
      <GripHorizontal className="h-4 w-4 text-muted-foreground shrink-0" />
      {headerContent && <div className="flex-1 min-w-0">{headerContent}</div>}
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7 hover:!bg-black hover:!text-white dark:hover:!bg-white dark:hover:!text-black"
        onClick={handleClose}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  );

  // Mobile: fullscreen
  if (isMobile) {
    return createPortal(
      <div className={`fixed inset-0 bg-background flex flex-col transition-opacity duration-200 ${isVisible ? 'opacity-100' : 'opacity-0'} ${className}`} style={{ zIndex }}>
        {dragBar}
        <div className={`flex-1 overflow-y-auto p-4 ${bodyClassName}`}>
          {title && <div className="mb-3">{title}</div>}
          {children}
        </div>
        {footer && <div className="border-t p-4 shrink-0">{footer}</div>}
      </div>,
      document.body
    );
  }

  // Desktop: draggable popup
  return createPortal(
    <div
      ref={popupRef}
      className={`fixed bg-background border shadow-2xl flex flex-col ${isVisible ? 'opacity-100 scale-100' : 'opacity-0 scale-95'} ${!isVisible ? 'transition-all duration-200' : ''} ${className}`}
      style={{
        zIndex,
        left: `${positionRef.current.x}px`,
        top: `${positionRef.current.y}px`,
        width,
        maxHeight,
        willChange: isDragging ? 'left, top' : 'auto',
        transformOrigin: 'center center',
      }}
    >
      {dragBar}
      <div className={`overflow-y-auto p-4 ${bodyClassName}`}>
        {title && <div className="mb-3">{title}</div>}
        {children}
      </div>
      {footer && <div className="border-t p-4 shrink-0">{footer}</div>}
    </div>,
    document.body
  );
}
