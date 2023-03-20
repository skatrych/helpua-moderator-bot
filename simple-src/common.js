
module.exports = {

    isWhitelistedChat: (chatId) => {
        if (chatId === process.env.CHAT_ID) { // only my test chat
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
    },

    deleteBadWords: async (msg, bot) => {
        const chatId = msg.chat.id;
        const message = msg.text;

        // Define the list of inappropriate words
        const badWords = ['tesst', 'bad_word_1', 'bad_word_2'];

        // Check if the message contains any inappropriate language
        if (message && badWords.some(badWord => message.includes(badWord))) {
            await bot.deleteMessage(chatId, msg.message_id)
                .catch((e) => {
                    console.log("Failed deleting message", message, e);
                });
        }
    },

    handleRegularMessage: (msg) => {
        // nothing to do for now
        return false;
    },

}