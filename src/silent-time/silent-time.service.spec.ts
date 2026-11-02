import { SilentTimeService } from './silent-time.service';

/**
 * Isolated tests: no Telegram connection, no database.
 *
 * The thresholds are read from `process.env` when the class is first loaded, so
 * each test builds timestamps in *local* time (`getHours()` is local-time too)
 * instead of depending on the machine timezone.
 */
describe('SilentTimeService', () => {
  const atHour = (hour: number): number =>
    Math.floor(new Date(2024, 3, 15, hour, 30, 0).getTime() / 1000);

  const msgAt = (hour: number) => ({
    message_id: 1,
    date: atHour(hour),
    chat: { id: -1001, type: 'supergroup' },
    from: { id: 42, username: 'tester' },
  });

  describe('dateFromUnixTimestamp', () => {
    it('converts Telegram unix seconds into a Date', () => {
      const ts = atHour(12);

      expect(SilentTimeService.dateFromUnixTimestamp(ts)).toEqual(
        new Date(ts * 1000),
      );
    });
  });

  describe('isTooLateForMessage', () => {
    // default threshold: 23
    it('is true at hour 23 (>= default 23)', () => {
      expect(SilentTimeService.isTooLateForMessage(msgAt(23))).toBe(true);
    });

    it.each([9, 12, 22])('is false at hour %i', (hour) => {
      expect(SilentTimeService.isTooLateForMessage(msgAt(hour))).toBe(false);
    });
  });

  describe('isTooEarlyForMessage', () => {
    // default threshold: 6
    it.each([0, 5, 6])('is true at hour %i (<= default 6)', (hour) => {
      expect(SilentTimeService.isTooEarlyForMessage(msgAt(hour))).toBe(true);
    });

    it('is false at hour 7 (just past the default threshold)', () => {
      expect(SilentTimeService.isTooEarlyForMessage(msgAt(7))).toBe(false);
    });
  });

  describe('isSilentTime', () => {
    it('is true during the night window', () => {
      expect(SilentTimeService.isSilentTime(msgAt(2))).toBe(true);
      expect(SilentTimeService.isSilentTime(msgAt(23))).toBe(true);
    });

    it('is false during open hours', () => {
      expect(SilentTimeService.isSilentTime(msgAt(10))).toBe(false);
      expect(SilentTimeService.isSilentTime(msgAt(15))).toBe(false);
    });
  });

  describe('handleSilentTime', () => {
    let bot: { deleteMessage: jest.Mock };
    let svc: SilentTimeService;
    let debugSpy: jest.SpyInstance;

    beforeEach(() => {
      bot = { deleteMessage: jest.fn().mockResolvedValue(undefined) };
      svc = new SilentTimeService({
        getBotInstance: () => bot,
      } as any);
      debugSpy = jest
        .spyOn(console, 'debug')
        .mockImplementation(() => undefined);
    });

    afterEach(() => jest.restoreAllMocks());

    it('deletes a message sent during silent time and reports it as handled', async () => {
      await expect(svc.handleSilentTime(msgAt(3))).resolves.toBe(true);
      expect(bot.deleteMessage).toHaveBeenCalledWith(-1001, 1);
      expect(debugSpy).toHaveBeenCalled();
    });

    it('leaves a daytime message untouched', async () => {
      await expect(svc.handleSilentTime(msgAt(12))).resolves.toBe(false);
      expect(bot.deleteMessage).not.toHaveBeenCalled();
    });

    it('still reports the message as deleted when the API call rejects', async () => {
      bot.deleteMessage.mockRejectedValue(
        new Error('403: bot is not an administrator'),
      );

      await expect(svc.handleSilentTime(msgAt(1))).resolves.toBe(true);
    });
  });
});
