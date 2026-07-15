import { useEffect, useRef, useState } from 'react';
import { BlockNoteSchema, defaultBlockSpecs, insertOrUpdateBlock } from '@blocknote/core';
import { BlockNoteView } from '@blocknote/mantine';
import {
  SuggestionMenuController,
  getDefaultReactSlashMenuItems,
  useCreateBlockNote,
} from '@blocknote/react';
import { FolderOpen } from 'lucide-react';
// @blocknote/mantine/style.css'ni to'liq (o'zgartirmasdan) ishlatamiz — undagi
// bare-specifier `@import url("@mantine/core/...")` importlarni vite.config.ts
// dagi bareCssImportsPlugin haqiqiy nisbiy yo'llarga aylantirib beradi.
import '@blocknote/mantine/style.css';
import { apiUploadMedia } from '../../api/questions';
import { MediaLibraryModal } from '../MediaLibraryModal';

const BACKEND = import.meta.env.VITE_API_URL?.replace('/api/v1', '') ?? 'http://localhost:3001';

interface EditorBlockProps {
  html: string;
  onChange: (html: string) => void;
}

// Media sifatida faqat Image qoldiramiz — Video/Audio/File alohida dars
// bloklari orqali qo'shiladi, tahrirchi ichida ularni ikki marta ko'rsatmaslik uchun.
const { video: _video, audio: _audio, file: _file, ...restBlockSpecs } = defaultBlockSpecs;
const schema = BlockNoteSchema.create({ blockSpecs: restBlockSpecs });
type EditorInstance = ReturnType<typeof useCreateBlockNote<typeof schema>>;

function toAbsoluteUrl(url: string) {
  return url.startsWith('http') ? url : `${BACKEND}${url}`;
}

async function uploadFile(file: File) {
  const { url } = await apiUploadMedia(file, 'lessons');
  return toAbsoluteUrl(url);
}

const DEBOUNCE_MS = 1500;

// Notion-uslubidagi block editor: "/" bilan komanda menyusi, drag-drop,
// formatlash toolbar, jadval/ro'yxat/kod va h.k. — BlockNote orqali.
export function EditorBlock({ html, onChange }: EditorBlockProps) {
  const editor = useCreateBlockNote({ schema, uploadFile });
  const [ready, setReady] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const initialHtmlRef = useRef(html);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingHtmlRef = useRef<string | null>(null);

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

  // Component yopilganda (unmount) kutilayotgan o'zgarishni darhol yuboramiz,
  // aks holda so'nggi tahrirlar debounce oynasi ichida yo'qolib ketishi mumkin.
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        if (pendingHtmlRef.current !== null) {
          onChangeRef.current(pendingHtmlRef.current);
        }
      }
    };
  }, []);

  async function handleChange() {
    if (!ready) return;
    const exported = await editor.blocksToFullHTML(editor.document);
    pendingHtmlRef.current = exported;
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
      if (pendingHtmlRef.current !== null) {
        onChangeRef.current(pendingHtmlRef.current);
        pendingHtmlRef.current = null;
      }
      debounceTimerRef.current = null;
    }, DEBOUNCE_MS);
  }

  function handleLibrarySelect(url: string) {
    insertOrUpdateBlock(editor as EditorInstance, {
      type: 'image',
      props: { url: toAbsoluteUrl(url) },
    } as never);
    setLibraryOpen(false);
  }

  return (
    <div className="course-editor rounded-2xl bg-white py-2">
      <BlockNoteView editor={editor} onChange={handleChange} theme="light" slashMenu={false}>
        <SuggestionMenuController
          triggerCharacter="/"
          getItems={async (query) => {
            const defaultItems = getDefaultReactSlashMenuItems(editor);
            const libraryItem = {
              title: 'Kutubxonadan rasm',
              subtext: "Avval yuklangan rasmlardan birini tanlash",
              aliases: ['kutubxona', 'library', 'rasm'],
              group: 'Media',
              icon: <FolderOpen size={18} />,
              onItemClick: () => setLibraryOpen(true),
            };
            const items = [...defaultItems, libraryItem];
            const q = query.toLowerCase().trim();
            if (!q) return items;
            return items.filter(
              (item) =>
                item.title.toLowerCase().includes(q) ||
                item.aliases?.some((alias) => alias.toLowerCase().includes(q)),
            );
          }}
        />
      </BlockNoteView>
      {libraryOpen && (
        <MediaLibraryModal
          type="image"
          folder="lessons"
          onSelect={handleLibrarySelect}
          onClose={() => setLibraryOpen(false)}
        />
      )}
    </div>
  );
}
