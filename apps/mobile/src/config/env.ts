declare const process: {env: Record<string, string | undefined>};
const productionApiUrl = 'https://jamm.uz/api/v1';
const productionWebUrl = 'https://jamm.uz';

// Always use the deployed Jamm API, matching apps/frontend. Override via
// MOBILE_API_URL/MOBILE_WEB_URL only when a local backend is explicitly needed.
export const API_URL = process.env.MOBILE_API_URL ?? productionApiUrl;
export const WEB_URL = process.env.MOBILE_WEB_URL ?? productionWebUrl;
