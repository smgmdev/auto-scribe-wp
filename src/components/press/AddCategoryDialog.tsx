import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { pushPopup, removePopup } from '@/lib/popup-stack';
import { useIsMobile } from '@/hooks/use-mobile';
import { GripHorizontal, X, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';

interface AddCategoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: (name: string) => Promise<void>;
  isAdding: boolean;
}

export function AddCategoryDialog({ open, onOpenChange, onAdd, isAdding }: AddCategoryDialogProps) {
  const [name, setName] = useState('');
  const isMobile = useIsMobile();
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0, posX: 0, posY: 0 });

  useEffect(() => {
    if (open) { setPosition({ x: 0, y: 0 }); setName(''); }
  }, [open]);

  useEffect(() => {
    if (!open) { removePopup('add-category-dialog'); return; }
    pushPopup('add-category-dialog', () => onOpenChange(false));
    return () => removePopup('add-category-dialog');
  }, [open, onOpenChange]);

  const handleDragStart = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest('button, input')) return;
    setIsDragging(true);
    dragStartRef.current = { x: e.clientX, y: e.clientY, posX: position.x, posY: position.y };
    e.preventDefault();
  }, [position]);

  useEffect(() => {
    if (!isDragging) return;
    const onMove = (e: MouseEvent) => {
      setPosition({
        x: dragStartRef.current.posX + (e.clientX - dragStartRef.current.x),
        y: dragStartRef.current.posY + (e.clientY - dragStartRef.current.y)
      });
    };
    const onUp = () => setIsDragging(false);
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    return () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
  }, [isDragging]);

  const handleSubmit = async () => {
    if (!name.trim()) return;
    await onAdd(name.trim());
    setName('');
  };

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[10000] flex items-center justify-center pointer-events-none">
      <div
        className={`pointer-events-auto bg-background text-foreground relative ${
          isMobile
            ? 'w-full h-[100dvh] flex flex-col overflow-hidden'
            : 'overflow-y-auto w-full max-w-[420px] max-h-[90vh] border pt-0 px-6 pb-6 shadow-lg rounded-lg'
        }`}
        style={isMobile ? undefined : { transform: `translate(${position.x}px, ${position.y}px)` }}
      >
        <div
          className={`flex items-center justify-between border-b bg-muted/30 ${
            isMobile ? 'px-3 py-1.5 shrink-0' : `px-4 py-2 -mx-6 ${isDragging ? 'cursor-grabbing' : 'cursor-grab'} select-none`
          }`}
          onMouseDown={!isMobile ? handleDragStart : undefined}
        >
          <GripHorizontal className="h-4 w-4 text-muted-foreground" />
          <button
            onClick={() => onOpenChange(false)}
            onMouseDown={(e) => !isMobile && e.stopPropagation()}
            className="rounded-sm transition-all hover:bg-foreground hover:text-background focus:outline-none h-7 w-7 flex items-center justify-center"
          >
            <X className="h-4 w-4" />
            <span className="sr-only">Close</span>
          </button>
        </div>

        <div className={isMobile ? 'flex-1 overflow-y-auto px-6 pb-6 pt-4' : 'pt-4'}>
          <h2 className="text-lg font-semibold leading-none tracking-tight mb-4">Add New Category</h2>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="new-category">Category Name</Label>
              <div className="flex items-center gap-2 border border-input rounded-md px-3 py-2 md:py-2.5 bg-background">
                <input
                  id="new-category"
                  type="text"
                  placeholder="Enter category name..."
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="flex-1 bg-transparent text-sm text-foreground placeholder:text-sm placeholder:text-muted-foreground outline-none"
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleSubmit(); } }}
                  autoFocus
                  autoComplete="off"
                />
              </div>
            </div>
          </div>
          <div className="flex flex-col-reverse md:flex-row md:justify-end gap-3 pt-6">
            <Button variant="outline" onClick={() => onOpenChange(false)} className="w-full md:w-auto hover:!bg-foreground hover:!text-background">
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={isAdding || !name.trim()}
              className="w-full md:w-auto bg-foreground text-background border border-transparent hover:!bg-transparent hover:!text-foreground hover:!border-foreground transition-all"
            >
              {isAdding ? (<><Loader2 className="h-4 w-4 mr-2 animate-spin" />Adding...</>) : 'Add Category'}
            </Button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
