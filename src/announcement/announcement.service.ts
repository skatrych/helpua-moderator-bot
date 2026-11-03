import { Injectable, OnModuleInit } from '@nestjs/common';
import { CronJob } from 'cron';
import { SchedulerRegistry } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { BotProvider } from '../bot-provider/bot-provider';

@Injectable()
export class AnnouncementService implements OnModuleInit {
  constructor(
    private readonly configService: ConfigService,
    private readonly schedulerRegistry: SchedulerRegistry,
    private readonly botProvider: BotProvider,
  ) {}

  onModuleInit(): void {
    this.scheduleNightlyClosureAnnouncement();
  }

  private scheduleNightlyClosureAnnouncement(): void {
    const jobName = 'NightlyClosureAnnouncement';
    const cronExpression = this.getNightlyClosureCronExpression();
    const jobCallback = () => this.sendAnnouncement();

    const job = new CronJob(cronExpression, jobCallback);

    this.schedulerRegistry.addCronJob(jobName, job);
    job.start();
  }

  private getNightlyClosureCronExpression(): string {

    const groupClosureHour = this.configService.get('IS_TOO_LATE', '23');
    const prevHour = Number(groupClosureHour) - 1;
    return `58 59 ${prevHour} * * *`;
  }

  private sendAnnouncement(): void {
    const announcementMessage = this.configService.get(
      'GROUP_CLOSURE_ANNOUNCEMENT',
    );
    const chatId = this.configService.get('CHAT_ID');

    console.debug(`Sending announcement about group closure`);
    try {
      this.botProvider.sendMessage(chatId, announcementMessage);
    } catch (e) {
      console.error(`Failed sending message to chatID ${chatId}`, e);
    }
  }
}
