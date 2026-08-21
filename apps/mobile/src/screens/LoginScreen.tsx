import React, {useEffect, useRef, useState} from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import Svg, {Path} from 'react-native-svg';
import {CodeDigitsInput} from '../components/CodeDigitsInput';
import {getApiErrorMessage} from '../lib/errors';
import {maskUzPhone} from '../lib/phone';
import {useNetwork} from '../providers/NetworkProvider';
import {useAuthStore} from '../store/authStore';

const CODE_LENGTH = 6;
const BOT_USERNAME = '@BirKodBot';
const BOT_LINK = 'tg://resolve?domain=BirKodBot';
const TELEGRAM_BLUE = '#0088cc';

// Native port of apps/frontend/src/pages/LoginPage.tsx — same field layout
// order, same split-box OTP input, same colors/copy (translated to the
// mobile app's NativeWind tokens, with a dark-mode palette ported 1:1 from
// the web's data-theme="dark" CSS since the rest of this screen must
// support dark mode even though the rest of the mobile app doesn't yet).
export function LoginScreen() {
  const [showPasswordLogin, setShowPasswordLogin] = useState(false);
  const [phone, setPhone] = useState('+998 ');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [forgotMode, setForgotMode] = useState(false);
  const [forgotStep, setForgotStep] = useState<'code' | 'password'>('code');
  const [resetCode, setResetCode] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [resetPassword, setResetPassword] = useState('');
  const [resetPasswordConfirm, setResetPasswordConfirm] = useState('');
  const login = useAuthStore(state => state.login);
  const loginCode = useAuthStore(state => state.loginCode);
  const verifyPasswordResetCode = useAuthStore(state => state.verifyPasswordResetCode);
  const completePasswordReset = useAuthStore(state => state.completePasswordReset);
  const {online} = useNetwork();
  const submittedCodeRef = useRef('');
  const submittedResetCodeRef = useRef('');

  useEffect(() => {
    if (showPasswordLogin || code.length !== CODE_LENGTH || loading) return;
    if (submittedCodeRef.current === code) return;
    submittedCodeRef.current = code;
    void submitTelegramCode();
  }, [code, showPasswordLogin]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!forgotMode || forgotStep !== 'code' || resetCode.length !== CODE_LENGTH || loading) return;
    if (submittedResetCodeRef.current === resetCode) return;
    submittedResetCodeRef.current = resetCode;
    void verifyResetCode();
  }, [resetCode, forgotMode, forgotStep]); // eslint-disable-line react-hooks/exhaustive-deps

  async function submitTelegramCode() {
    if (!online) {
      Alert.alert('Internet kerak', 'Kirish faqat online holatda ishlaydi.');
      return;
    }
    if (code.length !== CODE_LENGTH || loading) return;
    setLoading(true);
    try {
      await loginCode(code);
    } catch (error) {
      setCode('');
      submittedCodeRef.current = '';
      Alert.alert('Kirish amalga oshmadi', getApiErrorMessage(error, "Kod noto'g'ri yoki muddati tugagan"));
    } finally {
      setLoading(false);
    }
  }

  async function handlePasswordLogin() {
    if (!online) {
      Alert.alert('Internet kerak', 'Kirish faqat online holatda ishlaydi.');
      return;
    }
    setLoading(true);
    try {
      await login(phone, password);
    } catch (error) {
      Alert.alert('Kirish amalga oshmadi', getApiErrorMessage(error, "Telefon yoki parol noto'g'ri"));
    } finally {
      setLoading(false);
    }
  }

  async function verifyResetCode() {
    if (!online) {
      Alert.alert('Internet kerak', 'Bu amal faqat online holatda ishlaydi.');
      return;
    }
    if (resetCode.length !== CODE_LENGTH) return;
    setLoading(true);
    try {
      const result = await verifyPasswordResetCode(resetCode);
      setResetToken(result.resetToken);
      setForgotStep('password');
    } catch (error) {
      setResetCode('');
      submittedResetCodeRef.current = '';
      Alert.alert('Kod xato', getApiErrorMessage(error, "Kod noto'g'ri yoki muddati tugagan"));
    } finally {
      setLoading(false);
    }
  }

  async function completeReset() {
    if (resetPassword.length < 8) {
      Alert.alert('Parol qisqa', "Parol kamida 8 ta belgidan iborat bo'lishi kerak.");
      return;
    }
    if (resetPassword !== resetPasswordConfirm) {
      Alert.alert('Mos kelmadi', 'Parollar mos kelmadi.');
      return;
    }
    setLoading(true);
    try {
      await completePasswordReset(resetToken, resetPassword, resetPasswordConfirm);
    } catch (error) {
      Alert.alert('Xatolik', getApiErrorMessage(error, "Parolni yangilab bo'lmadi"));
    } finally {
      setLoading(false);
    }
  }

  function backToLogin() {
    setForgotMode(false);
    setForgotStep('code');
    setResetCode('');
    setResetToken('');
    setResetPassword('');
    setResetPasswordConfirm('');
    submittedResetCodeRef.current = '';
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      className="flex-1 bg-white dark:bg-dark-surface">
      <ScrollView contentContainerClassName="flex-1 items-center justify-center px-5 py-10">
        <View className="w-full max-w-[420px] items-center">
          {!online && (
            <View className="mb-6 w-full rounded-xl bg-amber-100 p-3 dark:bg-amber-500/10">
              <Text className="text-center text-sm text-amber-800 dark:text-amber-400">
                Birinchi kirish uchun internet kerak.
              </Text>
            </View>
          )}

          {forgotMode ? (
            forgotStep === 'code' ? (
              <View className="w-full items-center">
                <Text className="text-center text-3xl font-black leading-none text-ink dark:text-dark-ink">
                  Kodni Kiriting
                </Text>
                <Text className="mt-5 max-w-[360px] text-center text-base font-medium leading-relaxed text-slate-600 dark:text-dark-muted">
                  <Text
                    onPress={() => void Linking.openURL(BOT_LINK)}
                    className="font-bold text-ink underline dark:text-dark-ink">
                    {BOT_USERNAME}
                  </Text>{' '}
                  telegram botidan odatdagidek 6 xonali kodingizni oling.
                </Text>
                <CodeDigitsInput value={resetCode} onChange={setResetCode} autoFocus editable={!loading} />
              </View>
            ) : (
              <View className="w-full gap-4">
                <Text className="mb-1 text-3xl font-bold text-ink dark:text-dark-ink">Yangi parol</Text>
                <View className="h-14 flex-row items-center rounded-lg border border-slate-200 bg-white px-3 dark:border-dark-border dark:bg-dark-card">
                  <TextInput
                    value={resetPassword}
                    onChangeText={setResetPassword}
                    secureTextEntry
                    autoFocus
                    placeholder="Yangi parol"
                    placeholderTextColor="#94a3b8"
                    style={{paddingTop: 0, paddingBottom: 0, paddingVertical: 0, textAlignVertical: 'center'}}
                    className="h-full flex-1 p-0 text-base text-ink dark:text-dark-ink"
                  />
                </View>
                <View className="h-14 flex-row items-center rounded-lg border border-slate-200 bg-white px-3 dark:border-dark-border dark:bg-dark-card">
                  <TextInput
                    value={resetPasswordConfirm}
                    onChangeText={setResetPasswordConfirm}
                    secureTextEntry
                    placeholder="Yangi parolni tasdiqlang"
                    placeholderTextColor="#94a3b8"
                    style={{paddingTop: 0, paddingBottom: 0, paddingVertical: 0, textAlignVertical: 'center'}}
                    className="h-full flex-1 p-0 text-base text-ink dark:text-dark-ink"
                  />
                </View>
                <Pressable
                  onPress={() => void completeReset()}
                  disabled={loading || !resetPassword || !resetPasswordConfirm}
                  className="h-14 items-center justify-center rounded-2xl bg-brand py-3 disabled:opacity-50">
                  <Text className="text-base font-bold text-white">
                    {loading ? 'Saqlanmoqda...' : 'Parolni saqlash va kirish'}
                  </Text>
                </Pressable>
              </View>
            )
          ) : !showPasswordLogin ? (
            <View className="w-full items-center">
              <Text className="text-center text-3xl font-black leading-none text-ink dark:text-dark-ink">
                Kodni Kiriting
              </Text>
              <Text className="mt-5 max-w-[360px] text-center text-base font-medium leading-relaxed text-slate-600 dark:text-dark-muted">
                <Text
                  onPress={() => void Linking.openURL(BOT_LINK)}
                  className="font-bold text-ink underline dark:text-dark-ink">
                  {BOT_USERNAME}
                </Text>{' '}
                telegram botiga kiring va 10 daqiqalik kodingizni oling.
              </Text>
              <CodeDigitsInput value={code} onChange={setCode} autoFocus editable={!loading} />
              <Pressable
                onPress={() => void Linking.openURL(BOT_LINK)}
                className="mt-6 flex-row items-center gap-2 rounded-full px-5 py-2.5"
                style={{backgroundColor: TELEGRAM_BLUE}}>
                <Svg viewBox="0 0 24 24" width={18} height={18} fill="white">
                  <Path d="M21.05 2.927a1.5 1.5 0 0 0-1.523-.267L2.6 9.29a1.5 1.5 0 0 0 .098 2.82l4.606 1.53 1.72 5.6a1.5 1.5 0 0 0 2.6.55l2.42-2.7 4.5 3.35a1.5 1.5 0 0 0 2.393-.91l2.05-13.9a1.5 1.5 0 0 0-.437-1.703ZM9.98 13.99l-1.02 3.32-.94-3.06 9.9-6.98-7.94 6.72Z" />
                </Svg>
                <Text className="text-sm font-semibold text-white">Kodni qayta olish</Text>
              </Pressable>
            </View>
          ) : (
            <View className="w-full gap-4">
              <Text className="mb-1 text-3xl font-bold text-ink dark:text-dark-ink">Login bilan kirish</Text>
              <View className="h-14 flex-row items-center rounded-lg border border-slate-200 bg-white px-3 dark:border-dark-border dark:bg-dark-card">
                <TextInput
                  value={phone}
                  onChangeText={text => setPhone(maskUzPhone(text))}
                  keyboardType="phone-pad"
                  placeholder="Telefon raqami"
                  placeholderTextColor="#94a3b8"
                  maxLength={17}
                  style={{paddingTop: 0, paddingBottom: 0, paddingVertical: 0, textAlignVertical: 'center'}}
                  className="h-full flex-1 p-0 text-base text-ink dark:text-dark-ink"
                />
              </View>
              <View className="h-14 flex-row items-center rounded-lg border border-slate-200 bg-white px-3 dark:border-dark-border dark:bg-dark-card">
                <TextInput
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry
                  placeholder="Parol"
                  placeholderTextColor="#94a3b8"
                  style={{paddingTop: 0, paddingBottom: 0, paddingVertical: 0, textAlignVertical: 'center'}}
                  className="h-full flex-1 p-0 text-base text-ink dark:text-dark-ink"
                />
              </View>
              <Pressable
                onPress={() => void handlePasswordLogin()}
                disabled={loading}
                className="h-14 items-center justify-center rounded-2xl bg-brand py-3 disabled:opacity-50">
                <Text className="text-base font-bold text-white">{loading ? 'Kirish...' : 'Kirish'}</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  setForgotMode(true);
                  setForgotStep('code');
                }}
                className="py-2">
                <Text className="text-center text-sm font-semibold text-slate-500 dark:text-dark-muted">
                  Parolni unutdim
                </Text>
              </Pressable>
            </View>
          )}

          {!forgotMode && (
            <Pressable onPress={() => setShowPasswordLogin(v => !v)} className="mt-10 w-full py-2">
              <Text className="text-center text-sm font-semibold text-slate-500 dark:text-dark-muted">
                {showPasswordLogin ? 'Kod bilan kirish' : 'Login bilan kirish'}
              </Text>
            </Pressable>
          )}
          {forgotMode && (
            <Pressable onPress={backToLogin} className="mt-10 w-full py-1">
              <Text className="text-center text-xs font-medium text-slate-500 dark:text-dark-muted">
                Login bilan kirish
              </Text>
            </Pressable>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
