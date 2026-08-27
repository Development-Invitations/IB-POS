import { Body, Controller, Post } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { LoginPinDto } from './dto/login-pin.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.auth.loginWithPassword(dto);
  }

  @Post('login-pin')
  loginPin(@Body() dto: LoginPinDto) {
    return this.auth.loginWithPin(dto);
  }
}
