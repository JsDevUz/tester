import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';

interface EditorBlockProps {
  html: string;
  onChange: (html: string) => void;
}

export function EditorBlock({ html, onChange }: EditorBlockProps) {
  const editor = useEditor({
    extensions: [StarterKit],
    content: html,
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
    editorProps: {
      attributes: {
        class: 'prose prose-sm max-w-none focus:outline-none min-h-[100px] px-4 py-3',
      },
    },
  });

  return (
    <div className="rounded-2xl border-2 border-gray-100 bg-white">
      <EditorContent editor={editor} />
    </div>
  );
}
