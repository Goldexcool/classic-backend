import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { BachsWebhookController, PublicPaymentsController } from './payments.controller';
import { BachsService } from './bachs.service';
import { PaymentsService } from './payments.service';

@Module({
  imports: [DatabaseModule],
  controllers: [PublicPaymentsController, BachsWebhookController],
  providers: [BachsService, PaymentsService],
})
export class PaymentsModule {}
