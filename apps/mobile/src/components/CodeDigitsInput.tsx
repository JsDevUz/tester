import React, {useRef, useState} from 'react';
import {TextInput, View, type NativeSyntheticEvent, type TextInputKeyPressEventData} from 'react-native';

const CODE_LENGTH = 6;

// Native port of apps/frontend's LoginPage.tsx split-box OTP input
// (codeDigits/updateCodeDigit/handleCodeKeyDown/handleCodePaste): six
// single-digit boxes with auto-advance-on-type and auto-back-on-backspace.
// Paste isn't a distinct native gesture the way it is on web (no clipboard
// paste event on a numeric keypad), so pasting a full code still works via
// the OS's own paste-into-field gesture — typing/pasting into any box fills
// from that box onward, matching the digit-by-digit fill behavior.
export function CodeDigitsInput({
  value,
  onChange,
  autoFocus,
  editable = true,
}: {
  value: string;
  onChange: (v: string) => void;
  autoFocus?: boolean;
  editable?: boolean;
}) {
  const refs = useRef<Array<TextInput | null>>([]);
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
  const digits = Array.from({length: CODE_LENGTH}, (_, i) => value[i] ?? '');

  function updateDigit(index: number, raw: string) {
    const cleaned = raw.replace(/\D/g, '');
    if (cleaned.length > 1) {
      // Pasting full code or SMS auto-fill — fill from index or start
      const next = (value.slice(0, index) + cleaned).slice(0, CODE_LENGTH);
      onChange(next);
      const focusIndex = Math.min(next.length, CODE_LENGTH - 1);
      refs.current[focusIndex]?.focus();
      return;
    }
    const next = digits.slice();
    next[index] = cleaned;
    const fullStr = next.join('').replace(/\s+$/, '');
    onChange(fullStr);
    if (cleaned && index < CODE_LENGTH - 1) {
      refs.current[index + 1]?.focus();
    }
  }

  function handleKeyPress(index: number, e: NativeSyntheticEvent<TextInputKeyPressEventData>) {
    if (e.nativeEvent.key === 'Backspace' && !digits[index] && index > 0) {
      refs.current[index - 1]?.focus();
    }
  }

  return (
    <View className="mt-8 w-full flex-row justify-center gap-2.5">
      {digits.map((digit, index) => (
        <TextInput
          key={index}
          ref={node => {
            refs.current[index] = node;
          }}
          value={digit}
          onChangeText={text => updateDigit(index, text)}
          onKeyPress={e => handleKeyPress(index, e)}
          onFocus={() => setFocusedIndex(index)}
          onBlur={() => setFocusedIndex(current => (current === index ? null : current))}
          autoFocus={autoFocus && index === 0}
          editable={editable}
          keyboardType="number-pad"
          textContentType="oneTimeCode"
          selectTextOnFocus
          style={{
            paddingTop: 0,
            paddingBottom: 0,
            paddingVertical: 0,
            textAlignVertical: 'center',
            lineHeight: undefined,
          }}
          className={`h-14 w-12 rounded-2xl border text-center text-2xl font-bold text-ink dark:bg-dark-card dark:text-dark-ink ${
            focusedIndex === index
              ? 'border-2 border-indigo-600 dark:border-indigo-400'
              : 'border-slate-200 dark:border-dark-border'
          }`}
        />
      ))}
    </View>
  );
}
