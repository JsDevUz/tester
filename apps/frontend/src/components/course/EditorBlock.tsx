import { useEffect, useRef, useState } from 'react';
import { BlockNoteView } from '@blocknote/mantine';
import { useCreateBlockNote } from '@blocknote/react';
// @blocknote/mantine/style.css'ni to'liq (o'zgartirmasdan) ishlatamiz — undagi
// bare-specifier `@import url("@mantine/core/...")` importlarni vite.config.ts
// dagi bareCssImportsPlugin haqiqiy nisbiy yo'llarga aylantirib beradi.
import '@blocknote/mantine/style.css';

interface EditorBlockProps {
  html: string;
  onChange: (html: string) => void;
}

// Notion-uslubidagi block editor: "/" bilan komanda menyusi, drag-drop,
// formatlash toolbar, jadval/ro'yxat/kod va h.k. — BlockNote orqali.
export function EditorBlock({ html, onChange }: EditorBlockProps) {
  const editor = useCreateBlockNote();
  const [ready, setReady] = useState(false);
  const initialHtmlRef = useRef(html);

  // Boshlang'ich HTML'ni bir marta BlockNote bloklariga aylantiramiz.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (initialHtmlRef.current) {
        const blocks = await editor.tryParseHTMLToBlocks(initialHtmlRef.current);
        if (!cancelled && blocks.length > 0) {
          editor.replaceBlocks(editor.document, blocks);
        }
      }
      if (!cancelled) setReady(true);
    })();
    return () => { cancelled = true; };
  }, [editor]);

  async function handleChange() {
    if (!ready) return;
    const exported = await editor.blocksToFullHTML(editor.document);
    onChange(exported);
  }

  return (
    <div className="course-editor overflow-hidden rounded-2xl border-2 border-gray-100 bg-white py-2">
      <BlockNoteView editor={editor} onChange={handleChange} theme="light" />
    </div>
  );
}
