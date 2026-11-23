import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreateTenantDto } from './tenants.dto';
import { TenantsService } from './tenants.service';

@Controller('tenants')
@UseGuards(JwtAuthGuard)
export class TenantsController {
  constructor(private readonly tenants: TenantsService) {}

  @Get()
  list(@CurrentUser() user: { id: string }) {
    return this.tenants.listForUser(user.id);
  }

  @Post()
  create(@CurrentUser() user: { id: string }, @Body() input: CreateTenantDto) {
    return this.tenants.create(user.id, input);
  }
}
