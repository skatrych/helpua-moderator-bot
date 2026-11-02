import { Module } from '@nestjs/common';
import { DatabaseProviderModule } from '../database-provider/database-provider.module';
import { ConsentService } from './consent.service';

@Module({
  imports: [DatabaseProviderModule],
  providers: [ConsentService],
  exports: [ConsentService],
})
export class UserConsentModule {}
