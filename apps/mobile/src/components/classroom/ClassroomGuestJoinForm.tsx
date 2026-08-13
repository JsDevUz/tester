import React, {useState} from 'react';
import {KeyboardAvoidingView, Platform, Pressable, Text, TextInput, View} from 'react-native';

export function ClassroomGuestJoinForm({onSubmit}: {onSubmit: (name: string) => void}) {
  const [name, setName] = useState('');
  const trimmed = name.trim();
  const displayName = trimmed || 'Mehmon';

  return (
    <KeyboardAvoidingView
      style={{flex: 1, backgroundColor: '#1a1a1e', alignItems: 'center', justifyContent: 'center', padding: 16}}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={{width: '100%', maxWidth: 360, borderRadius: 24, backgroundColor: '#242428', overflow: 'hidden'}}>
        <View style={{alignItems: 'center', gap: 16, paddingHorizontal: 32, paddingTop: 40, paddingBottom: 24}}>
          <View
            style={{
              width: 96,
              height: 96,
              borderRadius: 48,
              backgroundColor: 'rgba(79,195,247,0.2)',
              borderWidth: 2,
              borderColor: 'rgba(79,195,247,0.3)',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
            <View style={{width: 32, height: 32, borderRadius: 16, backgroundColor: '#4fc3f7', opacity: 0.85}} />
          </View>
          <View style={{alignItems: 'center'}}>
            <Text style={{fontSize: 13, color: 'rgba(255,255,255,0.5)', marginBottom: 2}}>
              Uchrashuvdagi ismingiz
            </Text>
            <Text style={{fontSize: 22, fontWeight: '700', color: 'white'}}>{displayName}</Text>
          </View>
        </View>

        <View style={{height: 1, backgroundColor: 'rgba(255,255,255,0.08)', marginHorizontal: 24}} />

        <View style={{paddingHorizontal: 24, paddingVertical: 20, gap: 8}}>
          <TextInput
            autoFocus
            value={name}
            onChangeText={setName}
            placeholder="Ismingizni kiriting..."
            placeholderTextColor="rgba(255,255,255,0.3)"
            maxLength={60}
            style={{
              borderRadius: 12,
              borderWidth: 1,
              borderColor: 'rgba(255,255,255,0.1)',
              backgroundColor: 'rgba(255,255,255,0.08)',
              paddingHorizontal: 16,
              paddingVertical: 12,
              fontSize: 14,
              color: 'white',
            }}
          />
          <Pressable
            disabled={!trimmed}
            onPress={() => onSubmit(trimmed)}
            style={{
              borderRadius: 12,
              paddingVertical: 14,
              alignItems: 'center',
              backgroundColor: '#34a853',
              opacity: trimmed ? 1 : 0.4,
            }}>
            <Text style={{color: 'white', fontSize: 14, fontWeight: '700'}}>Qo'shilish</Text>
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}
