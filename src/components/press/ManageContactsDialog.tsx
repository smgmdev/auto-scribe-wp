import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { pushPopup, removePopup } from '@/lib/popup-stack';
import { useIsMobile } from '@/hooks/use-mobile';
import { GripHorizontal, X, Loader2, Pencil, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface PressContact {
  id: string;
  title: string;
  name: string;
  company: string;
  email: string;
  phone: string | null;
}

interface ManageContactsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contacts: PressContact[];
  onSave: (contact: PressContact) => Promise<void>;
  isSaving: boolean;
}

export function ManageContactsDialog({
  open, onOpenChange, contacts, onSave, isSaving
}: ManageContactsDialogProps) {
  const isMobile = useIsMobile();
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0, posX: 0, posY: 0 });
  const [editingContact, setEditingContact] = useState<PressContact | null>(null);

  useEffect(() => {
    if (open) { setPosition({ x: 0, y: 0 }); setEditingContact(null); }
  }, [open]);

  useEffect(() => {
    if (!open) { removePopup('manage-contacts-dialog'); return; }
    pushPopup('manage-contacts-dialog', () => onOpenChange(false));
    return () => removePopup('manage-contacts-dialog');
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

  const handleSaveContact = async () => {
    if (!editingContact) return;
    await onSave(editingContact);
    setEditingContact(null);
  };

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[10000] flex items-center justify-center pointer-events-none">
      <div
        className={`pointer-events-auto bg-background text-foreground relative ${
          isMobile
            ? 'w-full h-[100dvh] flex flex-col overflow-hidden'
            : 'overflow-y-auto w-full max-w-[500px] max-h-[90vh] border pt-0 px-6 pb-6 shadow-lg rounded-lg'
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
          <h2 className="text-lg font-semibold leading-none tracking-tight mb-4">Manage Press Contacts</h2>
          <div className="space-y-4 max-h-[500px] overflow-y-auto">
            {contacts.map(contact => (
              <div key={contact.id} className="p-4 rounded-lg border border-border">
                {editingContact?.id === contact.id ? (
                  <div className="space-y-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Title</Label>
                      <Input value={editingContact.title} onChange={(e) => setEditingContact({ ...editingContact, title: e.target.value })} placeholder="e.g. Press Contact" className="h-9 bg-background text-foreground border-input placeholder:text-muted-foreground" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Name</Label>
                      <Input value={editingContact.name} onChange={(e) => setEditingContact({ ...editingContact, name: e.target.value })} placeholder="e.g. John Smith" className="h-9 bg-background text-foreground border-input placeholder:text-muted-foreground" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Company</Label>
                      <Input value={editingContact.company} onChange={(e) => setEditingContact({ ...editingContact, company: e.target.value })} placeholder="e.g. Arcana Mace" className="h-9 bg-background text-foreground border-input placeholder:text-muted-foreground" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Email</Label>
                      <Input type="email" value={editingContact.email} onChange={(e) => setEditingContact({ ...editingContact, email: e.target.value })} placeholder="e.g. press@arcanamace.com" className="h-9 bg-background text-foreground border-input placeholder:text-muted-foreground" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Phone (optional)</Label>
                      <Input value={editingContact.phone || ''} onChange={(e) => setEditingContact({ ...editingContact, phone: e.target.value })} placeholder="e.g. (408) 862-1142" className="h-9 bg-background text-foreground border-input placeholder:text-muted-foreground" />
                    </div>
                    <div className="flex gap-2 pt-2">
                      <Button size="sm" onClick={handleSaveContact} disabled={isSaving || !editingContact.title || !editingContact.name || !editingContact.email} className="bg-foreground text-background hover:!bg-transparent hover:!text-foreground hover:!border-foreground border border-transparent transition-all">
                        {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4 mr-1" />}
                        Save
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setEditingContact(null)} className="hover:!bg-foreground hover:!text-background">
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start justify-between">
                    <div>
                      <h4 className="font-medium text-sm">{contact.title}</h4>
                      <p className="text-sm text-foreground mt-1">{contact.name}</p>
                      <p className="text-sm text-muted-foreground">{contact.company}</p>
                      <p className="text-sm text-[#06c]">{contact.email}</p>
                      {contact.phone && <p className="text-sm text-muted-foreground">{contact.phone}</p>}
                    </div>
                    <Button size="icon" variant="ghost" className="h-8 w-8 hover:bg-foreground hover:text-background" onClick={() => setEditingContact(contact)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </div>
            ))}
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
