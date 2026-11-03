/**
 * Isolated tests for the nightly-closure announcement.
 *
 * `cron` is mocked so no real timer is ever armed (a live CronJob would keep
 * the Jest event loop busy), and the scheduler registry / config service / bot
 * are plain fixtures.
 */
const MockCronJob = jest.fn();
const mockJob = { start: jest.fn() };

jest.mock('cron', () => ({
  CronJob: function CronJob(...args: unknown[]) {
    MockCronJob(...args);
    return mockJob;
  },
}));

import { AnnouncementService } from './announcement.service';
import { SchedulerRegistry } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { BotProvider } from '../bot-provider/bot-provider';

describe('AnnouncementService', () => {
  let configValues: Record<string, string>;
  let config: { get: jest.Mock };
  let registry: { addCronJob: jest.Mock };
  let bot: { sendMessage: jest.Mock };
  let svc: AnnouncementService;
  let debugSpy: jest.SpyInstance;
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    configValues = {
      IS_TOO_LATE: '23',
      CHAT_ID: '-1001234567890',
      GROUP_CLOSURE_ANNOUNCEMENT: 'Група закривається на ніч.',
    };
    config = {
      get: jest.fn((key: string, def?: string) =>
        key in configValues ? configValues[key] : def,
      ),
    };
    registry = { addCronJob: jest.fn() };
    bot = { sendMessage: jest.fn() };
    MockCronJob.mockClear();
    mockJob.start.mockClear();
    debugSpy = jest.spyOn(console, 'debug').mockImplementation(() => undefined);
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    svc = new AnnouncementService(
      config as unknown as ConfigService,
      registry as unknown as SchedulerRegistry,
      bot as unknown as BotProvider,
    );
  });

  afterEach(() => jest.restoreAllMocks());

  describe('getNightlyClosureCronExpression', () => {
    it('announces one hour before the closure hour, at :59:58', () => {
      expect((svc as any).getNightlyClosureCronExpression()).toBe(
        '58 59 22 * * *',
      );
    });

    it('follows a configured IS_TOO_LATE', () => {
      configValues.IS_TOO_LATE = '21';

      expect((svc as any).getNightlyClosureCronExpression()).toBe(
        '58 59 20 * * *',
      );
    });

    it('falls back to 23 when IS_TOO_LATE is unset', () => {
      delete configValues.IS_TOO_LATE;

      expect(config.get).not.toHaveBeenCalledWith('IS_TOO_LATE', '23');
      expect((svc as any).getNightlyClosureCronExpression()).toBe(
        '58 59 22 * * *',
      );
    });

    it.each([
      ['0', '58 59 -1 * * *'],
      ['5', '58 59 4 * * *'],
    ])('IS_TOO_LATE=%s produces %s', (value, expected) => {
      configValues.IS_TOO_LATE = value;

      expect((svc as any).getNightlyClosureCronExpression()).toBe(expected);
    });
  });

  describe('scheduleNightlyClosureAnnouncement', () => {
    it('registers a named cron job with the registry and starts it', () => {
      (svc as any).scheduleNightlyClosureAnnouncement();

      expect(MockCronJob).toHaveBeenCalledWith(
        '58 59 22 * * *',
        expect.any(Function),
      );
      expect(registry.addCronJob).toHaveBeenCalledWith(
        'NightlyClosureAnnouncement',
        mockJob,
      );
      expect(mockJob.start).toHaveBeenCalledTimes(1);
    });

    it('wires the job callback to sendAnnouncement', () => {
      const send = jest
        .spyOn(svc as any, 'sendAnnouncement')
        .mockReturnValue(undefined);

      (svc as any).scheduleNightlyClosureAnnouncement();
      const callback = MockCronJob.mock.calls[0][1] as () => void;
      callback();

      expect(send).toHaveBeenCalledTimes(1);
    });
  });

  describe('onModuleInit', () => {
    it('schedules the announcement when the module initialises', () => {
      const schedule = jest
        .spyOn(svc as any, 'scheduleNightlyClosureAnnouncement')
        .mockReturnValue(undefined);

      svc.onModuleInit();

      expect(schedule).toHaveBeenCalledTimes(1);
    });
  });

  describe('sendAnnouncement', () => {
    it('posts the configured text to the configured chat', () => {
      (svc as any).sendAnnouncement();

      expect(bot.sendMessage).toHaveBeenCalledWith(
        '-1001234567890',
        'Група закривається на ніч.',
      );
      expect(debugSpy).toHaveBeenCalledWith(
        'Sending announcement about group closure',
      );
    });

    it('contains a transport failure instead of rethrowing', () => {
      bot.sendMessage.mockImplementation(() => {
        throw new Error('401: Unauthorized');
      });

      expect(() => (svc as any).sendAnnouncement()).not.toThrow();
      expect(errorSpy).toHaveBeenCalledWith(
        'Failed sending message to chatID -1001234567890',
        expect.any(Error),
      );
    });
  });
});
