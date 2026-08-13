import React, {useMemo} from 'react';
import {ScrollView, Text, View, useWindowDimensions} from 'react-native';
import {Mic, MicOff} from 'lucide-react-native';
import type {CsParticipant} from '../../types/classroom';

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

interface Tile {
  userId: string;
  name: string;
  isMuted: boolean;
  role: 'host' | 'student';
}

export function ClassroomParticipantsGrid({
  participants,
  speakingUserIds,
  unmutedUserIds = new Set(),
  myUserId,
  myUserName = 'Siz',
  hostOnline,
  hostUserId,
  hostName = 'Ustoz',
}: {
  participants: CsParticipant[];
  speakingUserIds: Set<string>;
  unmutedUserIds?: Set<string>;
  myUserId: string | null;
  myUserName?: string;
  hostOnline: boolean;
  hostUserId?: string | null;
  hostName?: string | null;
}) {
  const {width, height} = useWindowDimensions();

  const listToDisplay = useMemo<Tile[]>(() => {
    const hasMe = participants.some(p => p.userId === myUserId);
    const list: Tile[] = [
      ...(hostOnline
        ? [
            {
              userId: hostUserId || 'host',
              name: hostName || 'Ustoz',
              isMuted:
                !(hostUserId && unmutedUserIds.has(hostUserId)) &&
                !unmutedUserIds.has('host') &&
                !unmutedUserIds.has('teacher') &&
                !(hostName && unmutedUserIds.has(hostName)),
              role: 'host' as const,
            },
          ]
        : []),
      ...(!hasMe && myUserName
        ? [
            {
              userId: myUserId || 'me',
              name: myUserName,
              isMuted: !unmutedUserIds.has(myUserId || 'me') && !unmutedUserIds.has(myUserName),
              role: 'student' as const,
            },
          ]
        : []),
      ...participants
        .filter(p => p.online)
        .map(p => ({
          userId: p.userId,
          name: p.name,
          isMuted: !unmutedUserIds.has(p.userId) && !(p.name && unmutedUserIds.has(p.name)),
          role: 'student' as const,
        })),
    ];
    return [...list].sort((a, b) => {
      const aIsMe = a.userId === myUserId;
      const bIsMe = b.userId === myUserId;
      if (aIsMe) return -1;
      if (bIsMe) return 1;
      if (a.role === 'host' && b.role !== 'host') return -1;
      if (a.role !== 'host' && b.role === 'host') return 1;
      const aSpeaking = speakingUserIds.has(a.userId);
      const bSpeaking = speakingUserIds.has(b.userId);
      if (aSpeaking && !bSpeaking) return -1;
      if (!aSpeaking && bSpeaking) return 1;
      return a.name.localeCompare(b.name);
    });
  }, [participants, myUserId, myUserName, hostOnline, hostUserId, hostName, speakingUserIds, unmutedUserIds]);

  const count = listToDisplay.length;
  const isLandscape = width > height;
  const isTablet = width >= 600;

  // Exact 1:1 match with web:
  // count <= 1: 1 col
  // count === 2: 1 col on mobile portrait, 2 cols on tablet/landscape
  // count === 3 || 4: 2 cols
  // count >= 5: 2 cols on mobile, 3/4 on tablet
  const cols =
    count <= 1
      ? 1
      : count === 2
      ? isTablet || isLandscape
        ? 2
        : 1
      : count <= 4
      ? 2
      : width >= 900
      ? 4
      : width >= 600
      ? 3
      : 2;

  const gap = 12;
  const padding = 16;
  const maxContainerWidth = count <= 2 && !isTablet && !isLandscape ? 480 : 800;
  const containerWidth = Math.min(width - padding * 2, maxContainerWidth);
  const tileWidth = (containerWidth - (cols - 1) * gap) / cols;
  const tileHeight = Math.max(140, Math.min(tileWidth * (9 / 16), 320));
  const avatarSize = count <= 2 ? 104 : 76;

  return (
    <ScrollView
      style={{flex: 1, backgroundColor: '#f3f4f6'}}
      contentContainerStyle={{
        flexGrow: 1,
        paddingHorizontal: padding,
        paddingTop: 24,
        paddingBottom: 110,
        alignItems: 'center',
        justifyContent: 'center',
      }}>
      <View
        style={{
          width: containerWidth,
          flexDirection: 'row',
          flexWrap: 'wrap',
          gap,
          justifyContent: 'center',
          alignItems: 'center',
        }}>
        {listToDisplay.map(p => {
          const isSpeaking = speakingUserIds.has(p.userId);
          const isMe = p.userId === myUserId;
          const isHost = p.role === 'host';
          const bgColor = isHost ? '#4f46e5' : getAvatarColor(p.name);
          const initials = isHost ? 'U' : getInitials(p.name);
          const displayName = isHost
            ? isMe
              ? `${p.name} (Ustoz, Siz)`
              : `${p.name} (Ustoz)`
            : isMe
            ? `${p.name} (Siz)`
            : p.name;

          return (
            <View
              key={p.userId}
              style={{
                width: tileWidth,
                height: tileHeight,
                borderRadius: 24,
                backgroundColor: '#ffffff',
                borderWidth: isSpeaking ? 2 : 1,
                borderColor: isSpeaking ? '#10b981' : 'rgba(0,0,0,0.08)',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
                shadowColor: isSpeaking ? '#10b981' : '#000',
                shadowOffset: {width: 0, height: 4},
                shadowOpacity: isSpeaking ? 0.3 : 0.08,
                shadowRadius: 10,
                elevation: 4,
              }}>
              {/* Centered Avatar */}
              <View
                style={{
                  width: avatarSize,
                  height: avatarSize,
                  borderRadius: avatarSize / 2,
                  backgroundColor: bgColor,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderWidth: isSpeaking ? 3 : 0,
                  borderColor: '#10b981',
                }}>
                <Text style={{color: 'white', fontSize: avatarSize * 0.36, fontWeight: '700'}}>
                  {initials}
                </Text>
              </View>

              {/* Bottom Centered Participant Name & Mic Badge */}
              <View
                style={{
                  position: 'absolute',
                  bottom: 12,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6,
                  backgroundColor: 'rgba(255,255,255,0.95)',
                  borderRadius: 999,
                  paddingHorizontal: 12,
                  paddingVertical: 5,
                  maxWidth: '90%',
                }}>
                <Text numberOfLines={1} style={{color: '#1f2937', fontSize: 12, fontWeight: '600', flexShrink: 1}}>
                  {displayName}
                </Text>
                {p.isMuted ? (
                  <MicOff size={13} color="#9ca3af" />
                ) : (
                  <Mic size={13} color="#10b981" />
                )}
              </View>
            </View>
          );
        })}
      </View>
    </ScrollView>
  );
}

