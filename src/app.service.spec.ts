import { AppService } from './app.service';
import { BotProvider } from './bot-provider/bot-provider';
import { SilentTimeService } from './silent-time/silent-time.service';
import { ConsentService } from './user-consent/consent.service';
import { ChatType, UserMessage } from './bot-provider/bot-entities';
import { ConsentPersistency } from './database-provider/consent/consent-persistency.interface';

/**
 * Isolated tests for message routing.
 *
 * Everything the service touches is a fixture: the Telegram client is a stub
 * (no Bot API traffic) and consent persistence is an in-memory fake (no
 * database). Behavioural assertions therefore cover the routing rules that the
 * runtime snapshot implies, not the transport.
 */

const CHAT_ID = -1001234567890;
const USER_ID = 4242;

const message = (overrides: Partial<UserMessage> = {}): UserMessage => ({
  message_id: 500,
  date: Math.floor(Date.UTC(2024, 3, 15, 12, 0, 0) / 1000),
  from: {
    id: USER_ID,
    is_bot: false,
    first_name: 'Test',
    username: 'tester',
    language_code: 'uk',
  },
  chat: {
    id: CHAT_ID,
    type: ChatType.Supergroup,
    title: 'HelpUkraine',
  },
  text: 'звичайне повідомлення',
  entities: [],
  ...overrides,
});

describe('AppService', () => {
  let bot: {
    getBotInstance: jest.Mock;
    sendMessage: jest.Mock;
    sendMessageTmp: jest.Mock;
    deleteMessage: jest.Mock;
    on: jest.Mock;
  };
  let silentTime: { handleSilentTime: jest.Mock };
  let persistency: {
    saveUserConsent: jest.Mock;
    getUserConsent: jest.Mock;
  };
  let consent: ConsentService;
  let svc: AppService;
  let logSpy: jest.SpyInstance;

  /** Seed the in-memory consent store for `userId`. */
  const seedConsent = (consentValue: boolean): void => {
    persistency.getUserConsent.mockImplementation(async () => consentValue);
  };

  beforeEach(() => {
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    jest.spyOn(console, 'debug').mockImplementation(() => undefined);
    jest.spyOn(console, 'error').mockImplementation(() => undefined);

    bot = {
      getBotInstance: jest.fn().mockReturnValue({ on: jest.fn() }),
      sendMessage: jest.fn().mockResolvedValue({ message_id: 1 }),
      sendMessageTmp: jest.fn().mockResolvedValue(undefined),
      deleteMessage: jest.fn().mockResolvedValue(undefined),
      on: jest.fn(),
    };
    silentTime = { handleSilentTime: jest.fn().mockResolvedValue(false) };

    persistency = {
      saveUserConsent: jest.fn().mockResolvedValue(undefined),
      getUserConsent: jest.fn().mockResolvedValue(false),
    };
    consent = new ConsentService(persistency as unknown as ConsentPersistency);

    svc = new AppService(
      bot as unknown as BotProvider,
      silentTime as unknown as SilentTimeService,
      consent,
    );
  });

  afterEach(() => jest.restoreAllMocks());

  describe('start', () => {
    it('subscribes to the telegram "message" event', () => {
      const emitter = { on: jest.fn() };
      bot.getBotInstance.mockReturnValue(emitter);

      svc.start();

      expect(logSpy).toHaveBeenCalledWith('Bot started...');
      expect(emitter.on).toHaveBeenCalledWith('message', expect.any(Function));
    });
  });

  describe('processMessage routing', () => {
    it('routes group chatter to the moderation path', async () => {
      seedConsent(true);
      const standard = jest
        .spyOn(svc as any, 'processStandardGroupMessage')
        .mockResolvedValue(undefined);

      await svc.processMessage(message());

      expect(standard).toHaveBeenCalledTimes(1);
    });

    it('routes private chatter to the consent-dialog path', async () => {
      const dialog = jest
        .spyOn(svc, 'processConsentDialog')
        .mockResolvedValue(undefined);

      await svc.processMessage(
        message({
          chat: {
            id: USER_ID,
            type: ChatType.Private,
            first_name: 'Test',
            username: 'tester',
          },
        }),
      );

      expect(dialog).toHaveBeenCalledTimes(1);
    });

    it('sends "/start" in a group down the consent path, which then ignores it', async () => {
      const standard = jest
        .spyOn(svc as any, 'processStandardGroupMessage')
        .mockResolvedValue(undefined);
      const dialog = jest
        .spyOn(svc, 'processConsentDialog')
        .mockResolvedValue(undefined);

      await svc.processMessage(message({ text: '/start' }));

      expect(standard).not.toHaveBeenCalled();
      expect(dialog).toHaveBeenCalledTimes(1);
      expect(bot.sendMessage).not.toHaveBeenCalled();
    });
  });

  describe('processStandardGroupMessage (moderation)', () => {
    it('stops as soon as silent-time handling consumed the message', async () => {
      silentTime.handleSilentTime.mockResolvedValue(true);
      seedConsent(false);

      await (svc as any).processStandardGroupMessage(message());

      expect(persistency.getUserConsent).not.toHaveBeenCalled();
      expect(bot.deleteMessage).not.toHaveBeenCalled();
    });

    it('leaves a consented user alone', async () => {
      seedConsent(true);

      await (svc as any).processStandardGroupMessage(message());

      expect(bot.deleteMessage).not.toHaveBeenCalled();
      expect(bot.sendMessageTmp).not.toHaveBeenCalled();
    });

    it('deletes the message of a user who has not consented', async () => {
      seedConsent(false);

      await (svc as any).processStandardGroupMessage(message());

      expect(bot.deleteMessage).toHaveBeenCalledWith(CHAT_ID, 500);
    });

    it('warns the user with a self-destructing message, exactly once per user', async () => {
      seedConsent(false);
      const target = message();

      await (svc as any).processStandardGroupMessage(target);
      await (svc as any).processStandardGroupMessage(target);
      await (svc as any).processStandardGroupMessage(target);

      expect(bot.deleteMessage).toHaveBeenCalledTimes(3);
      expect(bot.sendMessageTmp).toHaveBeenCalledTimes(1);
      const [chatId, text, ttl] = bot.sendMessageTmp.mock.calls[0];
      expect(chatId).toBe(CHAT_ID);
      expect(text).toContain('@tester');
      expect(ttl).toBe(3000);
    });

    it('warns a different user independently', async () => {
      seedConsent(false);

      await (svc as any).processStandardGroupMessage(message());
      await (svc as any).processStandardGroupMessage(
        message({ from: { ...message().from, id: 999, username: 'other' } }),
      );

      expect(bot.sendMessageTmp).toHaveBeenCalledTimes(2);
    });
  });

  describe('processConsentDialog (private chat)', () => {
    const priv = (text: string): UserMessage =>
      message({
        text,
        chat: {
          id: USER_ID,
          type: ChatType.Private,
          first_name: 'Test',
          username: 'tester',
        },
      });

    it('ignores private messages that are not the /start command until asked', async () => {
      // Non-command text in a private chat is handled by the answer parser.
      await svc.processConsentDialog(priv('так'));

      expect(bot.sendMessage).toHaveBeenCalledTimes(1);
      expect(bot.sendMessage).toHaveBeenCalledWith(
        USER_ID,
        expect.stringContaining('/start'),
      );
    });

    it('on /start, opens the dialog and sends the rules plus the question', async () => {
      await svc.processConsentDialog(priv('/start'));

      expect(bot.sendMessage).toHaveBeenCalledTimes(2);
      expect(bot.sendMessage).toHaveBeenNthCalledWith(
        1,
        USER_ID,
        expect.stringContaining('https://t.me/helpUkrainetowin/277261'),
      );
      expect(bot.sendMessage).toHaveBeenNthCalledWith(
        2,
        USER_ID,
        expect.stringContaining('"Так"'),
      );
      // Dialog state is now open, proven by the follow-up below.
      expect(await consent.isConsentDialogStarted(USER_ID)).toBe(true);
    });

    it('ignores group messages entirely', async () => {
      await svc.processConsentDialog(message({ text: '/start' }));

      expect(bot.sendMessage).not.toHaveBeenCalled();
    });
  });

  describe('processNonCommandMessage (answer parsing)', () => {
    const priv = (text: string): UserMessage =>
      message({
        text,
        chat: {
          id: USER_ID,
          type: ChatType.Private,
          first_name: 'Test',
          username: 'tester',
        },
      });

    it('ignores messages without text (e.g. stickers or photos)', async () => {
      await (svc as any).processNonCommandMessage(priv(undefined));

      expect(bot.sendMessage).not.toHaveBeenCalled();
    });

    it('records an affirmative answer and thanks the user', async () => {
      consent.requestConsent(USER_ID);
      seedConsent(true);

      await (svc as any).processNonCommandMessage(priv('Так'));

      expect(persistency.saveUserConsent).toHaveBeenCalledWith(USER_ID, true);
      expect(bot.sendMessage).toHaveBeenCalledWith(
        USER_ID,
        expect.stringContaining('Дякуємо за вашу співпрацю'),
      );
      // The dialog is closed again afterwards.
      expect(await consent.isConsentDialogStarted(USER_ID)).toBe(false);
    });

    it('records a refusal and confirms read-only access', async () => {
      consent.requestConsent(USER_ID);
      seedConsent(false);

      await (svc as any).processNonCommandMessage(priv('ні'));

      expect(persistency.saveUserConsent).toHaveBeenCalledWith(USER_ID, false);
      expect(bot.sendMessage).toHaveBeenCalledWith(
        USER_ID,
        expect.stringContaining('не можете писати повідомлення'),
      );
    });

    it('asks again when the dialog is open but the answer is unrecognised', async () => {
      consent.requestConsent(USER_ID);

      await (svc as any).processNonCommandMessage(priv('можливо'));

      expect(persistency.saveUserConsent).not.toHaveBeenCalled();
      expect(bot.sendMessage).toHaveBeenCalledWith(
        USER_ID,
        expect.stringContaining('так або ні'),
      );
    });

    it('points a user with no open dialog at /start', async () => {
      await (svc as any).processNonCommandMessage(priv('привіт'));

      expect(bot.sendMessage).toHaveBeenCalledWith(
        USER_ID,
        expect.stringContaining('/start'),
      );
    });
  });
});
