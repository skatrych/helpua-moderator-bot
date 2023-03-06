
module.exports = {

    isWhitelistedChat: (chatId) => {
        if (chatId == process.env.CHAT_ID) { // only my test chat
            return true;
        }
        console.log('Message in NOT whitelisted chat', chatId);
        return false;
    },

    isFirstMessageInChat: async (msg, bot) => {
        const chatId = msg.chat.id;
        // const message = msg.text;
        const userId = msg.from.id;

        // Get information about the user in the chat
        const chatMember = await bot.getChatMember(chatId, userId);
        // console.log('ChatMember', chatMember);

        // Check if this is the first message sent by this user in the chat
        return (chatMember.status === 'left');
    }
}