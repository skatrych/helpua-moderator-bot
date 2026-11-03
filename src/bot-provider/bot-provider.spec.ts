/**
 * Isolated tests for the Telegram adapter.
 *
 * `node-telegram-bot-api` is replaced by a mock constructor, so no Bot API
 * request is attempted and no real token is involved. Each `new BotProvider()`
 * produces a fresh mock instance, keeping tests independent.
 */
jest.mock('node-telegram-bot-api', () =>
  jest.fn(() => ({
    sendMessage: jest.fn().mockResolvedValue({ message_id: 99 }),
    deleteMessage: jest.fn().mockResolvedValue(true),
  })),
);

import { BotProvider } from './bot-provider';

const TelegramBot = require('node-telegram-bot-api') as jest.Mock;

type FakeBot = {
  sendMessage: jest.Mock;
  deleteMessage: jest.Mock;
};

describe('BotProvider', () => {
  let provider: BotProvider;
  let bot: FakeBot;

  const TOKEN = 'unit-test-token-not-a-real-one';

  const construct = (): void => {
    provider = new BotProvider();
    bot = TelegramBot.mock.results[TelegramBot.mock.results.length - 1]
      .value as FakeBot;
  };

  beforeEach(() => {
    jest.useFakeTimers();
    TelegramBot.mockClear();
    process.env.BOT_TOKEN = TOKEN;
    delete process.env.BOT_POLLING;
    construct();
  });

  afterEach(() => {
    jest.useRealTimers();
    delete process.env.BOT_TOKEN;
    delete process.env.BOT_POLLING;
  });

  describe('construction', () => {
    it('passes BOT_TOKEN through and derives polling from BOT_POLLING', () => {
      expect(TelegramBot).toHaveBeenCalledWith(TOKEN, { polling: false });
    });

    it('enables polling when BOT_POLLING is a truthy numeric string', () => {
      process.env.BOT_POLLING = '1';
      construct();

      expect(TelegramBot).toHaveBeenLastCalledWith(TOKEN, { polling: true });
    });

    it('disables polling for "0" and for non-numeric values', () => {
      process.env.BOT_POLLING = '0';
      construct();
      expect(TelegramBot).toHaveBeenLastCalledWith(TOKEN, { polling: false });

      process.env.BOT_POLLING = 'yes';
      construct();
      // Boolean(Number('yes')) === Boolean(NaN) === false
      expect(TelegramBot).toHaveBeenLastCalledWith(TOKEN, { polling: false });
    });

    it('exposes the underlying client through getBotInstance()', () => {
      expect(provider.getBotInstance()).toBe(bot);
    });
  });

  describe('sendMessage', () => {
    it('delegates verbatim', () => {
      provider.sendMessage('-1001', 'hello');

      expect(bot.sendMessage).toHaveBeenCalledWith('-1001', 'hello');
    });
  });

  describe('sendMessageTmp', () => {
    it('sends, then deletes the message after the 3000ms default', async () => {
      const promise = provider.sendMessageTmp('-1001', 'notice');

      await Promise.resolve();
      await Promise.resolve();
      expect(bot.sendMessage).toHaveBeenCalledWith('-1001', 'notice');
      expect(bot.deleteMessage).not.toHaveBeenCalled();

      jest.advanceTimersByTime(2999);
      expect(bot.deleteMessage).not.toHaveBeenCalled();

      jest.advanceTimersByTime(1);
      expect(bot.deleteMessage).toHaveBeenCalledWith('-1001', '99');

      await promise;
    });

    it('honours an explicit timeout', async () => {
      const promise = provider.sendMessageTmp('-1001', 'notice', 50);
      await Promise.resolve();
      await Promise.resolve();

      jest.advanceTimersByTime(50);
      expect(bot.deleteMessage).toHaveBeenCalledWith('-1001', '99');
      await promise;
    });

    it('swallows send failures rather than rejecting the caller', async () => {
      const errSpy = jest
        .spyOn(console, 'error')
        .mockImplementation(() => undefined);
      bot.sendMessage.mockRejectedValue(new Error('429: too many requests'));

      await expect(
        provider.sendMessageTmp('-1001', 'notice', 10),
      ).resolves.toBeUndefined();
      expect(errSpy).toHaveBeenCalledWith(
        'Failed to send or delete message:',
        expect.any(Error),
      );
      errSpy.mockRestore();
    });
  });

  describe('deleteMessage', () => {
    it('stringifies the numeric message id', async () => {
      await provider.deleteMessage('-1001', 123);

      expect(bot.deleteMessage).toHaveBeenCalledWith('-1001', '123');
    });

    it('contains a synchronous failure', async () => {
      const errSpy = jest
        .spyOn(console, 'error')
        .mockImplementation(() => undefined);
      bot.deleteMessage.mockImplementation(() => {
        throw new Error('boom');
      });

      await expect(
        provider.deleteMessage('-1001', 456),
      ).resolves.toBeUndefined();
      expect(errSpy).toHaveBeenCalledWith(
        'Error deleting message:',
        expect.any(Error),
      );
      errSpy.mockRestore();
    });

    it('REJECTS on an async failure: the body returns without await', async () => {
      // Latent defect carried over verbatim from the runtime snapshot:
      // `try { return this.bot.deleteMessage(...) } catch {}` has no `await`,
      // so the catch arm can only see synchronous throws.
      const errSpy = jest
        .spyOn(console, 'error')
        .mockImplementation(() => undefined);
      bot.deleteMessage.mockRejectedValue(
        new Error('400: message to delete not found'),
      );

      await expect(provider.deleteMessage('-1001', 456)).rejects.toThrow(
        '400: message to delete not found',
      );
      expect(errSpy).not.toHaveBeenCalled();
      errSpy.mockRestore();
    });
  });
});
