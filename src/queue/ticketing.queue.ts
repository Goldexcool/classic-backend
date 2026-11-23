import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';
import { TICKETING_QUEUE } from './queue.constants';

@Injectable()
export class TicketingQueue {
  constructor(@InjectQueue(TICKETING_QUEUE) private readonly queue: Queue) {}

  add<T>(name: string, data: T) {
    return this.queue.add(name, data, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 1000 },
      removeOnComplete: 1000,
      removeOnFail: 5000,
    });
  }
}
