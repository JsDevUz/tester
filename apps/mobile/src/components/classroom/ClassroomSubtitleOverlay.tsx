import React, {useMemo} from 'react';
import {Text, View} from 'react-native';
import type {ClassSubtitleCue} from '../../types/classroom';

export function ClassroomSubtitleOverlay({
  currentTimeMs,
  subtitles,
}: {
  currentTimeMs: number;
  subtitles: ClassSubtitleCue[];
}) {
  const activeCue = useMemo(
    () => subtitles.find(c => currentTimeMs >= c.startMs && currentTimeMs <= c.endMs) ?? null,
    [subtitles, currentTimeMs],
  );

  if (!activeCue) return null;

  return (
    <View
      style={{
        position: 'absolute',
        bottom: 92,
        left: 0,
        right: 0,
        alignItems: 'center',
        paddingHorizontal: 16,
      }}
      pointerEvents="none">
      <View style={{backgroundColor: 'rgba(0,0,0,0.9)', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 6}}>
        <Text style={{color: 'white', fontSize: 15, fontWeight: '600', textAlign: 'center'}}>{activeCue.text}</Text>
      </View>
    </View>
  );
}
