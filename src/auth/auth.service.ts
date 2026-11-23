import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { compare, hash } from 'bcryptjs';
import { QueryResultRow } from 'pg';
import { DatabaseService } from '../database/database.service';
import { LoginDto, RegisterDto } from './auth.dto';

type AuthUser = QueryResultRow & { id: string; full_name: string; email: string; password_hash: string };

@Injectable()
export class AuthService {
  constructor(private readonly db: DatabaseService, private readonly jwt: JwtService) {}

  async register(input: RegisterDto) {
    const passwordHash = await hash(input.password, 12);
    try {
      const result = await this.db.query<AuthUser>(
        'INSERT INTO users (full_name, email, password_hash) VALUES ($1, $2, $3) RETURNING id, full_name, email',
        [input.fullName.trim(), input.email.trim().toLowerCase(), passwordHash],
      );
      return this.session(result.rows[0]);
    } catch (error) {
      if ((error as { code?: string }).code === '23505') throw new ConflictException('An account with this email already exists');
      throw error;
    }
  }

  async login(input: LoginDto) {
    const result = await this.db.query<AuthUser>(
      'SELECT id, full_name, email, password_hash FROM users WHERE lower(email) = lower($1)',
      [input.email.trim()],
    );
    const user = result.rows[0];
    if (!user || !(await compare(input.password, user.password_hash))) {
      throw new UnauthorizedException('Email or password is incorrect');
    }
    return this.session({ id: user.id, full_name: user.full_name, email: user.email });
  }

  private async session(user: { id: string; full_name: string; email: string }) {
    const adminEmails = new Set(
      (process.env.ADMIN_EMAILS ?? '')
        .split(',')
        .map((email) => email.trim().toLowerCase())
        .filter(Boolean),
    );
    return {
      accessToken: await this.jwt.signAsync({ sub: user.id }),
      user: { id: user.id, fullName: user.full_name, email: user.email, isAdmin: adminEmails.has(user.email.toLowerCase()) },
    };
  }
}
