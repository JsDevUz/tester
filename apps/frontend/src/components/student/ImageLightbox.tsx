import { useEffect } from 'react';
import { X } from 'lucide-react';

interface ImageLightboxProps {
  src: string;
  alt?: string;
  onClose: () => void;
}

export function ImageLightbox({ src, alt, onClose }: ImageLightboxProps) {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKeyDown);

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    // Global viewport meta (index.html) user-scalable=no + maximum-scale=1.0
    // bilan pinch-zoom'ni butun ilova bo'ylab o'chirib qo'ygan — iOS Safari'da
    // bu native pinch gestini butunlay bloklaydi, faqat touch-action CSS bilan
    // tuzatib bo'lmaydi. Lightbox ochiq turgan vaqtda meta shu joyda vaqtincha
    // qayta yoziladi, yopilganda asl holatiga qaytariladi.
    const viewportMeta = document.querySelector('meta[name="viewport"]');
    const previousViewportContent = viewportMeta?.getAttribute('content') ?? null;
    if (viewportMeta) {
      viewportMeta.setAttribute('content', 'width=device-width, initial-scale=1.0, maximum-scale=5.0, user-scalable=yes');
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
      if (viewportMeta && previousViewportContent !== null) {
        viewportMeta.setAttribute('content', previousViewportContent);
      }
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex h-screen w-screen items-center justify-center overflow-auto bg-black/80 p-0"
      style={{ touchAction: 'pinch-zoom pan-x pan-y' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Yopish"
        className="fixed right-4 top-4 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
      >
        <X size={20} />
      </button>
      <img
        src={src}
        alt={alt ?? ''}
        className="max-h-screen max-w-screen object-contain"
        style={{ touchAction: 'pinch-zoom pan-x pan-y' }}
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  );
}
