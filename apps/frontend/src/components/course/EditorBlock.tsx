import { useEffect, useRef, useState, type ClipboardEvent } from 'react';
import { BlockNoteSchema, defaultBlockSpecs, defaultInlineContentSpecs, createInlineContentSpec } from '@blocknote/core';
import { BlockNoteView } from '@blocknote/mantine';
import {
  SuggestionMenuController,
  getDefaultReactSlashMenuItems,
  useCreateBlockNote,
} from '@blocknote/react';
import { FolderOpen } from 'lucide-react';
import katex from 'katex';
// @blocknote/mantine/style.css'ni to'liq (o'zgartirmasdan) ishlatamiz — undagi
// bare-specifier `@import url("@mantine/core/...")` importlarni vite.config.ts
// dagi bareCssImportsPlugin haqiqiy nisbiy yo'llarga aylantirib beradi.
import '@blocknote/mantine/style.css';
import { apiUploadMedia } from '../../api/questions';
import { MediaLibraryModal } from '../MediaLibraryModal';
import { containsLatex, splitLatexSegments } from '../../utils/latexPaste';

const BACKEND = import.meta.env.VITE_API_URL?.replace('/api/v1', '') ?? 'http://localhost:3001';

interface EditorBlockProps {
  html: string;
  onChange: (html: string) => void;
}

function renderFormulaSpan(latex: string, display: boolean) {
  const span = document.createElement('span');
  span.setAttribute('data-latex', latex);
  if (display) span.setAttribute('data-display', 'true');
  span.innerHTML = katex.renderToString(latex, { throwOnError: false, displayMode: display });
  return span;
}

// Paste orqali kiritilgan $...$/$$...$$ LaTeX formulalarini KaTeX bilan
// render qiladigan inline content turi. Tashqi HTML eksportida ham xuddi
// shu KaTeX HTML saqlanadi (toExternalHTML), shu HTML qayta yuklanganda
// data-latex atributi orqali formula sifatida tanib olinadi (parse).
const formula = createInlineContentSpec(
  {
    type: 'formula',
    content: 'none',
    propSchema: {
      latex: { default: '' },
      display: { default: false },
    },
  },
  {
    parse: (el) => {
      const latex = el.getAttribute('data-latex');
      if (latex === null) return undefined;
      return { latex, display: el.getAttribute('data-display') === 'true' };
    },
    render: (ic) => ({ dom: renderFormulaSpan(ic.props.latex, ic.props.display) }),
    toExternalHTML: (ic) => ({ dom: renderFormulaSpan(ic.props.latex, ic.props.display) }),
  },
);

// Media sifatida faqat Image qoldiramiz — Video/Audio/File alohida dars
// bloklari orqali qo'shiladi, tahrirchi ichida ularni ikki marta ko'rsatmaslik uchun.
const { video: _video, audio: _audio, file: _file, ...restBlockSpecs } = defaultBlockSpecs;
const schema = BlockNoteSchema.create({
  blockSpecs: restBlockSpecs,
  inlineContentSpecs: {
    ...defaultInlineContentSpecs,
    formula,
  },
});

function toAbsoluteUrl(url: string) {
  return url.startsWith('http') ? url : `${BACKEND}${url}`;
}

async function uploadFile(file: File) {
  const { url } = await apiUploadMedia(file, 'lessons');
  return toAbsoluteUrl(url);
}

const DEBOUNCE_MS = 1500;

function looksLikeMarkdown(text: string) {
  return /(^|\n)\s*(#{1,6}\s|[-*+]\s|\d+\.\s|>\s|```|\|.+\|\s*$|---\s*$)/m.test(text);
}

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

  function insertParsedBlocks(blocks: Awaited<ReturnType<typeof editor.tryParseMarkdownToBlocks>>) {
    if (blocks.length === 0) return false;

    const currentBlock = editor.getTextCursorPosition().block;
    const isEmptyParagraph =
      currentBlock.type === 'paragraph' &&
      Array.isArray(currentBlock.content) &&
      currentBlock.content.length === 0;

    if (editor.document.length === 1 && isEmptyParagraph) {
      editor.replaceBlocks(editor.document, blocks);
    } else if (isEmptyParagraph) {
      editor.replaceBlocks([currentBlock.id], blocks);
    } else {
      editor.insertBlocks(blocks, currentBlock.id, 'after');
    }

    void handleChange();
    return true;
  }

  function handlePaste(event: ClipboardEvent<HTMLDivElement>) {
    const text = event.clipboardData.getData('text/plain');
    if (!text) return;

    if (containsLatex(text)) {
      // $...$/$$...$$ formulalarni alohida "formula" inline content sifatida
      // kursor pozitsiyasiga qo'shamiz — BlockNote'ning HTML parseri
      // KaTeX'ning ichma-ich <span> strukturasini tanimagan teg sifatida
      // matn ichiga "flatten" qilib yuborgani uchun, HTML orqali emas,
      // to'g'ridan-to'g'ri content massivi orqali kiritish shart.
      const content = splitLatexSegments(text).map((segment) =>
        segment.type === 'text'
          ? segment.value
          : ({ type: 'formula', props: { latex: segment.latex, display: segment.display } } as const),
      );
      editor.insertInlineContent(content as never);
      void handleChange();
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    if (!looksLikeMarkdown(text)) return;

    const blocks = editor.tryParseMarkdownToBlocks(text);
    if (insertParsedBlocks(blocks)) {
      event.preventDefault();
      event.stopPropagation();
    }
  }

  function handleLibrarySelect(url: string) {
    const currentBlock = editor.getTextCursorPosition().block;
    const isEmptyParagraph =
      currentBlock.type === 'paragraph' &&
      Array.isArray(currentBlock.content) &&
      currentBlock.content.length === 0;
    const imageBlock = { type: 'image', props: { url: toAbsoluteUrl(url) } } as never;
    if (isEmptyParagraph) {
      editor.replaceBlocks([currentBlock.id], [imageBlock]);
    } else {
      editor.insertBlocks([imageBlock], currentBlock.id, 'after');
    }
    setLibraryOpen(false);
  }

  return (
    <div
      className="course-editor rounded-2xl bg-white py-2"
      onPasteCapture={handlePaste}
    >
      <BlockNoteView editor={editor} onChange={handleChange} theme="light" slashMenu={false}>
        <SuggestionMenuController
          triggerCharacter="/"
          getItems={async (query) => {
            // Standart "Image" bandini olib tashlaymiz — o'rniga kutubxona
            // orqali ishlaydigan bitta "Rasm" bandi qoladi, shu bilan
            // ikkita alohida rasm-qo'shish yo'li ko'rinmaydi.
            const defaultItems = getDefaultReactSlashMenuItems(editor).filter(
              (item) => item.title !== 'Image',
            );
            const imageItem = {
              title: 'Rasm',
              subtext: 'Kutubxonadan tanlang yoki yangi rasm yuklang',
              aliases: ['rasm', 'image', 'picture', 'photo'],
              group: 'Media',
              icon: <FolderOpen size={18} />,
              onItemClick: () => setLibraryOpen(true),
            };
            const items = [...defaultItems, imageItem];
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
