import { Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { ConsentPersistencyService } from './consent/consent-persistency.service';

@Module({
  providers: [
    PrismaService,
    { provide: 'CONSENT_PERSISTENCY', useClass: ConsentPersistencyService },
  ],
  exports: ['CONSENT_PERSISTENCY'],
})
export class DatabaseProviderModule {}
