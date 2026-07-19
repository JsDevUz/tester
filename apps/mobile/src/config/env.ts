import {Platform} from 'react-native';
declare const process: {env: Record<string, string | undefined>};
const devHost = Platform.OS === 'android' ? '10.0.2.2' : 'localhost';
export const API_URL = process.env.MOBILE_API_URL ?? `http://${devHost}:3001/api/v1`;
export const WEB_URL = process.env.MOBILE_WEB_URL ?? `http://${devHost}:5173`;
