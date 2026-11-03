import { Injectable } from '@nestjs/common';

const TelegramBot = require('node-telegram-bot-api');

@Injectable()
export class BotProvider {
  private readonly bot: any;

  constructor() {
    this.bot = new TelegramBot(process.env.BOT_TOKEN, {
      polling: Boolean(Number(process.env.BOT_POLLING)),
    });
  }

  getBotInstance(): any {
    return this.bot;
  }

  sendMessage(chatId: string, message: string): any {
    return this.bot.sendMessage(chatId, message);
  }

  async sendMessageTmp(chatId: string, message: string, timeout?: number): Promise<void> {
    timeout = timeout ? timeout : 3000;
    try {
      const sentMessage = await this.bot.sendMessage(chatId, message);

      setTimeout(
        () => this.deleteMessage(chatId, sentMessage.message_id),
        timeout,
      );
    } catch (error) {
      console.error('Failed to send or delete message:', error);
    }
  }

  async deleteMessage(chatId: string, messageId: number): Promise<any> {
    try {
      return this.bot.deleteMessage(chatId, messageId.toString());
    } catch (error) {
      console.error('Error deleting message:', error);
    }
  }
}
