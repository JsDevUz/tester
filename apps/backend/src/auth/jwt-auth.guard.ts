import { Injectable, ExecutionContext } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  handleRequest(err: any, user: any, info: any, context: ExecutionContext) {
    const result = super.handleRequest(err, user, info, context);
    if (result) {
      const req = context.switchToHttp().getRequest();
      req.admin = result;
    }
    return result;
  }
}
