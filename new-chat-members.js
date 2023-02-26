
module.exports = class NewChatMembers {
    bot;
    constructor(bot) {
        this.bot = bot;
    }
    async noMessagesFromNewUser(chatId, message_id) {
        // delete message from chat
        await this.bot.deleteMessage(chatId, message_id);
        // send private message with explanation
        await this.bot.sendMessage(userId, 'According to the rules of HelpUkraine group, users have rights to send messages only after being a group member for 1 day');
    }
}
