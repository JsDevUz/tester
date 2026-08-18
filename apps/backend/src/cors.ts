export function getAllowedOrigins(): string[] {
  const envOrigins = [
    process.env.FRONTEND_URL,
    process.env.APP_URL,
  ]
    .filter((origin): origin is string => Boolean(origin))
    .flatMap((o) => {
      const clean = o.trim().replace(/\/+$/, '');
      return [clean];
    });

  return Array.from(
    new Set([
      ...envOrigins,
      'https://jamm.uz',
      'http://jamm.uz',
      'http://localhost',
      'http://localhost:3000',
      'http://localhost:5173',
      'https://localhost',
      'capacitor://localhost',
    ]),
  );
}
