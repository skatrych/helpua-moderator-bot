import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { ConsentPersistency } from './consent-persistency.interface';

@Injectable()
export class ConsentPersistencyService implements ConsentPersistency {
  constructor(private readonly prisma: PrismaService) {}

  async saveUserConsent(userId: number, consent: boolean): Promise<void> {
    await this.prisma.userConsent.upsert({
      where: { userId },
      update: { consent },
      create: { userId, consent },
    });
  }

  async getUserConsent(userId: number): Promise<boolean | null> {
    const consentRecord = await this.prisma.userConsent.findUnique({
      where: { userId },
    });
    return consentRecord ? consentRecord.consent : false;
  }
}
