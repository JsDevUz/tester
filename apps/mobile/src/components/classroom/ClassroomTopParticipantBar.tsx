import React, {useMemo} from 'react';
import {Pressable, Text, useWindowDimensions, View} from 'react-native';
import {Mic, MicOff, Users} from 'lucide-react-native';
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
  role: 'host' | 'student' | 'others';
  hiddenUsersInfo?: Array<{initials: string; bgHex: string}>;
}

export function ClassroomTopParticipantBar({
  participants,
  speakingUserIds,
  unmutedUserIds = new Set(),
  myUserId,
  myUserName = 'Siz',
  hostOnline,
  hostUserId,
  hostName = 'Ustoz',
  onOpenRoster,
  theme = 'light',
}: {
  participants: CsParticipant[];
  speakingUserIds: Set<string>;
  unmutedUserIds?: Set<string>;
  myUserId: string | null;
  myUserName?: string;
  hostOnline: boolean;
  hostUserId?: string | null;
  hostName?: string | null;
  onOpenRoster?: () => void;
  theme?: 'light' | 'dark';
}) {
  const isDark = theme === 'dark';
  const barBg = isDark ? '#1e2130' : '#f9fafb';
  const tileBg = isDark ? '#2a2d3e' : '#ffffff';
  const tileBorderColor = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)';
  const nameColor = isDark ? '#e2e8f0' : '#1f2937';
  const nameBadgeBg = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.95)';
  const tagBg = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)';
  const tagTextColor = isDark ? '#cbd5e1' : '#1f2937';
  const {width: windowWidth} = useWindowDimensions();

  // Web bilan bir xil tartib: avval "men", keyin ustoz, keyin gapirayotganlar,
  // qolganlari ism bo'yicha (ClassroomTopParticipantBar.tsx, web).
  const sortedList = useMemo<Tile[]>(() => {
    const hasMe = participants.some(
      p => p.userId === myUserId || p.userId === 'me' || (myUserName && p.name === myUserName),
    );
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
      const aIsMe = a.userId === myUserId || a.userId === 'me' || (myUserName && a.name === myUserName);
      const bIsMe = b.userId === myUserId || b.userId === 'me' || (myUserName && b.name === myUserName);
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

  if (sortedList.length === 0) return null;

  // Web bilan bir xil: ekran kengligiga qarab nechta plitka sig'ishini
  // hisoblab, qolganlarini "Yana N ta" plitkasiga yig'adi.
  const isMobile = windowWidth < 640;
  const tileWidth = isMobile ? 130 : 150;
  const gap = 12;
  const paddingSpace = 32;
  const availableWidth = windowWidth - paddingSpace;
  const maxTiles = Math.max(2, Math.floor((availableWidth + gap) / (tileWidth + gap)));

  const totalCount = sortedList.length;
  const showTruncated = totalCount > maxTiles;
  const listToDisplay: Tile[] = showTruncated
    ? [
        ...sortedList.slice(0, maxTiles - 1),
        {
          userId: 'others',
          name: `Yana ${totalCount - (maxTiles - 1)} ta`,
          role: 'others',
          isMuted: true,
          hiddenUsersInfo: sortedList
            .slice(maxTiles - 1)
            .slice(0, 2)
            .map(u => ({
              initials: u.role === 'host' ? 'U' : getInitials(u.name),
              bgHex: u.role === 'host' ? '#4f46e5' : getAvatarColor(u.name),
            })),
        },
      ]
    : sortedList;

  return (
    <View
      style={{
        height: isMobile ? 84 : 96,
        backgroundColor: barBg,
        borderBottomWidth: 1,
        borderBottomColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.08)',
      }}>
      <View
        style={{
          flex: 1,
          flexDirection: 'row',
          flexWrap: 'wrap',
          justifyContent: listToDisplay.length > 5 ? 'flex-start' : 'center',
          alignItems: 'center',
          paddingHorizontal: 16,
          gap,
        }}>
        {listToDisplay.map(t => {
          if (t.role === 'others') {
            const hUsers = t.hiddenUsersInfo || [];
            return (
              <Pressable
                key={t.userId}
                onPress={onOpenRoster}
                style={{
                  width: tileWidth,
                  height: '100%',
                  borderRadius: 12,
                  backgroundColor: tileBg,
                  borderWidth: 1,
                  borderColor: tileBorderColor,
                  alignItems: 'center',
                  justifyContent: 'center',
                  overflow: 'hidden',
                  padding: 8,
                }}>
                <View style={{flexDirection: 'row', alignItems: 'center', marginBottom: 8}}>
                  {hUsers.length > 0 ? (
                    hUsers.map((hu, index) => (
                      <View
                        key={index}
                        style={{
                          width: 30,
                          height: 30,
                          borderRadius: 15,
                          backgroundColor: hu.bgHex,
                          alignItems: 'center',
                          justifyContent: 'center',
                          borderWidth: 1.5,
                          borderColor: '#ffffff',
                          marginLeft: index === 0 ? 0 : -10,
                        }}>
                        <Text style={{color: 'white', fontSize: 10, fontWeight: '700'}}>{hu.initials}</Text>
                      </View>
                    ))
                  ) : (
                    <View
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: 14,
                        backgroundColor: 'rgba(79,70,229,0.1)',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}>
                      <Users size={12} color="#6366f1" />
                    </View>
                  )}
                </View>
                <View
                  style={{
                    backgroundColor: tagBg,
                    borderRadius: 999,
                    paddingHorizontal: 10,
                    paddingVertical: 2,
                    maxWidth: '90%',
                  }}>
                  <Text numberOfLines={1} style={{color: tagTextColor, fontSize: 11, fontWeight: '600'}}>
                    {t.name}
                  </Text>
                </View>
              </Pressable>
            );
          }

          const isSpeaking = speakingUserIds.has(t.userId);
          const bg = t.role === 'host' ? '#4f46e5' : getAvatarColor(t.name);
          const initials = t.role === 'host' ? 'U' : getInitials(t.name);
          const isMe = t.userId === myUserId || t.userId === 'me' || (myUserName && t.name === myUserName);
          const displayName = t.role === 'host'
            ? isMe
              ? `${t.name} (Ustoz, Siz)`
              : `${t.name} (Ustoz)`
            : isMe
            ? `${t.name} (Siz)`
            : t.name;

          return (
            <View
              key={t.userId}
              style={{
                width: tileWidth,
                height: '100%',
                borderRadius: 12,
                backgroundColor: tileBg,
                borderWidth: isSpeaking ? 0 : 1,
                borderColor: isSpeaking ? undefined : tileBorderColor,
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
                ...(isSpeaking
                  ? {
                      shadowColor: '#10b981',
                      shadowOffset: {width: 0, height: 0},
                      shadowOpacity: 0.25,
                      shadowRadius: 8,
                      elevation: 4,
                      borderWidth: 1,
                      borderColor: '#10b981',
                    }
                  : null),
              }}>
              <View
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 20,
                  backgroundColor: bg,
                  alignItems: 'center',
                  justifyContent: 'center',
                  ...(isSpeaking
                    ? {borderWidth: 2, borderColor: '#10b981'}
                    : null),
                }}>
                <Text style={{color: 'white', fontSize: 15, fontWeight: '700'}}>{initials}</Text>
              </View>
              <View
                style={{
                  position: 'absolute',
                  bottom: 6,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6,
                  backgroundColor: nameBadgeBg,
                  borderRadius: 999,
                  paddingHorizontal: 10,
                  paddingVertical: 2,
                  maxWidth: '90%',
                }}>
                <Text numberOfLines={1} style={{color: nameColor, fontSize: 11, fontWeight: '500', flexShrink: 1}}>
                  {displayName}
                </Text>
                {!t.isMuted ? <Mic size={11} color="#10b981" /> : <MicOff size={11} color="#9ca3af" />}
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}
