require('dotenv').config();
// import * as dbRepo from './db-repo.js';
// import * as NewChatMembers from './new-chat-members.js';
// import * as Common from './common.js';
// import * as TelegramBot from 'node-telegram-bot-api';

const TelegramBot = require('node-telegram-bot-api');
const NewChatMembers = require('./new-chat-members.js');
const Common = require('./common.js');
const ReadOnlyTimeHandler = require('./handle-readonly-time.js');

// Create the bot instance
const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });
const newChatMembers = new NewChatMembers(bot);
const readOnlyTimeHandler = new ReadOnlyTimeHandler(bot);

bot.on('message', async (msg) => {
    // skip operation if the message is not from whitelisted chat
    // if (!Common.isWhitelistedChat(msg.chat.id)) return;

    // console.log('Message obj:', msg);

    const joinOrLeaveHandled = await newChatMembers.handleJoinOrLeaveSystemMessage(msg);
    if (joinOrLeaveHandled) return; // handled system message => no further actions required

    const handledAsSilentTime = await readOnlyTimeHandler.handleSilentTime(msg);
    if (handledAsSilentTime) return; // message silenced => no further actions required

    await deleteBadWords(msg, bot);

    // Just FYI:
    // const actualMessage = msg.text;
    // const userId = msg.from.id;
    // console.log('Message obj:', msg);

    const chatMemberStatus = await bot.getChatMember(msg.chat.id, msg.from.id);
    const handledAsFirstMessageOfRecentMember = await newChatMembers.handleFirstMessageOfNewMember(msg, chatMemberStatus);

    !handledAsFirstMessageOfRecentMember &&
        handleRegularMessage(msg);

});

let deleteBadWords = async (msg, bot) => {
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
}

function handleRegularMessage(msg) {
    // nothing to do for now
    return false;
}

/*
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
}*/
