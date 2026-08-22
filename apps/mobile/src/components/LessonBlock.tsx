import React, { useEffect, useMemo, useState } from 'react';
import {
  Image,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import type { TextStyle, ViewStyle } from 'react-native';
import RenderHtml, {
  IMGElement,
  useIMGElementProps,
  type CustomBlockRenderer,
  type MixedStyleDeclaration,
} from 'react-native-render-html';
import TableRenderer, { tableModel } from '@native-html/table-plugin';
import { useColorScheme } from 'nativewind';
import { WebView } from 'react-native-webview';
import {
  ChevronRight,
  Download,
  FileText,
  Image as ImageIcon,
  Radio,
} from 'lucide-react-native';
import type { ApiContentBlock } from '../types/api';
import { LazyVideoPlayer } from './LazyVideoPlayer';
import { ImageLightbox } from './ImageLightbox';
import { PdfViewerSheet } from './PdfViewerSheet';
import { CachedImage } from './common/CachedImage';
import { getCachedImageUri, memoryCache } from '../lib/imageCache';

// KaTeX embeds <svg>/MathML inside formula spans, which
// react-native-render-html v6 can't render (it silently drops unknown
// tags) - collapse each formula down to its LaTeX source so it shows as
// readable text instead of disappearing.
// react-native-render-html normalises whitespace inside <pre> the way it does
// for ordinary HTML text, which flattens ASCII tree diagrams / code samples
// onto a single line. Pulling the literal <pre> bodies straight out of the
// source HTML (before parsing) keeps their newlines and indentation intact;
// they're keyed by index and looked up again by the custom <pre> renderer.
function collectPreBlocks(html: string): string[] {
  const blocks: string[] = [];
  const re = /<pre\b[^>]*>([\s\S]*?)<\/pre>/gi;
  let match = re.exec(html);
  while (match) {
    const text = decodeHtmlEntities(String(match[1]).replace(/<[^>]+>/g, ''));
    blocks.push(text.replace(/^\n+|\s+$/g, '').replace(/\n{2,}/g, '\n'));
    match = re.exec(html);
  }
  return blocks;
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');
}

function stripKatexMarkup(html: string): string {
  return html.replace(
    /<span([^>]*\bdata-latex="([^"]*)"[^>]*)>[\s\S]*?<\/span>/g,
    (_match, _attrs, latex) => `<span class="formula-fallback">${latex}</span>`,
  );
}

// @native-html/table-plugin injects a `width=device-width` viewport meta tag,
// which makes the WebView shrink table columns to fit the screen (wrapping
// cell text mid-word) instead of wrapping at word boundaries like a normal
// web table. table-layout: fixed + a per-cell max-width lets cells wrap
// text normally; the table only overflows into horizontal scroll when it
// genuinely has more columns than fit, instead of always stretching wide.
const TABLE_CSS_RULES = `
  :root { font-family: sans-serif; background-color: transparent; }
  body, html {
    margin: 0;
    background-color: transparent;
    overflow-x: auto;
    user-select: none;
  }
  a:link, a:visited { color: #3498DB; }
  table {
    border: 0;
    padding: 0;
    border-collapse: collapse;
    margin-left: auto;
    margin-right: auto;
    width: max-content;
    max-width: 850px;
  }
  th, td {
    padding: 0.25em 0.6em;
    text-align: center;
    white-space: normal;
    word-break: break-word;
    min-width: 90px;
    max-width: 320px;
  }
  table, th, td { margin: 0; }
  tr:nth-of-type(odd) th, tr:nth-of-type(even) th {
    background-color: #253546;
    color: #FFFFFF;
  }
  tr:nth-of-type(odd) td { background-color: #e2e2e2; color: #333333; }
  tr:nth-of-type(even) td { background-color: #FFFFFF; color: #333333; }
  th { border-bottom: 1px solid #3f5c7a; }
  td { border-bottom: 1px solid #b5b5b5; }
  tr:last-of-type td { border-bottom: none; }
`;

function useLessonHtmlStyles() {
  const { colorScheme } = useColorScheme();
  const dark = colorScheme === 'dark';

  return useMemo(() => {
    const ink = dark ? '#e8eaed' : '#111827';
    const muted = dark ? '#a4a7b2' : '#64748b';
    const border = dark ? '#454752' : '#e2e8f0';

    const baseStyle: MixedStyleDeclaration = {
      color: ink,
      fontSize: 15,
      lineHeight: 24,
    };

    const heading: MixedStyleDeclaration = {
      color: ink,
      fontWeight: '800',
      marginTop: 16,
      marginBottom: 8,
    };

    const tagsStyles: Record<string, MixedStyleDeclaration> = {
      p: { marginTop: 0, marginBottom: 10 },
      h1: { ...heading, fontSize: 24 },
      h2: { ...heading, fontSize: 20 },
      h3: { ...heading, fontSize: 17 },
      strong: { fontWeight: '700' },
      b: { fontWeight: '700' },
      em: { fontStyle: 'italic' },
      i: { fontStyle: 'italic' },
      a: { color: '#6366f1', textDecorationLine: 'underline' },
      ul: { marginTop: 0, marginBottom: 10 },
      ol: { marginTop: 0, marginBottom: 10 },
      li: { marginBottom: 4 },
      blockquote: {
        marginLeft: 0,
        paddingLeft: 12,
        borderLeftWidth: 3,
        borderLeftColor: border,
        color: muted,
      },
      code: {
        fontFamily: 'monospace',
        color: ink,
        backgroundColor: dark ? '#24252c' : '#f1f5f9',
        paddingHorizontal: 4,
        borderRadius: 4,
      },
      pre: {
        fontFamily: 'monospace',
        // Explicit color: react-native-render-html's custom block renderers
        // don't reliably inherit baseStyle.color, so <pre> text rendered
        // dark-on-dark without this.
        color: ink,
        // Matches the web reader's ~15px monospace: 13px rendered Arabic
        // diacritics too small to read on a phone.
        fontSize: 15,
        lineHeight: 24,
        backgroundColor: dark ? '#24252c' : '#f1f5f9',
        padding: 16,
        borderRadius: 12,
        marginTop: 4,
        marginBottom: 10,
      },
      hr: { borderColor: border },
      'formula-fallback': {
        fontFamily: 'monospace',
        color: dark ? '#a5b4fc' : '#4338ca',
      },
    };

    return { baseStyle, tagsStyles };
  }, [dark]);
}

export function LessonBlock({
  block,
  lessonId,
  lessonTitle,
  courseId,
  courseTitle,
  schoolId,
  onOpenLiveClassReplay,
}: {
  block: ApiContentBlock;
  lessonId?: string;
  lessonTitle?: string;
  courseId?: string;
  courseTitle?: string;
  schoolId?: string;
  onOpenLiveClassReplay: (classSessionId: string) => void;
}) {
  const { width } = useWindowDimensions();
  const [lightboxUri, setLightboxUri] = useState<string | null>(null);
  const [pdfSheetOpen, setPdfSheetOpen] = useState(false);
  const { baseStyle, tagsStyles } = useLessonHtmlStyles();
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === 'dark';

  if (block.type === 'editor' && block.html) {
    const preparedHtml = stripKatexMarkup(block.html);
    const preBlocks = collectPreBlocks(preparedHtml);
    let preCursor = 0;
    const TappableImage: CustomBlockRenderer = props => {
      const imgProps = useIMGElementProps(props);
      const uri = imgProps.source?.uri;
      const [localUri, setLocalUri] = useState<string | undefined>(
        uri ? memoryCache.get(uri) || uri : undefined,
      );

      useEffect(() => {
        if (!uri || !uri.startsWith('http')) return;
        let cancelled = false;
        getCachedImageUri(uri, 'general')
          .then(cached => {
            if (!cancelled && cached) setLocalUri(cached);
          })
          .catch(() => {});
        return () => {
          cancelled = true;
        };
      }, [uri]);

      const resolvedProps = useMemo(() => {
        if (!localUri || localUri === uri) return imgProps;
        return {
          ...imgProps,
          source: { ...imgProps.source, uri: localUri },
        };
      }, [imgProps, localUri, uri]);

      return (
        <Pressable onPress={() => (localUri || uri) && setLightboxUri(localUri || uri!)}>
          <IMGElement {...resolvedProps} />
        </Pressable>
      );
    };

    // <pre> must keep its literal newlines and runs of spaces (ASCII tree
    // diagrams, code samples). Rendering the children through
    // TNodeChildrenRenderer collapses that whitespace the way normal HTML
    // text does, so the whole block ends up on one line - read the raw text
    // off the DOM node instead and print it verbatim.
    const PreBlock: CustomBlockRenderer = props => {
      // react-native-render-html collapses whitespace inside <pre> like it
      // does for ordinary text, flattening ASCII diagrams onto one line.
      // The literal bodies were pulled off the source HTML up front; consume
      // them in document order as each <pre> renders.
      const rawText = preBlocks[preCursor++] ?? '';
      // Put the block chrome (background, padding, radius) on the outer View
      // so it spans the full content width like the web reader does - left on
      // the inner Text it shrink-wraps to the diagram and looks half-width.
      const {
        backgroundColor,
        padding,
        borderRadius,
        marginTop,
        marginBottom,
        ...restStyle
      } = (StyleSheet.flatten(props.style) ?? {}) as TextStyle & ViewStyle;
      // The inherited lineHeight is meant for flowing prose; per-line Texts
      // need a tighter one or the diagram ends up double-spaced.
      const { lineHeight: _ignored, ...textStyle } = restStyle;
      void _ignored;
      return (
        <View
          style={{ backgroundColor, borderRadius, marginTop, marginBottom }}
          className="w-full overflow-hidden"
        >
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ padding }}
          >
            <Text
              style={[
                textStyle,
                // Single Text so the lines keep the font's natural spacing -
                // per-line Texts get padded far apart by Arabic font metrics.
                // Each line is prefixed with a left-to-right mark so the bidi
                // algorithm doesn't flip the ASCII branches to the right.
                {
                  color: isDark ? '#f8fafc' : textStyle.color || '#111827',
                  flexShrink: 0,
                  writingDirection: 'ltr',
                  textAlign: 'left',
                },
              ]}
            >
              {rawText
                .split('\n')
                .map(line => '\u200e' + line)
                .join('\n')}
            </Text>
          </ScrollView>
        </View>
      );
    };

    return (
      <>
        <RenderHtml
          contentWidth={width - 32}
          source={{ html: preparedHtml }}
          baseStyle={baseStyle}
          tagsStyles={tagsStyles}
          customHTMLElementModels={{ table: tableModel }}
          WebView={WebView}
          renderersProps={{
            img: {
              enableExperimentalPercentWidth: true,
              // Lesson images rarely ship width/height attributes, so
              // react-native-render-html falls back to a 100x100 box and
              // resizes once it fetches the real dimensions - that jump
              // shifts everything below it and drags the scroll position
              // with it. A 16:9 placeholder close to the eventual size
              // keeps the layout stable while the real size loads.
              initialDimensions: { width: width - 32, height: ((width - 32) * 9) / 16 },
            },
            table: {
              cssRules: TABLE_CSS_RULES,
              webViewProps: { scrollEnabled: true },
            },
          }}
          renderers={{
            img: TappableImage,
            pre: PreBlock,
            table: TableRenderer,
          }}
        />
        {lightboxUri && (
          <ImageLightbox
            uri={lightboxUri}
            onClose={() => setLightboxUri(null)}
          />
        )}
      </>
    );
  }

  if (block.type === 'video') {
    if (block.embedUrl) {
      return (
        <View className="mt-3 aspect-video w-full overflow-hidden rounded-2xl bg-black">
          <WebView source={{ uri: block.embedUrl }} allowsInlineMediaPlayback />
        </View>
      );
    }
    if (block.processingStatus && block.processingStatus !== 'ready') {
      return (
        <View className="mt-3 flex-row items-center justify-center gap-2 rounded-2xl border border-slate-100 bg-white py-10 dark:border-transparent dark:bg-dark-surface-2">
          <Text className="text-sm font-semibold text-slate-400 dark:text-dark-muted">
            Video tayyorlanmoqda...
          </Text>
        </View>
      );
    }
    return (
      <LazyVideoPlayer
        blockId={block.id}
        title={block.label || block.fileName || lessonTitle || 'Video dars'}
        posterUrl={block.previewUrl}
      />
    );
  }

  if (block.type === 'image' && block.previewUrl) {
    return (
      <>
        <Pressable
          onPress={() => setLightboxUri(block.previewUrl!)}
          className="mt-3"
        >
          <CachedImage
            source={{ uri: block.previewUrl }}
            category="general"
            className="h-52 w-full rounded-2xl bg-slate-100 dark:bg-dark-surface-2"
            resizeMode="contain"
          />
          {block.label ? (
            <Text className="mt-2 text-xs font-semibold text-slate-400 dark:text-dark-muted">
              {block.label}
            </Text>
          ) : null}
        </Pressable>
        {lightboxUri && (
          <ImageLightbox
            uri={lightboxUri}
            onClose={() => setLightboxUri(null)}
          />
        )}
      </>
    );
  }

  if (block.type === 'file' && block.previewUrl) {
    const ext =
      (block.fileName ?? block.label ?? 'FILE')
        .split('.')
        .pop()
        ?.toUpperCase() ?? 'FILE';
    const isPdf = ext === 'PDF';
    return (
      <>
        <Pressable
          onPress={() => {
            if (isPdf) setPdfSheetOpen(true);
            else void Linking.openURL(block.previewUrl!);
          }}
          className="mt-3 flex-row items-center gap-3 rounded-xl border border-slate-100 bg-white px-3 py-2.5 dark:border-transparent dark:bg-dark-surface-2"
        >
          <View className="h-10 w-10 items-center justify-center rounded-lg bg-slate-900 dark:bg-dark-surface">
            <Text className="text-[11px] font-black text-white">
              {ext.slice(0, 4)}
            </Text>
          </View>
          <View className="min-w-0 flex-1">
            <Text
              numberOfLines={1}
              className="text-sm font-bold text-ink dark:text-dark-ink"
            >
              {block.label || block.fileName || 'Fayl'}
            </Text>
            <Text className="text-xs font-semibold text-slate-400 dark:text-dark-muted">
              {isPdf ? "Ko'rish" : 'Yuklab olish'}
            </Text>
          </View>
          <Download size={18} color={isDark ? '#a4a7b2' : '#94a3b8'} />
        </Pressable>
        {isPdf && (
          <PdfViewerSheet
            visible={pdfSheetOpen}
            uri={block.previewUrl}
            title={block.label || block.fileName || 'Fayl'}
            onClose={() => setPdfSheetOpen(false)}
            onDownload={() => void Linking.openURL(block.previewUrl!)}
          />
        )}
      </>
    );
  }

  if (block.type === 'live_class' && block.classSessionId) {
    return (
      <Pressable
        onPress={() => onOpenLiveClassReplay(block.classSessionId!)}
        className="mt-3 flex-row items-center gap-3 rounded-xl border border-slate-100 bg-white px-3 py-2.5 dark:border-transparent dark:bg-dark-surface-2"
      >
        <View className="h-10 w-10 items-center justify-center rounded-lg bg-indigo-600">
          <Radio size={18} color="white" />
        </View>
        <View className="min-w-0 flex-1">
          <Text className="text-sm font-bold text-ink dark:text-dark-ink">
            Jonli dars
          </Text>
          <Text className="text-xs font-semibold text-slate-400 dark:text-dark-muted">
            Yozuvni ko'rish
          </Text>
        </View>
        <ChevronRight size={18} color={isDark ? '#a4a7b2' : '#94a3b8'} />
      </Pressable>
    );
  }

  if (block.type === 'button') {
    if (!block.buttonUrl) return null;
    return (
      <View className="mt-3 items-center py-2">
        <Pressable
          onPress={() => void Linking.openURL(block.buttonUrl!)}
          style={{ backgroundColor: block.buttonColor || '#4F46E5' }}
          className="rounded-xl px-5 py-2.5"
        >
          <Text
            style={{ color: block.buttonTextColor || '#FFFFFF' }}
            className="text-sm font-bold"
          >
            {block.label || "O'tish"}
          </Text>
        </Pressable>
      </View>
    );
  }

  if (block.type === 'message') {
    const lines = block.messageLines ?? [];
    if (lines.length === 0 || !block.messageSender) return null;
    const sortedLines = [...lines].sort((a, b) => a.orderIndex - b.orderIndex);
    return (
      <View className="mt-3 gap-2">
        <View className="flex-row items-center gap-2">
          <View className="h-8 w-8 items-center justify-center overflow-hidden rounded-full bg-indigo-50 dark:bg-dark-surface-2">
            {block.messageSender.avatarUrl ? (
              <Image
                source={{ uri: block.messageSender.avatarUrl }}
                className="h-full w-full"
                resizeMode="cover"
              />
            ) : (
              <Text className="text-xs font-bold text-brand">
                {(block.messageSender.name || '?').trim()[0]?.toUpperCase()}
              </Text>
            )}
          </View>
          <Text className="text-xs font-bold text-slate-600 dark:text-dark-muted">
            {block.messageSender.name}
          </Text>
        </View>
        <View className="gap-1.5">
          {sortedLines.map(line => (
            <View
              key={line.id}
              className="max-w-[85%] self-start rounded-2xl rounded-tl-sm border border-slate-100 bg-white px-3.5 py-2.5 dark:border-transparent dark:bg-dark-surface-2"
            >
              <Text className="text-sm text-ink dark:text-dark-ink">
                {line.text}
              </Text>
            </View>
          ))}
        </View>
      </View>
    );
  }

  return (
    <View className="mt-3 flex-row items-center gap-3 rounded-xl border border-slate-100 bg-white px-4 py-4 dark:border-transparent dark:bg-dark-surface-2">
      {block.type === 'image' ? (
        <ImageIcon size={18} color={isDark ? '#a4a7b2' : '#94a3b8'} />
      ) : (
        <FileText size={18} color={isDark ? '#a4a7b2' : '#94a3b8'} />
      )}
      <Text className="text-sm font-semibold text-slate-400 dark:text-dark-muted">
        Kontent ochilmadi
      </Text>
    </View>
  );
}
