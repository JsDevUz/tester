import React, {useEffect, useState} from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import {Gesture, GestureDetector} from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import {Hand, X} from 'lucide-react-native';
import type {RaisedHandItem} from '../../types/classroom';

const AVATAR_COLORS = [
  '#e67700', '#087f5b', '#1971c2', '#5f3dc4',
  '#c2255c', '#2f9e44', '#1864ab', '#862e9c',
  '#d9480f', '#099268', '#1098ad', '#ae3ec9',
];

function getAvatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function getInitials(name: string): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

const SPRING = {damping: 22, stiffness: 260, mass: 0.7};

export function RaisedHandsControl({raisedHands}: {raisedHands: RaisedHandItem[]}) {
  const [open, setOpen] = useState(false);
  const {height: windowHeight} = useWindowDimensions();
  const [mounted, setMounted] = useState(false);
  const translateY = useSharedValue(windowHeight);
  const backdropOpacity = useSharedValue(0);

  useEffect(() => {
    if (open) {
      setMounted(true);
      translateY.value = windowHeight;
      backdropOpacity.value = withTiming(1, {duration: 200});
      translateY.value = withSpring(0, SPRING);
    } else if (mounted) {
      backdropOpacity.value = withTiming(0, {duration: 180});
      translateY.value = withSpring(windowHeight, SPRING, finished => {
        if (finished) runOnJS(setMounted)(false);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, windowHeight]);

  function close() {
    setOpen(false);
  }

  const pan = Gesture.Pan()
    .onUpdate(e => {
      if (e.translationY > 0) translateY.value = e.translationY;
    })
    .onEnd(e => {
      if (e.translationY > 100 || e.velocityY > 600) {
        translateY.value = withSpring(windowHeight, SPRING, finished => {
          if (finished) runOnJS(close)();
        });
      } else {
        translateY.value = withSpring(0, SPRING);
      }
    });

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{translateY: translateY.value}],
  }));
  const backdropStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value,
  }));

  if (raisedHands.length === 0) return null;

  const first = raisedHands[0];
  const countMore = raisedHands.length - 1;

  return (
    <>
      {/* Top Header Pill Button */}
      <Pressable
        onPress={() => setOpen(true)}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          backgroundColor: '#a8f0b0',
          borderRadius: 999,
          paddingHorizontal: 10,
          paddingVertical: 6,
          shadowColor: '#000',
          shadowOffset: {width: 0, height: 2},
          shadowOpacity: 0.15,
          shadowRadius: 4,
          elevation: 4,
        }}>
        <View style={{backgroundColor: '#0a3818', borderRadius: 999, padding: 3}}>
          <Hand size={13} color="#a8f0b0" />
        </View>
        <Text numberOfLines={1} style={{color: '#00210b', fontSize: 11, fontWeight: '700', maxWidth: 100}}>
          {countMore > 0 ? `${first.userName} +${countMore}` : first.userName}
        </Text>
      </Pressable>

      {/* Native Animated Bottom Sheet */}
      {mounted && (
        <Modal visible transparent statusBarTranslucent onRequestClose={close}>
          <View style={{flex: 1, justifyContent: 'flex-end'}}>
            {/* Backdrop */}
            <Animated.View
              style={[
                {
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  backgroundColor: 'rgba(0,0,0,0.6)',
                },
                backdropStyle,
              ]}>
              <Pressable style={{flex: 1}} onPress={close} />
            </Animated.View>

            {/* Sheet Container */}
            <Animated.View
              style={[
                {
                  maxHeight: '70%',
                  borderTopLeftRadius: 28,
                  borderTopRightRadius: 28,
                  backgroundColor: '#242428',
                  borderWidth: 1,
                  borderColor: 'rgba(255,255,255,0.08)',
                  overflow: 'hidden',
                },
                sheetStyle,
              ]}>
              {/* Drag handle */}
              <GestureDetector gesture={pan}>
                <View style={{alignItems: 'center', paddingTop: 12, paddingBottom: 8}}>
                  <View
                    style={{
                      width: 40,
                      height: 5,
                      borderRadius: 3,
                      backgroundColor: 'rgba(255,255,255,0.2)',
                    }}
                  />
                </View>
              </GestureDetector>

              {/* Header */}
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  paddingHorizontal: 20,
                  paddingBottom: 14,
                  borderBottomWidth: 1,
                  borderBottomColor: 'rgba(255,255,255,0.06)',
                }}>
                <View style={{flexDirection: 'row', alignItems: 'center', gap: 8}}>
                  <Text style={{fontSize: 17, fontWeight: '700', color: 'white'}}>
                    Qo'l ko'targanlar
                  </Text>
                  <View
                    style={{
                      backgroundColor: 'rgba(16,185,129,0.2)',
                      borderRadius: 999,
                      paddingHorizontal: 8,
                      paddingVertical: 2,
                    }}>
                    <Text style={{fontSize: 11, fontWeight: '700', color: '#10b981'}}>
                      {raisedHands.length}
                    </Text>
                  </View>
                </View>

                <Pressable
                  onPress={close}
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 16,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: 'rgba(255,255,255,0.08)',
                  }}>
                  <X size={16} color="rgba(255,255,255,0.8)" />
                </Pressable>
              </View>

              {/* Subheader */}
              <View style={{paddingHorizontal: 20, paddingTop: 10, paddingBottom: 4}}>
                <Text style={{fontSize: 11, color: 'rgba(255,255,255,0.4)', fontWeight: '500'}}>
                  Birinchidan oxirigacha tartiblangan
                </Text>
              </View>

              {/* List */}
              <FlatList
                data={raisedHands}
                keyExtractor={item => item.userId}
                contentContainerStyle={{paddingHorizontal: 16, paddingVertical: 8}}
                renderItem={({item}) => (
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 12,
                      paddingVertical: 9,
                      paddingHorizontal: 8,
                      borderRadius: 14,
                    }}>
                    <View
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: 18,
                        backgroundColor: getAvatarColor(item.userName),
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}>
                      <Text style={{color: 'white', fontSize: 13, fontWeight: '700'}}>
                        {getInitials(item.userName)}
                      </Text>
                    </View>
                    <Text style={{flex: 1, fontSize: 14, fontWeight: '600', color: 'white'}}>
                      {item.userName}
                    </Text>
                    <View
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: 16,
                        backgroundColor: 'rgba(16,185,129,0.15)',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}>
                      <Hand size={16} color="#10b981" />
                    </View>
                  </View>
                )}
              />
            </Animated.View>
          </View>
        </Modal>
      )}
    </>
  );
}

