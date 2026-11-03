import { Inject, Injectable } from '@nestjs/common';
import { ConsentPersistency } from '../database-provider/consent/consent-persistency.interface';

@Injectable()
export class ConsentService {
  private consentRequested = new Map<number, boolean>();
  private consentRequiredNotificationSent = new Map<number, boolean>();

  constructor(
    @Inject('CONSENT_PERSISTENCY')
    private consentPersistency: ConsentPersistency,
  ) {}

  requestConsent(userId: number): void {
    this.consentRequested.set(userId, true);
  }

  cancelRequestedConsent(userId: number): void {
    this.consentRequested.set(userId, false);
  }
  consentRequiredNotificationIsSent(userId: number): void {
    this.consentRequiredNotificationSent.set(userId, true);
  }
  isConsentRequiredNotificationSent(userId: number): boolean {
    return this.consentRequiredNotificationSent.get(userId);
  }

  async isConsentDialogStarted(userId: number): Promise<boolean> {
    return this.consentRequested.get(userId);
  }

  async processConsentAnswer(answer: string, userId: number): Promise<boolean> {
    let consent: boolean;
    this.isExpectedYesAnswer(answer) && (consent = true);
    this.isExpectedNoAnswer(answer) && (consent = false);

    await this.recordConsent(userId, consent);

    return await this.checkUserConsent(userId);
  }

  async recordConsent(userId: number, consent: boolean): Promise<void> {
    try {
      await this.consentPersistency.saveUserConsent(userId, consent);
    } catch (e) {
      const errMsg = 'Failed storing user consent to the database!';
      console.error(errMsg, e);
    }
  }

  async checkUserConsent(userId: number): Promise<boolean> {
    try {
      return this.consentPersistency.getUserConsent(userId);
    } catch (e) {
      const errMsg = 'Failed reading user consent from the database!';
      console.error(errMsg, e);
    }
  }

  isExpectedAnswer(messageText: string): boolean {
    return (
      this.isExpectedYesAnswer(messageText) ||
      this.isExpectedNoAnswer(messageText)
    );
  }

  private isExpectedYesAnswer(messageText: string): boolean {
    const expectedAnswers = ['yes', 'tak', 'так', 'да', 'da'];

    return expectedAnswers.includes(messageText);
  }

  private isExpectedNoAnswer(messageText: string): boolean {
    const expectedAnswers = ['no', 'ni', 'ні', 'нет', 'net', 'hi'];

    return expectedAnswers.includes(messageText);
  }
}
