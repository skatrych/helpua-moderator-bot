import { Injectable } from '@nestjs/common';
import { BotProvider } from './bot-provider/bot-provider';
import { SilentTimeService } from './silent-time/silent-time.service';
import { ConsentService } from './user-consent/consent.service';
import { ChatType, UserMessage } from './bot-provider/bot-entities';

@Injectable()
export class AppService {
  private readonly bot: any;
  private readonly silentTime: SilentTimeService;

  constructor(
    botProvider: BotProvider,
    private readonly silentTimeSvc: SilentTimeService,
    private readonly userConsent: ConsentService,
  ) {
    this.bot = botProvider;
    this.silentTime = silentTimeSvc;
  }

  start(): void {
    console.log('Bot started...');

    this.bot.getBotInstance().on('message', (msg) => this.processMessage(msg));
  }

  async processMessage(msg: UserMessage): Promise<void> {
    if (this.isNotInPrivateChat(msg) && this.notReservedCommand(msg)) {
      return await this.processStandardGroupMessage(msg);
    }

    return await this.processConsentDialog(msg);
  }

  private notReservedCommand(msg: UserMessage): boolean {
    return msg.text !== '/start';
  }

  private async processStandardGroupMessage(msg: UserMessage): Promise<void> {
    const handledAsSilentTime = await this.silentTime.handleSilentTime(msg);
    if (handledAsSilentTime) return;

    if (false === (await this.userConsent.checkUserConsent(msg.from.id))) {
      await this.bot
        .deleteMessage(msg.chat.id, msg.message_id)
        .catch((e) => console.error(e));
      console.debug(
        `Silenced message (reason: consent) from ${msg.from.username} at ` +
          SilentTimeService.dateFromUnixTimestamp(msg.date).toISOString(),
      );

      if (!this.userConsent.isConsentRequiredNotificationSent(msg.from.id)) {
        await this.bot
          .sendMessageTmp(
            msg.chat.id,
            `@${msg.from.username} Ваше повідомлення було видалене оскільки Ви (ще) не дали згоду на дотримання правил нашої групи. Детальніша інформація знаходиться у закріплених повідомленнях вище. Дякуємо за розуміння!`,
            3000,
          )
          .catch((e) => console.error(e));
        this.userConsent.consentRequiredNotificationIsSent(msg.from.id);
      }
    }
  }

  async processConsentDialog(msg: UserMessage): Promise<void> {
    if (this.isNotInPrivateChat(msg)) {
      return;
    }
    console.log(msg);

    if (this.notReservedCommand(msg)) {
      return this.processNonCommandMessage(msg);
    }
    this.userConsent.requestConsent(msg.from.id);
    await this.bot
      .sendMessage(
        msg.chat.id,
        'Прочитайте уважно правила групи "ПОМОЩЬ УКРАИНЕ (Мюнхен)" за наступним посиланням: https://t.me/helpUkrainetowin/277261',
      )
      .catch((e) => console.error(e));
    await this.bot
      .sendMessage(
        msg.chat.id,
        'У випадку якщо ви прочитали правила і погоджуєтесь їх виконувати, напишіть у відповідь "Так". В іншому випадку напишіть "Ні".',
      )
      .catch((e) => console.error(e));
  }

  private isNotInPrivateChat(msg: UserMessage): boolean {
    return msg.chat.type !== ChatType.Private;
  }

  private async processNonCommandMessage(msg: UserMessage): Promise<void> {
    if (!msg.text) return;

    const messageText = msg.text.toLowerCase();
    if (
      (await this.userConsent.isConsentDialogStarted(msg.from.id)) &&
      this.userConsent.isExpectedAnswer(messageText)
    ) {
      const result = await this.userConsent.processConsentAnswer(
        messageText,
        msg.from.id,
      );

      result &&
        (await this.bot.sendMessage(
          msg.chat.id,
          'Дякуємо за вашу співпрацю! Відтепер ви можете писати повідомлення в нашій групі!',
        ));

      !result &&
        (await this.bot.sendMessage(
          msg.chat.id,
          'Дякуємо за вашу відповідь. Осткільки ви відмовились прийняти правила групи, ви не можете писати повідомлення, проте можете читати нашу групу!',
        ));

      this.userConsent.cancelRequestedConsent(msg.from.id);
      return;
    }

    if (await this.userConsent.isConsentDialogStarted(msg.from.id)) {
      return await this.bot.sendMessage(
        msg.chat.id,
        'Будь ласка дайте коротку відповідь: так або ні.',
      );
    }

    await this.bot.sendMessage(
      msg.chat.id,
      'Для початку діалогу про погодження із правилами групи, надішліть команду /start',
    );
  }
}
