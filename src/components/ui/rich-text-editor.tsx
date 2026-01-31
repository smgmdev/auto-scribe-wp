import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import { Bold, Italic, Link as LinkIcon, Unlink } from 'lucide-react';
import { Button } from './button';
import { cn } from '@/lib/utils';
import { useCallback, useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from './dialog';
import { Input } from './input';
import { Label } from './label';

interface RichTextEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

export function RichTextEditor({ value, onChange, placeholder, className }: RichTextEditorProps) {
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false,
        bulletList: false,
        orderedList: false,
        blockquote: false,
        codeBlock: false,
        code: false,
        horizontalRule: false,
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          class: 'text-primary underline',
        },
      }),
    ],
    content: value,
    editorProps: {
      attributes: {
        class: 'prose prose-sm dark:prose-invert max-w-none min-h-[300px] p-3 focus:outline-none',
      },
    },
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
  });

  // Sync external value changes
  useEffect(() => {
    if (editor && value !== editor.getHTML()) {
      editor.commands.setContent(value);
    }
  }, [value, editor]);

  const setLink = useCallback(() => {
    if (!editor) return;

    if (linkUrl === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
    } else {
      editor.chain().focus().extendMarkRange('link').setLink({ href: linkUrl }).run();
    }
    setLinkDialogOpen(false);
    setLinkUrl('');
  }, [editor, linkUrl]);

  const openLinkDialog = useCallback(() => {
    if (!editor) return;
    const previousUrl = editor.getAttributes('link').href || '';
    setLinkUrl(previousUrl);
    setLinkDialogOpen(true);
  }, [editor]);

  if (!editor) {
    return null;
  }

  return (
    <div className={cn("border border-border rounded-lg overflow-hidden", className)}>
      {/* Toolbar */}
      <div className="flex items-center gap-1 p-2 border-b border-border bg-muted/30">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={cn(
            "h-8 w-8",
            editor.isActive('bold') && "bg-muted"
          )}
          onClick={() => editor.chain().focus().toggleBold().run()}
          title="Bold"
        >
          <Bold className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={cn(
            "h-8 w-8",
            editor.isActive('italic') && "bg-muted"
          )}
          onClick={() => editor.chain().focus().toggleItalic().run()}
          title="Italic"
        >
          <Italic className="h-4 w-4" />
        </Button>
        <div className="w-px h-6 bg-border mx-1" />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={cn(
            "h-8 w-8",
            editor.isActive('link') && "bg-muted"
          )}
          onClick={openLinkDialog}
          title="Add Link"
        >
          <LinkIcon className="h-4 w-4" />
        </Button>
        {editor.isActive('link') && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => editor.chain().focus().unsetLink().run()}
            title="Remove Link"
          >
            <Unlink className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* Editor */}
      <EditorContent 
        editor={editor} 
        className="bg-background"
      />

      {/* Link Dialog */}
      <Dialog open={linkDialogOpen} onOpenChange={setLinkDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Link</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="link-url">URL</Label>
              <Input
                id="link-url"
                placeholder="https://example.com"
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    setLink();
                  }
                }}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLinkDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={setLink}>
              {linkUrl ? 'Apply Link' : 'Remove Link'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
