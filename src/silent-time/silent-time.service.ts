import { Injectable } from '@nestjs/common';
import { BotProvider } from '../bot-provider/bot-provider';

@Injectable()
export class SilentTimeService {
  private readonly bot: any;

  private static readonly isSilent =
    Boolean(Number(process.env.IS_BOT_SILENT)) || true;

  private static readonly hoursIsTooLate =
    Number(process.env.IS_TOO_LATE) || 23;

  private static readonly hoursIsTooEarly =
    Number(process.env.IS_TOO_EARLY) || 6;

  constructor(private readonly botProvider: BotProvider) {
    this.bot = botProvider.getBotInstance();
  }

  async handleSilentTime(msg): Promise<boolean> {
    let isDeleted = false;

    if (SilentTimeService.isSilentTime(msg)) {
      await this.bot
        .deleteMessage(msg.chat.id, msg.message_id)
        .catch((_) => console.error);
      console.debug(
        `Silenced message from ${msg.from.username} at ` +
          SilentTimeService.dateFromUnixTimestamp(msg.date).toISOString(),
      );
      isDeleted = true;

      !SilentTimeService.isSilent &&
        console.log(`Message of user ${msg.from.username} is silenced!`);
    }

    return isDeleted;
  }

  static isSilentTime(msg): boolean {
    return (
      SilentTimeService.isTooEarlyForMessage(msg) ||
      SilentTimeService.isTooLateForMessage(msg)
    );
  }

  static isTooLateForMessage(msg): boolean {
    const nowDate = SilentTimeService.dateFromUnixTimestamp(msg.date);

    return nowDate.getHours() >= SilentTimeService.hoursIsTooLate;
  }

  static isTooEarlyForMessage(msg): boolean {
    const nowDate = SilentTimeService.dateFromUnixTimestamp(msg.date);

    return nowDate.getHours() <= SilentTimeService.hoursIsTooEarly;
  }

  static dateFromUnixTimestamp(unixTimeStamp): Date {
    return new Date(unixTimeStamp * 1000);
  }
}
