import React from 'react';
import {Pressable, ScrollView, Text, View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';

const EMOJIS = ['💖', '👍', '🎉', '👏', '😂', '😮', '😢', '🤔', '👎'];

export function ClassroomReactionPicker({
  visible,
  onClose,
  onSelect,
}: {
  visible: boolean;
  onClose: () => void;
  onSelect: (emoji: string) => void;
}) {
  const insets = useSafeAreaInsets();
  if (!visible) return null;

  return (
    <View
      pointerEvents="box-none"
      style={{
        position: 'absolute',
        top: -1000,
        bottom: -1000,
        left: -1000,
        right: -1000,
        zIndex: 100,
        justifyContent: 'flex-end',
        alignItems: 'center',
      }}>
      {/* Full-screen backdrop to dismiss on tap outside */}
      <Pressable
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
        }}
        onPress={onClose}
      />

      {/* Floating horizontal emoji pill centered on the screen — kontent
          ekran eniga sig'masa (masalan kichik telefon yoki emoji soni
          ko'paysa) ScrollView orqali gorizontal scroll qilinadi, o'rniga
          View + maxWidth siqib/kesib qo'yardi. */}
      <View
        style={{
          // Call bar balandligi (48px) + uning bottom offseti (24px) + 16px masofa
          marginBottom: 1000 + insets.bottom + 24 + 48 + 16,
          alignSelf: 'center',
          backgroundColor: '#28292c',
          borderRadius: 999,
          borderWidth: 1,
          borderColor: 'rgba(255,255,255,0.15)',
          shadowColor: '#000',
          shadowOffset: {width: 0, height: 8},
          shadowOpacity: 0.45,
          shadowRadius: 16,
          elevation: 12,
          maxWidth: '94%',
        }}>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{alignSelf: 'flex-start', flexGrow: 0, flexShrink: 1}}
          contentContainerStyle={{
            paddingHorizontal: 14,
            paddingVertical: 8,
            alignItems: 'center',
            gap: 8,
          }}>
          {EMOJIS.map(emoji => (
            <Pressable
              key={emoji}
              onPress={() => {
                onSelect(emoji);
                onClose();
              }}
              style={({pressed}) => ({
                width: 40,
                height: 40,
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 20,
                transform: [{scale: pressed ? 1.25 : 1}],
              })}>
              <Text style={{fontSize: 26}}>{emoji}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>

    </View>
  );
}


