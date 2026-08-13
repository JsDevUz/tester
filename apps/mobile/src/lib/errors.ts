import axios from 'axios';

type ApiErrorBody = {
  message?: string | string[];
};

function isSafeUserMessage(message: string) {
  const technicalPattern =
    /(?:cannot\s+(?:get|post|put|patch|delete)|\/api\/|https?:\/\/|<\/?html|exception|stack trace|sql|enoent|econnrefused)/i;
  return !technicalPattern.test(message);
}

export function getApiErrorMessage(
  error: unknown,
  fallback = "Noma'lum xatolik yuz berdi",
) {
  if (!axios.isAxiosError<ApiErrorBody>(error)) {
    return fallback;
  }

  const message = error.response?.data?.message;
  if (Array.isArray(message) && message.length > 0) {
    const joined = message.join('\n').trim();
    if (isSafeUserMessage(joined)) return joined;
  }
  if (
    typeof message === 'string' &&
    message.trim() &&
    isSafeUserMessage(message)
  ) {
    return message;
  }

  if (error.response?.status === 429) {
    return "Juda ko'p urinish bo'ldi. Bir daqiqadan keyin qayta urinib ko'ring.";
  }
  if (error.code === 'ECONNABORTED') {
    return "Server javob bermadi. Internet aloqasini tekshirib, qayta urinib ko'ring.";
  }
  if (!error.response) {
    return "Server bilan aloqa o'rnatilmadi. Internet aloqasini tekshiring.";
  }

  return fallback;
}
