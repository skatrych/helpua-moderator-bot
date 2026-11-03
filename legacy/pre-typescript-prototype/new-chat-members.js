const dbRepo = require('./db-repo.js');
const Common = require("./common.js");
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
        NewChatMembers.isNewJoinSystemMessage(msg) &&
            await this.storeNewMember(msg.new_chat_member);

        NewChatMembers.isLeaveChannelSystemMessage(msg) &&
            await this.deleteExistingMember(msg.left_chat_participant);

        return NewChatMembers.isNewJoinSystemMessage(msg) || NewChatMembers.isLeaveChannelSystemMessage(msg);
    }

    static isNewJoinSystemMessage(msg) {
        return (msg && msg.new_chat_member != undefined);
    }

    static isLeaveChannelSystemMessage(msg) {
        return (msg && msg.left_chat_participant != undefined);
    }

    async storeNewMember(newMember) {
        console.debug('Handle adding New member: ', newMember.username);
        const addedMember = await dbRepo.storeNewMemberInDb(newMember)
            .catch((e) => { console.error('Fail adding new member. ', e.detail)});
        console.debug('Result ', addedMember ? addedMember.rowCount: false);

        !isSilent && ctx.reply(`Welcome, ${newMember.first_name}!`);
    }

    async deleteExistingMember(member) {
        console.debug('Handling deletion of the member: ', member.username);
        return await dbRepo.deleteMemberFromDb(member)
            .catch((e) => { console.error('Fail deleting a member that left the channel. ', e.detail)});
    }

    async handleFirstMessageOfNewMember(msg, member) {
        // const isFirstMessage = await Common.isFirstMessageInChat(msg, this.bot);
        const chatMember = member;
        if (chatMember.status == 'creator' || chatMember.status == 'administrator') return false; // don't moderate administrator's messages

        const isRecentMember = await dbRepo.isRecentMember(msg.from.id);
        if (isRecentMember) {
            console.debug('Handling unwanted message');
            await newChatMembers.noMessagesFromNewUser(chatId, msg.message_id);

            return true;
        }

        return false;
    };
}
