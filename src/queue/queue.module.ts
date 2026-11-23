import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { TICKETING_QUEUE } from './queue.constants';
import { TicketingQueue } from './ticketing.queue';

@Module({
  imports: [BullModule.registerQueue({ name: TICKETING_QUEUE })],
  providers: [TicketingQueue],
  exports: [TicketingQueue],
})
export class QueueModule {}
