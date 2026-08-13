import React from 'react';
import {FlatList, Modal, Pressable, Text, View} from 'react-native';
import {X} from 'lucide-react-native';

interface AttendanceEntry {
  userId: string;
  name: string;
  status: 'absent' | 'present' | 'late';
}

const STATUS_LABELS: Record<AttendanceEntry['status'], string> = {
  present: 'Keldi',
  late: 'Kech qoldi',
  absent: 'Kelmadi',
};

const STATUS_COLORS: Record<AttendanceEntry['status'], string> = {
  present: '#16a34a',
  late: '#d97706',
  absent: '#94a3b8',
};

export function ClassroomAttendanceSheet({
  visible,
  onClose,
  attendance,
}: {
  visible: boolean;
  onClose: () => void;
  attendance: AttendanceEntry[];
}) {
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={{flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)'}}>
        <View style={{maxHeight: '70%', borderTopLeftRadius: 24, borderTopRightRadius: 24, backgroundColor: 'white', padding: 20}}>
          <View style={{flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16}}>
            <Text style={{fontSize: 18, fontWeight: '700'}}>Davomat</Text>
            <Pressable
              onPress={onClose}
              style={{height: 32, width: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f1f5f9'}}>
              <X size={16} color="#64748b" />
            </Pressable>
          </View>
          {attendance.length === 0 ? (
            <Text style={{textAlign: 'center', color: '#94a3b8', paddingVertical: 24}}>Hech kim qo'shilmagan</Text>
          ) : (
            <FlatList
              data={attendance}
              keyExtractor={item => item.userId}
              renderItem={({item}) => (
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    backgroundColor: '#f8fafc',
                    borderRadius: 12,
                    paddingHorizontal: 12,
                    paddingVertical: 10,
                    marginBottom: 6,
                  }}>
                  <Text style={{fontSize: 14, color: '#334155'}}>{item.name}</Text>
                  <Text style={{fontSize: 12, fontWeight: '600', color: STATUS_COLORS[item.status]}}>
                    {STATUS_LABELS[item.status]}
                  </Text>
                </View>
              )}
            />
          )}
        </View>
      </View>
    </Modal>
  );
}
