import React, {useEffect, useState} from 'react';
import {Pressable} from 'react-native';
import Animated, {useAnimatedStyle, useSharedValue, withTiming} from 'react-native-reanimated';
import {ChevronDown, Hand, Mic, MicOff, PhoneOff, Smile} from 'lucide-react-native';
import {ClassroomReactionPicker} from './ClassroomReactionPicker';

export function ClassroomCallBar({
  micEnabled,
  voiceAvailable,
  onToggleMic,
  onSendReaction,
  handRaised,
  onToggleHandRaise,
  onEndCall,
  hidden = false,
}: {
  micEnabled: boolean;
  voiceAvailable: boolean;
  onToggleMic: () => void;
  onSendReaction: (emoji: string) => void;
  handRaised: boolean;
  onToggleHandRaise: () => void;
  onEndCall: () => void;
  hidden?: boolean;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const translateY = useSharedValue(0);
  const opacity = useSharedValue(1);

  useEffect(() => {
    translateY.value = withTiming(hidden ? 140 : 0, {duration: 280});
    opacity.value = withTiming(hidden ? 0 : 1, {duration: 280});
    // Call bar yashirilganda (masalan foydalanuvchi PDF/board ustida
    // chizish/o'qishga to'sqinlik qilmasin deb tugmalarni yashirganda)
    // reaction picker ham ekranda "yopishib" qolmasin — u call bar'ning
    // bir qismi sifatida ochilgan edi.
    if (hidden) setPickerOpen(false);
  }, [hidden, translateY, opacity]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{translateY: translateY.value}],
    opacity: opacity.value,
  }));

  return (
    <>
      {/* Reaction picker horizontal floating popover */}
      <ClassroomReactionPicker
        visible={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelect={onSendReaction}
      />

      <Animated.View
        pointerEvents={hidden ? 'none' : 'auto'}
        style={[
          {
            position: 'absolute',
            bottom: 24,
            alignSelf: 'center',
            zIndex: 50,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
          },
          animatedStyle,
        ]}>
        {/* Mic Control */}
        <Pressable
          onPress={onToggleMic}
          disabled={!voiceAvailable}
          style={{
            height: 48,
            borderRadius: 24,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: voiceAvailable ? 1 : 0.4,
            backgroundColor: micEnabled ? '#3c4043' : '#ea4335',
            shadowColor: '#000',
            shadowOffset: {width: 0, height: 4},
            shadowOpacity: 0.3,
            shadowRadius: 8,
            elevation: 6,
            ...(micEnabled
              ? {width: 48}
              : {
                  flexDirection: 'row',
                  paddingHorizontal: 16,
                  gap: 6,
                }),
          }}>
          {!micEnabled && <ChevronDown size={16} color="white" />}
          {micEnabled ? <Mic size={20} color="white" /> : <MicOff size={20} color="white" />}
        </Pressable>

        {/* Reaction Emoji Button */}
        <Pressable
          onPress={() => setPickerOpen(v => !v)}
          style={{
            width: 48,
            height: 48,
            borderRadius: 24,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: pickerOpen ? '#4f46e5' : '#3c4043',
            shadowColor: '#000',
            shadowOffset: {width: 0, height: 4},
            shadowOpacity: 0.3,
            shadowRadius: 8,
            elevation: 6,
          }}>
          <Smile size={20} color="white" />
        </Pressable>

        {/* Hand Raise Button */}
        <Pressable
          onPress={onToggleHandRaise}
          style={{
            width: 48,
            height: 48,
            borderRadius: 24,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: handRaised ? '#059669' : '#3c4043',
            shadowColor: '#000',
            shadowOffset: {width: 0, height: 4},
            shadowOpacity: 0.3,
            shadowRadius: 8,
            elevation: 6,
          }}>
          <Hand size={20} color="white" />
        </Pressable>

        {/* End Call / Leave Button */}
        <Pressable
          onPress={onEndCall}
          style={{
            width: 48,
            height: 48,
            borderRadius: 24,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: '#ea4335',
            shadowColor: '#000',
            shadowOffset: {width: 0, height: 4},
            shadowOpacity: 0.3,
            shadowRadius: 8,
            elevation: 6,
          }}>
          <PhoneOff size={20} color="white" />
        </Pressable>
      </Animated.View>
    </>
  );
}


