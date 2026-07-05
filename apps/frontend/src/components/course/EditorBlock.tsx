import { useEffect, useRef, useState } from 'react';
import { BlockNoteView } from '@blocknote/mantine';
import { useCreateBlockNote } from '@blocknote/react';
// @blocknote/mantine/style.css o'zining mantineStyles.css qismida Mantine
// komponent CSS'larini `@import url("@mantine/core/styles/X.css")` ko'rinishida
// import qiladi — `url()` ichidagi bare specifier'ni Vite/postcss-import hal
// qila olmaydi. ./blocknote-mantine.css o'sha ro'yxatni url()siz qayta hosil
// qiladi, shuning uchun Vite to'g'ri resolve qila oladi va BlockNote'ning
// Mantine asosidagi UI'si (menyu, popover, tugmalar) to'g'ri stillanadi.
import './blocknote-mantine.css';
import '@blocknote/core/style.css';
import '@blocknote/react/style.css';

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
