import { useEffect, useState } from 'react';

interface UserAvatarProps {
  name?: string | null;
  avatarUrl?: string | null;
  className?: string;
  imageClassName?: string;
  fallbackClassName?: string;
  alt?: string;
}

export function userInitials(name?: string | null) {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  return (parts.length > 1 ? `${parts[0][0]}${parts[1][0]}` : parts[0]?.slice(0, 2) || '?').toUpperCase();
}

/** Image-first avatar with a letter fallback for missing or broken images. */
export function UserAvatar({
  name,
  avatarUrl,
  className = '',
  imageClassName = '',
  fallbackClassName = '',
  alt,
}: UserAvatarProps) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const showImage = Boolean(avatarUrl && failedUrl !== avatarUrl);

  useEffect(() => {
    if (failedUrl && failedUrl !== avatarUrl) setFailedUrl(null);
  }, [avatarUrl, failedUrl]);

  return (
    <span className={`inline-flex shrink-0 items-center justify-center overflow-hidden ${className}`}>
      {showImage ? (
        <img
          src={avatarUrl!}
          alt={alt ?? name ?? ''}
          className={`h-full w-full object-cover ${imageClassName}`}
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setFailedUrl(avatarUrl!)}
        />
      ) : (
        <span className={`flex h-full w-full items-center justify-center ${fallbackClassName}`} aria-label={name ?? 'Foydalanuvchi'}>
          {userInitials(name)}
        </span>
      )}
    </span>
  );
}
