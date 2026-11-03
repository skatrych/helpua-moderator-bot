import { ConsentService } from './consent.service';
import { ConsentPersistency } from '../database-provider/consent/consent-persistency.interface';

/**
 * Isolated tests: the persistence port is a plain in-memory fake, so no
 * database connection is made.
 */
describe('ConsentService', () => {
  let persistency: {
    saveUserConsent: jest.Mock;
    getUserConsent: jest.Mock;
  };
  let svc: ConsentService;

  const USER = 4242;

  beforeEach(() => {
    const store = new Map<number, boolean>();
    persistency = {
      saveUserConsent: jest.fn(async (userId: number, consent: boolean) => {
        store.set(userId, consent);
      }),
      getUserConsent: jest.fn(async (userId: number) =>
        store.has(userId) ? store.get(userId) : false,
      ),
    };
    svc = new ConsentService(persistency as unknown as ConsentPersistency);
  });

  describe('dialog state', () => {
    it('is undefined until consent is requested', async () => {
      await expect(svc.isConsentDialogStarted(1)).resolves.toBeUndefined();
    });

    it('becomes true on requestConsent and false on cancelRequestedConsent', async () => {
      svc.requestConsent(USER);
      await expect(svc.isConsentDialogStarted(USER)).resolves.toBe(true);

      svc.cancelRequestedConsent(USER);
      await expect(svc.isConsentDialogStarted(USER)).resolves.toBe(false);
    });

    it('records the notification flag per user', () => {
      expect(svc.isConsentRequiredNotificationSent(USER)).toBeUndefined();
      svc.consentRequiredNotificationIsSent(USER);
      expect(svc.isConsentRequiredNotificationSent(USER)).toBe(true);
    });
  });

  describe('isExpectedAnswer', () => {
    it.each(['yes', 'tak', 'так', 'да', 'da'])(
      'accepts affirmative answer %s',
      (answer) => expect(svc.isExpectedAnswer(answer)).toBe(true),
    );

    it.each(['no', 'ni', 'ні', 'net', 'hi'])(
      'accepts negative answer %s',
      (answer) => expect(svc.isExpectedAnswer(answer)).toBe(true),
    );

    it.each(['maybe', 'так так', 'y'])(
      'rejects unrecognised answer %s',
      (answer) => expect(svc.isExpectedAnswer(answer)).toBe(false),
    );

    it('is case sensitive: callers are expected to lowercase first', () => {
      expect(svc.isExpectedAnswer('Tak')).toBe(false);
      expect(svc.isExpectedAnswer('tak')).toBe(true);
    });
  });

  describe('processConsentAnswer', () => {
    it('stores an affirmative answer and reports the resulting consent', async () => {
      await expect(svc.processConsentAnswer('tak', USER)).resolves.toBe(true);
      expect(persistency.saveUserConsent).toHaveBeenCalledWith(USER, true);
      expect(persistency.getUserConsent).toHaveBeenCalledWith(USER);
    });

    it('stores a negative answer and reports refusal', async () => {
      await expect(svc.processConsentAnswer('ні', USER)).resolves.toBe(false);
      expect(persistency.saveUserConsent).toHaveBeenCalledWith(USER, false);
    });

    it('persists undefined consent for an unrecognised answer', async () => {
      await svc.processConsentAnswer('banana', USER);

      // Documented runtime behaviour: neither yes- nor no-matcher fires, so the
      // local `consent` stays undefined and is passed straight through.
      expect(persistency.saveUserConsent).toHaveBeenCalledWith(USER, undefined);
    });
  });

  describe('failure containment', () => {
    it('swallows write failures instead of crashing the caller', async () => {
      const errSpy = jest
        .spyOn(console, 'error')
        .mockImplementation(() => undefined);
      persistency.saveUserConsent.mockRejectedValue(
        new Error('connection lost'),
      );

      await expect(svc.recordConsent(USER, true)).resolves.toBeUndefined();
      expect(errSpy).toHaveBeenCalledWith(
        'Failed storing user consent to the database!',
        expect.any(Error),
      );
      errSpy.mockRestore();
    });

    it('REJECTS when a read fails: the body returns without await', async () => {
      // Latent defect carried over verbatim from the runtime snapshot:
      // `try { return this.consentPersistency.getUserConsent(...) } catch {}`
      // has no `await`, so a rejected read escapes the catch arm and reaches
      // AppService.processStandardGroupMessage -> an unhandled rejection.
      const errSpy = jest
        .spyOn(console, 'error')
        .mockImplementation(() => undefined);
      persistency.getUserConsent.mockRejectedValue(
        new Error('connection lost'),
      );

      await expect(svc.checkUserConsent(USER)).rejects.toThrow(
        'connection lost',
      );
      expect(errSpy).not.toHaveBeenCalled();
      errSpy.mockRestore();
    });

    it('does contain a synchronous read failure', async () => {
      const errSpy = jest
        .spyOn(console, 'error')
        .mockImplementation(() => undefined);
      persistency.getUserConsent.mockImplementation(() => {
        throw new Error('pool exhausted');
      });

      await expect(svc.checkUserConsent(USER)).resolves.toBeUndefined();
      expect(errSpy).toHaveBeenCalledWith(
        'Failed reading user consent from the database!',
        expect.any(Error),
      );
      errSpy.mockRestore();
    });
  });
});
