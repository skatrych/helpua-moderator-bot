import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppService } from './app.service';
import { SilentTimeService } from './silent-time/silent-time.service';
import { DatabaseProviderModule } from './database-provider/database-provider.module';
import { UserConsentModule } from './user-consent/user-consent.module';
import { AnnouncementModule } from './announcement/announcement.module';
import { BotProviderModule } from './bot-provider/bot-provider.module';

@Module({
  imports: [
    ConfigModule.forRoot(),
    DatabaseProviderModule,
    BotProviderModule,
    UserConsentModule,
    AnnouncementModule,
  ],
  providers: [AppService, SilentTimeService],
})
export class AppModule {}
