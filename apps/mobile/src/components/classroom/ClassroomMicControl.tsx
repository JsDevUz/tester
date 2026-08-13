import React from 'react';
import {Pressable, Text} from 'react-native';
import {Mic, MicOff} from 'lucide-react-native';

export function ClassroomMicControl({
  micEnabled,
  voiceAvailable,
  onToggle,
}: {
  micEnabled: boolean;
  voiceAvailable: boolean;
  onToggle: () => void;
}) {
  return (
    <Pressable
      onPress={onToggle}
      disabled={!voiceAvailable}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 24,
        opacity: voiceAvailable ? 1 : 0.4,
        backgroundColor: micEnabled ? '#111827' : '#fee2e2',
      }}>
      {micEnabled ? <Mic size={18} color="white" /> : <MicOff size={18} color="#ef4444" />}
      <Text style={{fontSize: 13, fontWeight: '700', color: micEnabled ? 'white' : '#ef4444'}}>
        {micEnabled ? 'Mikrofon yoniq' : "Mikrofon o'chiq"}
      </Text>
    </Pressable>
  );
}
