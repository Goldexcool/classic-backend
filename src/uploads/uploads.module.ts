import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DatabaseModule } from '../database/database.module';
import { UploadsController } from './uploads.controller';
import { UploadsService } from './uploads.service';

@Module({
  imports: [AuthModule, DatabaseModule],
  controllers: [UploadsController],
  providers: [UploadsService],
})
export class UploadsModule {}
