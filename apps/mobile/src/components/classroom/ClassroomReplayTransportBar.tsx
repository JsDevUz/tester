import React from 'react';
import {Pressable, Text, View} from 'react-native';
import {Gesture, GestureDetector} from 'react-native-gesture-handler';
import Animated, {runOnJS, useAnimatedStyle, useSharedValue} from 'react-native-reanimated';
import {Pause, Play} from 'lucide-react-native';

function formatMs(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec.toString().padStart(2, '0')}`;
}

export function ClassroomReplayTransportBar({
  isPlaying,
  currentTimeMs,
  durationMs,
  onPlayPause,
  onSeek,
  recordingStatus,
}: {
  isPlaying: boolean;
  currentTimeMs: number;
  durationMs: number;
  onPlayPause: () => void;
  onSeek: (ms: number) => void;
  recordingStatus: 'none' | 'pending' | 'ready' | 'failed';
}) {
  const trackWidth = useSharedValue(0);

  const seekFromX = (x: number) => {
    if (trackWidth.value <= 0 || durationMs <= 0) return;
    const ratio = Math.max(0, Math.min(1, x / trackWidth.value));
    onSeek(ratio * durationMs);
  };

  const tap = Gesture.Tap().onEnd(e => {
    runOnJS(seekFromX)(e.x);
  });

  const progressStyle = useAnimatedStyle(() => ({
    width: durationMs > 0 ? `${Math.min(100, (currentTimeMs / durationMs) * 100)}%` : '0%',
  }));

  return (
    <View
      style={{
        position: 'absolute',
        left: 12,
        right: 12,
        bottom: 16,
        backgroundColor: 'black',
        borderRadius: 24,
        paddingHorizontal: 12,
        paddingVertical: 8,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
      }}>
      <Pressable
        onPress={onPlayPause}
        style={{width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center'}}>
        {isPlaying ? <Pause size={16} color="white" /> : <Play size={16} color="white" />}
      </Pressable>
      <Text style={{color: 'rgba(255,255,255,0.8)', fontSize: 11, width: 36}}>{formatMs(currentTimeMs)}</Text>
      <GestureDetector gesture={tap}>
        <View
          onLayout={e => {
            trackWidth.value = e.nativeEvent.layout.width;
          }}
          style={{flex: 1, height: 24, justifyContent: 'center'}}>
          <View style={{height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.25)', overflow: 'hidden'}}>
            <Animated.View style={[{height: 4, backgroundColor: 'white'}, progressStyle]} />
          </View>
        </View>
      </GestureDetector>
      <Text style={{color: 'rgba(255,255,255,0.8)', fontSize: 11, width: 36}}>{formatMs(durationMs)}</Text>
      {recordingStatus === 'pending' && (
        <Text style={{color: '#94a3b8', fontSize: 10}}>Tayyor emas</Text>
      )}
      {recordingStatus === 'failed' && (
        <Text style={{color: '#94a3b8', fontSize: 10}}>Mavjud emas</Text>
      )}
    </View>
  );
}
