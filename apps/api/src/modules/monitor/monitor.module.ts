import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { Queues } from '../../common/queues';
import { DriveModule } from '../drive/drive.module';
import { MonitorController, TrackingController } from './monitor.controller';
import { MonitorService } from './monitor.service';
import { MonitorSyncService } from './monitor-sync.service';

@Module({
  imports: [BullModule.registerQueue({ name: Queues.MONITOR }, { name: Queues.RPA }), DriveModule],
  controllers: [MonitorController, TrackingController],
  providers: [MonitorService, MonitorSyncService],
  exports: [MonitorService, MonitorSyncService],
})
export class MonitorModule {}
