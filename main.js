const TelegramBot = require('node-telegram-bot-api');
const NewChatMembers = require('./new-chat-members');
require('dotenv').config();

// Replace the token with your bot's token
const token = process.env.BOT_TOKEN;

// Create the bot instance
const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });
const newChatMembers = new NewChatMembers(bot);

// Define the bot's functions
// bot.onText(/\/start/, (msg) => {
//     bot.sendMessage(msg.chat.id, 'Hi there! I am a moderation bot.');
// });

bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const message = msg.text;
    const user = msg.from.username;
    console.log('Message obj:', msg);

    const isFirstMessage = await isFirstMessageInChat(msg, bot);
    if (isFirstMessage && isWhitelistedChat()) {
        await newChatMembers.noMessagesFromNewUser(chatId, msg.message_id);

    } else {
        // moderate regular cases
    }
    console.log('isFirstMessage', isFirstMessage);
    await deleteBadWords(msg, bot);

});

let isFirstMessageInChat = async (msg, bot) => {
    const chatId = msg.chat.id;
    const message = msg.text;
    const userId = msg.from.id;

    // Get information about the user in the chat
    const chatMember = await bot.getChatMember(chatId, userId);
    console.log('ChatMember', chatMember);

    // Check if this is the first message sent by this user in the chat
    if (chatMember.status === 'left') {
        return true;
    } else {
        return false;
    }
}

let deleteBadWords = async (msg, bot) => {
    const chatId = msg.chat.id;
    const message = msg.text;

    // Define the list of inappropriate words
    const badWords = ['bad_word_1', 'bad_word_2'];

    // Check if the message contains any inappropriate language
    if (badWords.some(badWord => message.includes(badWord))) {
        await bot.deleteMessage(chatId, msg.message_id);
    }
}

let handleUserTime = async (msg, bot) => {
    // Get the user who sent the message
    // const user = ctx.message.from;
    const user = msg.from.id;

    // Check if this is the first message from this user in the group
    if (!userJoinTimes.has(user.id)) {
        // Store the current time as the time the user joined the group
        userJoinTimes.set(user.id, new Date());

        // Send a direct message to the user with a welcome message
        ctx.telegram.sendMessage(user.id, `Welcome to the group! You have been a member for 0 seconds.`);
    } else {
        // Calculate the difference between the current time and the time the user joined the group
        const joinTime = userJoinTimes.get(user.id);
        const timeDiff = (new Date() - joinTime) / 1000;

        // Send a direct message to the user with the time they have been a member of the group
        ctx.telegram.sendMessage(user.id, `You have been a member of the group for ${timeDiff} seconds.`);
    }
}