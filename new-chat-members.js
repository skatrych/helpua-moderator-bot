const dbRepo = require('./db-repo.js');
const Common = require("./common");
const isSilent = process.env.IS_BOT_SILENT;

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

    async handleJoinOrLeaveSystemMessage(msg) {
        NewChatMembers.isNewJoinSystemMessage() &&
            await this.storeNewMember(msg.new_chat_participant);

        NewChatMembers.isLeaveChannelSystemMessage(msg) &&
            await this.deleteExistingMember(msg.left_chat_participant);

        return NewChatMembers.isNewJoinSystemMessage() || NewChatMembers.isLeaveChannelSystemMessage(msg);
    }

    static isNewJoinSystemMessage(msg) {
        return (msg.new_chat_participant != undefined);
    }

    static isLeaveChannelSystemMessage(msg) {
        return (msg.left_chat_participant != undefined);
    }

    async storeNewMember(newMember) {
        console.log('New member to be added: ', newMember.username);
        const addedMember = await dbRepo.storeNewMemberInDb(newMember)
            .catch((e) => { console.error('Fail adding new member. ', e.detail)});
        console.debug('Result ', addedMember ? addedMember.rowCount: false);

        !isSilent && ctx.reply(`Welcome, ${newMember.first_name}!`);
    }

    async deleteExistingMember(member) {
        return await dbRepo.deleteMemberFromDb(member)
            .catch((e) => { console.error('Fail deleting a member that left the channel. ', e.detail)});
    }

    async handleFirstMessageOfNewMember(msg) {
        const isFirstMessage = await Common.isFirstMessageInChat(msg, this.bot);
        const isRecentMember = dbRepo.isRecentMember(msg.from.id);
        if (isFirstMessage && isRecentMember) {
            console.debug('Handling unwanted message');
            await newChatMembers.noMessagesFromNewUser(chatId, msg.message_id);

            return true;
        }

        return false;
    };
}
