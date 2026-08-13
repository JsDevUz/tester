import React, {useEffect, useState} from 'react';
import {Image, ImageProps, ImageSourcePropType} from 'react-native';
import {CacheCategory, getCachedImageUri} from '../../lib/imageCache';

export interface CachedImageProps extends Omit<ImageProps, 'source'> {
  source: ImageSourcePropType | {uri?: string};
  category?: CacheCategory;
}

export function CachedImage({
  source,
  category = 'general',
  style,
  resizeMode = 'cover',
  onLoad,
  onError,
  ...rest
}: CachedImageProps) {
  const remoteUri = typeof source === 'object' && source !== null && 'uri' in source ? source.uri : undefined;
  const [cachedUri, setCachedUri] = useState<string | undefined>(remoteUri);

  useEffect(() => {
    let cancelled = false;
    if (remoteUri && (remoteUri.startsWith('http://') || remoteUri.startsWith('https://'))) {
      getCachedImageUri(remoteUri, category)
        .then(localUri => {
          if (!cancelled && localUri) {
            setCachedUri(localUri);
          }
        })
        .catch(() => {
          if (!cancelled) {
            setCachedUri(remoteUri);
          }
        });
    } else {
      setCachedUri(remoteUri);
    }
    return () => {
      cancelled = true;
    };
  }, [remoteUri, category]);

  const resolvedSource = typeof source === 'number'
    ? source
    : {
        ...(typeof source === 'object' ? source : {}),
        uri: cachedUri || remoteUri,
      };

  return (
    <Image
      {...rest}
      source={resolvedSource}
      style={style}
      resizeMode={resizeMode}
      onLoad={onLoad}
      onError={onError}
    />
  );
}
