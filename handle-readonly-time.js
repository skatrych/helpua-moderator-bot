// const dbRepo = require('./db-repo.js');
const isSilent = process.env.IS_BOT_SILENT || true;
const hoursIsTooLate = process.env.IS_TOO_LATE || 23;
const hoursIsTooEarly = process.env.IS_TOO_EARLY || 7;

module.exports = class ReadOnlyTimeHandler {
    bot;
    constructor(bot) {
        this.bot = bot;
    }
    async handleSilentTime(msg) {
        // delete message from chat if this is silent time
        ReadOnlyTimeHandler.isSilentTime(msg) &&
            await this.bot.deleteMessage(msg.chat.id, msg.message_id);

        !isSilent && ctx.reply(`Message of user ${msg.from.username} is silenced!`);
    }

    static isSilentTime(msg) {
        return ReadOnlyTimeHandler.isTooEarlyForMessage(msg) || ReadOnlyTimeHandler.isTooLateForMessage(msg);
    }

    static isTooLateForMessage(msg) {
        const nowDate = new Date(msg.date);

        return nowDate.getHours() >= hoursIsTooLate;
    }

    static isTooEarlyForMessage(msg) {
        const nowDate = new Date(msg.date);

        return nowDate.getHours() >= hoursIsTooEarly;
    }
}
