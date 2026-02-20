import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { pushPopup, removePopup } from '@/lib/popup-stack';
import { useIsMobile } from '@/hooks/use-mobile';
import { GripHorizontal, X, Loader2, Pencil, Trash2, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface Category {
  id: string;
  name: string;
}

interface ManageCategoriesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: Category[];
  onEdit: (id: string, newName: string) => Promise<void>;
  onDelete: (id: string, name: string) => void;
  isSaving: boolean;
}

export function ManageCategoriesDialog({
  open, onOpenChange, categories, onEdit, onDelete, isSaving
}: ManageCategoriesDialogProps) {
  const isMobile = useIsMobile();
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0, posX: 0, posY: 0 });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');

  useEffect(() => {
    if (open) { setPosition({ x: 0, y: 0 }); setEditingId(null); }
  }, [open]);

  useEffect(() => {
    if (!open) { removePopup('manage-categories-dialog'); return; }
    pushPopup('manage-categories-dialog', () => onOpenChange(false));
    return () => removePopup('manage-categories-dialog');
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

  const handleSave = async () => {
    if (!editingName.trim() || !editingId) return;
    await onEdit(editingId, editingName.trim());
    setEditingId(null);
    setEditingName('');
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
          <h2 className="text-lg font-semibold leading-none tracking-tight mb-4">Manage Categories</h2>
          <div className="space-y-2 max-h-[400px] overflow-y-auto">
            {categories.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No categories yet</p>
            ) : (
              categories.map(cat => (
                <div key={cat.id} className="flex items-center gap-2 p-2 rounded-lg hover:bg-muted/50">
                  {editingId === cat.id ? (
                    <>
                      <Input
                        value={editingName}
                        onChange={(e) => setEditingName(e.target.value)}
                        className="flex-1 h-8 bg-background text-foreground border-input"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') { e.preventDefault(); handleSave(); }
                          else if (e.key === 'Escape') { setEditingId(null); setEditingName(''); }
                        }}
                        autoFocus
                      />
                      <Button size="icon" variant="ghost" className="h-8 w-8 hover:bg-foreground hover:text-background" onClick={handleSave} disabled={isSaving || !editingName.trim()}>
                        {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                      </Button>
                      <Button size="icon" variant="ghost" className="h-8 w-8 hover:bg-foreground hover:text-background" onClick={() => { setEditingId(null); setEditingName(''); }}>
                        <X className="h-4 w-4" />
                      </Button>
                    </>
                  ) : (
                    <>
                      <span className="flex-1 text-sm">{cat.name}</span>
                      <Button size="icon" variant="ghost" className="h-8 w-8 hover:bg-foreground hover:text-background" onClick={() => { setEditingId(cat.id); setEditingName(cat.name); }}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-8 w-8 hover:bg-foreground hover:text-background" onClick={() => onDelete(cat.id, cat.name)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </>
                  )}
                </div>
              ))
            )}
          </div>
          <div className="flex justify-end pt-4">
            <Button variant="outline" onClick={() => onOpenChange(false)} className="hover:!bg-foreground hover:!text-background">
              Close
            </Button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
