export function getAllowedOrigins(): string[] {
  return [
    process.env.FRONTEND_URL,
    'https://localhost',
    'capacitor://localhost',
  ].filter((origin): origin is string => Boolean(origin));
}
