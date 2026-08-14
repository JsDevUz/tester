/**
 * JWT payload strukturasi (JwtStrategy.validate() qaytaradigan ob'ekt).
 * Request ob'ektiga passport orqali yoziladi.
 */
export interface JwtPayload {
  /** Admin/foydalanuvchi UUID */
  id: string;
  phone: string;
  name: string;
  role: 'teacher' | 'student' | 'super' | 'curator';
}

/**
 * JwtAuthGuard o'tgandan keyin req.admin va req.user ni to'g'ri type qiladi.
 * Controller'larda @Req() req: any o'rniga @Req() req: JwtRequest ishlatiladi.
 */
export interface JwtRequest {
  admin: JwtPayload;
  user: JwtPayload;
}
