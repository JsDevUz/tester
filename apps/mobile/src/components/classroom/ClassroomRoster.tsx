import React, {useEffect, useMemo, useState} from 'react';
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
import {Mic, MicOff, Volume2, X} from 'lucide-react-native';
import type {CsParticipant} from '../../types/classroom';

const STATUS_CONFIG: Record<
  CsParticipant['status'],
  {text: string; badgeBg: string; textColor: string}
> = {
  present: {text: 'Keldi', badgeBg: 'rgba(16,185,129,0.15)', textColor: '#10b981'},
  late: {text: 'Kech keldi', badgeBg: 'rgba(245,158,11,0.15)', textColor: '#f59e0b'},
  absent: {text: "Yo'q", badgeBg: 'rgba(148,163,184,0.15)', textColor: '#94a3b8'},
};

const AVATAR_COLORS = [
  '#e67700', '#087f5b', '#1971c2', '#5f3dc4',
  '#c2255c', '#2f9e44', '#1864ab', '#862e9c',
  '#d9480f', '#099268', '#1098ad', '#ae3ec9',
];

function getAvatarColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

function getInitials(name: string): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

const SPRING = {damping: 22, stiffness: 260, mass: 0.7};

export function ClassroomRoster({
  visible,
  onClose,
  participants,
  speakingUserIds = new Set(),
  unmutedUserIds = new Set(),
  myUserId = null,
  hostOnline = false,
  hostUserId = null,
  hostName = 'Ustoz',
  userReactions = {},
}: {
  visible: boolean;
  onClose: () => void;
  participants: CsParticipant[];
  speakingUserIds?: Set<string>;
  unmutedUserIds?: Set<string>;
  myUserId?: string | null;
  hostOnline?: boolean;
  hostUserId?: string | null;
  hostName?: string | null;
  userReactions?: Record<string, string>;
}) {
  const {height: windowHeight} = useWindowDimensions();
  const [mounted, setMounted] = useState(visible);
  const translateY = useSharedValue(windowHeight);
  const backdropOpacity = useSharedValue(0);

  useEffect(() => {
    if (visible) {
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
  }, [visible, windowHeight]);

  function close() {
    onClose();
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

  const sortedList = useMemo(() => {
    return [...participants].sort((a, b) => {
      if (a.online && !b.online) return -1;
      if (!a.online && b.online) return 1;

      if (a.online) {
        const aIsMe = a.userId === myUserId;
        const bIsMe = b.userId === myUserId;
        if (aIsMe) return -1;
        if (bIsMe) return 1;

        const aSpeaking = speakingUserIds.has(a.userId);
        const bSpeaking = speakingUserIds.has(b.userId);
        if (aSpeaking && !bSpeaking) return -1;
        if (!aSpeaking && bSpeaking) return 1;
      }
      return a.name.localeCompare(b.name);
    });
  }, [participants, myUserId, speakingUserIds]);

  const onlineCount = participants.filter(p => p.online).length + (hostOnline ? 1 : 0);
  const totalCount = participants.length + (hostOnline ? 1 : 0);

  if (!mounted) return null;

  return (
    <Modal visible transparent statusBarTranslucent onRequestClose={close}>
      <View style={{flex: 1, justifyContent: 'flex-end'}}>
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

        <Animated.View
          style={[
            {
              maxHeight: '82%',
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
              <Text style={{fontSize: 17, fontWeight: '700', color: 'white'}}>Ishtirokchilar</Text>
              <View
                style={{
                  backgroundColor: 'rgba(255,255,255,0.1)',
                  borderRadius: 999,
                  paddingHorizontal: 8,
                  paddingVertical: 2,
                }}>
                <Text style={{fontSize: 11, fontWeight: '600', color: 'rgba(255,255,255,0.8)'}}>
                  {onlineCount}/{totalCount}
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

          {/* List */}
          <FlatList
            data={sortedList}
            keyExtractor={p => p.userId}
            contentContainerStyle={{paddingHorizontal: 16, paddingVertical: 12}}
            ListHeaderComponent={
              hostOnline ? (
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 12,
                    paddingVertical: 10,
                    paddingHorizontal: 8,
                    borderRadius: 14,
                    backgroundColor: (hostUserId && speakingUserIds.has(hostUserId)) || speakingUserIds.has('host') ? 'rgba(99,102,241,0.12)' : 'transparent',
                    marginBottom: 4,
                    borderBottomWidth: 1,
                    borderBottomColor: 'rgba(255,255,255,0.06)',
                  }}>
                  {/* Host avatar */}
                  <View style={{position: 'relative'}}>
                    <View
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: 18,
                        backgroundColor: '#4f46e5',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}>
                      <Text style={{color: 'white', fontSize: 14, fontWeight: '700'}}>U</Text>
                    </View>
                    <View
                      style={{
                        position: 'absolute',
                        bottom: -1,
                        right: -1,
                        width: 10,
                        height: 10,
                        borderRadius: 5,
                        backgroundColor: '#10b981',
                        borderWidth: 1.5,
                        borderColor: '#242428',
                      }}
                    />
                  </View>

                  {/* Host info */}
                  <View style={{flex: 1}}>
                    <Text style={{fontSize: 14, fontWeight: '600', color: 'white'}}>
                      {hostName || 'Ustoz'}
                    </Text>
                  </View>

                  {((hostUserId && speakingUserIds.has(hostUserId)) || speakingUserIds.has('host')) && (
                    <Volume2 size={16} color="#818cf8" style={{marginRight: 4}} />
                  )}
                  {(hostUserId && unmutedUserIds.has(hostUserId)) || unmutedUserIds.has('host') || unmutedUserIds.has('teacher') || (hostName && unmutedUserIds.has(hostName)) ? (
                    <Mic size={14} color="#10b981" style={{marginRight: 4}} />
                  ) : (
                    <MicOff size={14} color="rgba(255,255,255,0.35)" style={{marginRight: 4}} />
                  )}

                  <View
                    style={{
                      backgroundColor: 'rgba(99,102,241,0.2)',
                      paddingHorizontal: 8,
                      paddingVertical: 2,
                      borderRadius: 999,
                    }}>
                    <Text style={{fontSize: 10, fontWeight: '600', color: '#a5b4fc'}}>Ustoz</Text>
                  </View>
                </View>
              ) : null
            }
            renderItem={({item}) => {
              const isSpeaking = speakingUserIds.has(item.userId);
              const isUnmuted = unmutedUserIds.has(item.userId) || (item.name && unmutedUserIds.has(item.name));
              const isMe = item.userId === myUserId;
              const statusCfg = STATUS_CONFIG[item.status];
              const reaction = userReactions[item.userId];

              return (
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 12,
                    paddingVertical: 9,
                    paddingHorizontal: 8,
                    borderRadius: 14,
                    backgroundColor: isSpeaking ? 'rgba(99,102,241,0.12)' : 'transparent',
                  }}>
                  {/* Student avatar */}
                  <View style={{position: 'relative'}}>
                    <View
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: 18,
                        backgroundColor: getAvatarColor(item.name),
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}>
                      <Text style={{color: 'white', fontSize: 13, fontWeight: '700'}}>
                        {getInitials(item.name)}
                      </Text>
                    </View>
                    <View
                      style={{
                        position: 'absolute',
                        bottom: -1,
                        right: -1,
                        width: 10,
                        height: 10,
                        borderRadius: 5,
                        backgroundColor: item.online ? '#10b981' : '#64748b',
                        borderWidth: 1.5,
                        borderColor: '#242428',
                      }}
                    />
                  </View>

                  {/* Student Name */}
                  <View style={{flex: 1}}>
                    <Text
                      numberOfLines={1}
                      style={{
                        fontSize: 14,
                        fontWeight: '600',
                        color: item.online ? 'white' : 'rgba(255,255,255,0.4)',
                      }}>
                      {item.name}
                      {isMe ? (
                        <Text style={{fontSize: 12, fontWeight: '400', color: 'rgba(255,255,255,0.5)'}}>
                          {' '}(Siz)
                        </Text>
                      ) : null}
                    </Text>
                  </View>

                  {/* Reaction */}
                  {reaction && (
                    <Text style={{fontSize: 16, marginRight: 2}}>{reaction}</Text>
                  )}

                  {/* Speaking indicator */}
                  {isSpeaking && (
                    <Volume2 size={16} color="#818cf8" style={{marginRight: 4}} />
                  )}

                  {/* Mic state */}
                  {item.online &&
                    (isUnmuted ? (
                      <Mic size={14} color="#10b981" style={{marginRight: 4}} />
                    ) : (
                      <MicOff size={14} color="rgba(255,255,255,0.35)" style={{marginRight: 4}} />
                    ))}

                  {/* Status badge */}
                  <View
                    style={{
                      backgroundColor: statusCfg.badgeBg,
                      paddingHorizontal: 8,
                      paddingVertical: 2,
                      borderRadius: 999,
                    }}>
                    <Text style={{fontSize: 10, fontWeight: '600', color: statusCfg.textColor}}>
                      {statusCfg.text}
                    </Text>
                  </View>
                </View>
              );
            }}
          />

          {/* Footer hint */}
          <View
            style={{
              paddingHorizontal: 20,
              paddingVertical: 12,
              borderTopWidth: 1,
              borderTopColor: 'rgba(255,255,255,0.06)',
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
            }}>
            <Mic size={13} color="rgba(255,255,255,0.4)" />
            <Text style={{fontSize: 11, color: 'rgba(255,255,255,0.4)'}}>
              Gapirish uchun mikrofon tugmasini yoqing
            </Text>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

