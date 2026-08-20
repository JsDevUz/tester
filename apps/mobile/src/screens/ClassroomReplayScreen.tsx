import React, {useEffect, useRef, useState} from 'react';
import {ActivityIndicator, Pressable, Text, View} from 'react-native';
import Video from 'react-native-video';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import {Users, X} from 'lucide-react-native';
import type {RootStackParamList} from '../navigation/types';
import {apiClassReplay} from '../api/classroom';
import {computeReplayOverlayAt} from '../lib/classroomReplay';
import {ClassroomBoard} from '../components/classroom/ClassroomBoard';
import {ClassroomSubtitleOverlay} from '../components/classroom/ClassroomSubtitleOverlay';
import {ClassroomReplayTransportBar} from '../components/classroom/ClassroomReplayTransportBar';
import {ClassroomAttendanceSheet} from '../components/classroom/ClassroomAttendanceSheet';
import {Screen} from '../components/Ui';
import type {ClassReplayData, ClassroomState} from '../types/classroom';

type Props = NativeStackScreenProps<RootStackParamList, 'ClassroomReplay'>;

function replayStateFromSnapshot(data: ClassReplayData, overlay: ReturnType<typeof computeReplayOverlayAt>): ClassroomState {
  const snap = data.boardSnapshot;
  return {
    joined: true,
    error: null,
    ended: true,
    pdfName: snap?.pdfName ?? data.pdfName,
    pages: snap?.pages ?? data.pdfPages,
    // Replayed history wins over the snapshot: the snapshot is the FINAL board, so using it
    // showed the finished drawing from the first second. Fall back to it only when there is no
    // history to replay (an older recording, or a silent one).
    currentPage: overlay.hasHistory ? overlay.currentPage : 1,
    strokesByPage: overlay.hasHistory ? overlay.strokesByPage : (snap?.strokesByPage ?? {}),
    rightStrokesByPage: snap?.rightStrokesByPage ?? {},
    participants: [],
    hostOnline: false,
    hostUserId: null,
    hostName: null,
    pointer: overlay.pointer,
    zoom: overlay.zoom,
    rightZoom: overlay.rightZoom,
    scroll: overlay.scroll,
    rightScroll: overlay.rightScroll,
    isFree: false,
    boardMode: snap?.boardMode ?? 'pdf',
    boardLayout: snap?.boardLayout ?? 'single',
    leftBoardMode: snap?.leftBoardMode ?? snap?.boardMode ?? 'pdf',
    rightBoardMode: snap?.rightBoardMode ?? snap?.boardMode ?? 'pdf',
    isBoardOpen: true,
    classroomTheme: 'light',
    splitRatio: 0.5,
    notebookPageCount: snap?.notebookPageCount ?? 1,
    notebookPageStyles: snap?.notebookPageStyles ?? {},
    notebookPageOrientations: snap?.notebookPageOrientations ?? {},
    reactions: [],
    userReactions: {},
    raisedHands: [],
  };
}

export function ClassroomReplayScreen({route, navigation}: Props) {
  const {sessionId} = route.params;
  const [data, setData] = useState<ClassReplayData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [currentTimeMs, setCurrentTimeMs] = useState(0);
  const [durationMs, setDurationMs] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [attendanceOpen, setAttendanceOpen] = useState(false);
  const videoRef = useRef<React.ElementRef<typeof Video>>(null);

  useEffect(() => {
    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!sessionId || !UUID_REGEX.test(sessionId)) {
      setError("Dars topilmadi yoki kirish huquqi yo'q");
      return;
    }

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const load = () => {
      apiClassReplay(sessionId)
        .then(next => {
          if (cancelled) return;
          setData(next);
          if (next.recordingUrl && (next.subtitles?.length ?? 0) === 0) {
            timer = setTimeout(load, 5000);
          }
        })
        .catch(() => {
          if (!cancelled) setError("Dars topilmadi yoki kirish huquqi yo'q");
        });
    };
    load();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [sessionId]);

  // History arrives already rebased to the moment recording started (the backend drops
  // anything earlier), so it shares t=0 with the audio track and needs no offset here.
  const isBoardAudio = data?.recordingMode === 'boardAudio';
  const hasRecording =
    data?.recordingStatus === 'ready' && !!data?.recordingUrl && data?.recordingMode !== 'boardSilent';

  const overlay = isBoardAudio
    ? computeReplayOverlayAt(data?.historyEvents ?? [], Math.max(0, currentTimeMs))
    : {zoom: 1, rightZoom: 1, scroll: null, rightScroll: null, pointer: null, currentPage: 1, strokesByPage: {}, hasHistory: false};

  if (error) {
    return (
      <Screen>
        <View style={{flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24}}>
          <Text style={{fontSize: 14, color: '#64748b', textAlign: 'center'}}>{error}</Text>
        </View>
      </Screen>
    );
  }

  if (!data) {
    return (
      <Screen>
        <View style={{flex: 1, alignItems: 'center', justifyContent: 'center'}}>
          <ActivityIndicator />
        </View>
      </Screen>
    );
  }

  const viewState = replayStateFromSnapshot(data, overlay);

  return (
    <View style={{flex: 1, backgroundColor: '#0f172a'}}>
      <View style={{position: 'absolute', top: 12, right: 12, zIndex: 30, flexDirection: 'row', gap: 8}}>
        <Pressable
          onPress={() => setAttendanceOpen(true)}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            backgroundColor: 'rgba(255,255,255,0.95)',
            borderRadius: 999,
            paddingHorizontal: 10,
            paddingVertical: 6,
          }}>
          <Users size={14} color="#475569" />
          <Text style={{fontSize: 11, fontWeight: '600', color: '#475569'}}>Davomat</Text>
        </Pressable>
        <Pressable
          onPress={() => navigation.goBack()}
          style={{
            width: 29,
            height: 29,
            borderRadius: 15,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'rgba(255,255,255,0.95)',
          }}>
          <X size={15} color="#475569" />
        </Pressable>
      </View>

      <ClassroomBoard state={viewState} />

      {hasRecording && data.recordingUrl && (
        <Video
          ref={videoRef}
          source={{uri: data.recordingUrl}}
          paused={!isPlaying}
          onLoad={meta => setDurationMs(meta.duration * 1000)}
          onProgress={progress => setCurrentTimeMs(progress.currentTime * 1000)}
          onEnd={() => setIsPlaying(false)}
          style={{width: 0, height: 0}}
        />
      )}

      <ClassroomSubtitleOverlay
        currentTimeMs={currentTimeMs}
        subtitles={data.subtitles ?? data.boardSnapshot?.subtitles ?? []}
      />

      {hasRecording && (
        <ClassroomReplayTransportBar
          isPlaying={isPlaying}
          currentTimeMs={currentTimeMs}
          durationMs={durationMs}
          recordingStatus={data.recordingStatus}
          onPlayPause={() => setIsPlaying(v => !v)}
          onSeek={ms => {
            const audioMs = Math.max(0, ms);
            videoRef.current?.seek(audioMs / 1000);
            setCurrentTimeMs(ms);
          }}
        />
      )}

      <ClassroomAttendanceSheet
        visible={attendanceOpen}
        onClose={() => setAttendanceOpen(false)}
        attendance={data.attendance.map(a => ({userId: a.userId, name: a.name, status: a.status}))}
      />
    </View>
  );
}
