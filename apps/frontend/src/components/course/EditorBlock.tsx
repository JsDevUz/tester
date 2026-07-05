import { useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import { Table } from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import {
  Type, Table as TableIcon, List, Link2, Code2, Heading2, ListChecks, Minus, Plus,
} from 'lucide-react';

interface EditorBlockProps {
  html: string;
  onChange: (html: string) => void;
}

const EXTENSIONS = [
  StarterKit,
  Link.configure({ openOnClick: false }),
  Table.configure({ resizable: false }),
  TableRow,
  TableHeader,
  TableCell,
  TaskList,
  TaskItem.configure({ nested: true }),
];

interface MenuItem {
  key: string;
  label: string;
  icon: typeof Type;
  shortcut?: string;
  run: (editor: NonNullable<ReturnType<typeof useEditor>>) => void;
}

const MENU_ITEMS: MenuItem[] = [
  { key: 'paragraph', label: 'Paragraf', icon: Type, run: (e) => e.chain().focus().setParagraph().run() },
  {
    key: 'table', label: 'Jadval', icon: TableIcon,
    run: (e) => e.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(),
  },
  { key: 'list', label: "Ro'yxat", icon: List, run: (e) => e.chain().focus().toggleBulletList().run() },
  {
    key: 'link', label: 'Havola', icon: Link2, shortcut: '⌘+⇧+L',
    run: (e) => {
      const url = window.prompt('Havola URL manzilini kiriting');
      if (url) e.chain().focus().setLink({ href: url }).run();
    },
  },
  { key: 'code', label: 'HTML fragmenti', icon: Code2, run: (e) => e.chain().focus().toggleCodeBlock().run() },
  { key: 'heading', label: 'Sarlavha', icon: Heading2, run: (e) => e.chain().focus().toggleHeading({ level: 2 }).run() },
  { key: 'checklist', label: 'Tekshiruv ro\'yxati', icon: ListChecks, run: (e) => e.chain().focus().toggleTaskList().run() },
  { key: 'divider', label: 'Ajratuvchi', icon: Minus, run: (e) => e.chain().focus().setHorizontalRule().run() },
];

export function EditorBlock({ html, onChange }: EditorBlockProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const editor = useEditor({
    extensions: EXTENSIONS,
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
      <p className="px-4 pt-3 text-sm text-gray-500">Blok kontenti</p>
      <div className="relative">
        <EditorContent editor={editor} />
        {editor && (
          <div className="absolute right-3 top-3">
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              className="flex h-7 w-7 items-center justify-center rounded-lg border border-gray-100 bg-white text-gray-400 shadow-sm transition-colors hover:text-indigo-500"
            >
              <Plus size={15} />
            </button>
            {menuOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
                <div className="absolute right-0 z-50 mt-2 w-56 rounded-2xl border border-gray-100 bg-white p-1.5 shadow-lg">
                  {MENU_ITEMS.map((item) => {
                    const Icon = item.icon;
                    return (
                      <button
                        key={item.key}
                        type="button"
                        onClick={() => { item.run(editor); setMenuOpen(false); }}
                        className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm text-gray-700 transition-colors hover:bg-gray-50"
                      >
                        <Icon size={15} className="shrink-0 text-gray-400" />
                        <span className="flex-1">{item.label}</span>
                        {item.shortcut && <span className="text-xs text-gray-300">{item.shortcut}</span>}
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
