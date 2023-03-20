require('dotenv').config();
// import * as dbRepo from './db-repo.js';
// import * as NewChatMembers from './new-chat-members.js';
// import * as Common from './common.js';
// import * as TelegramBot from 'node-telegram-bot-api';

const { express } = require('express');
// import express from "express";
const { Telegraf } = require('telegraf');
// import { Telegraf } from "telegraf";
const { message } = require('telegraf/filters');
// import { message } from "telegraf/filters";

const NewChatMembers = require('./new-chat-members.js');
const Common = require('./common.js');
const ReadOnlyTimeHandler = require('./handle-readonly-time.js');

// Create the bot instance
// const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });
const bot = new Telegraf(process.env.BOT_TOKEN);
const app = express();
const newChatMembers = new NewChatMembers(bot);
const readOnlyTimeHandler = new ReadOnlyTimeHandler(bot);

// Set the bot API endpoint
app.use(await bot.createWebhook({ domain: webhookDomain }));

bot.on(message('new_chat_members'), async (ctx) => {
    const joinOrLeaveHandled = await newChatMembers.handleJoinOrLeaveSystemMessage(ctx.message);
    // if (joinOrLeaveHandled) return; // handled system message => no further actions required
});

bot.on(message('left_chat_member'), async (ctx) => {
    const joinOrLeaveHandled = await newChatMembers.handleJoinOrLeaveSystemMessage(ctx.message);
    // if (joinOrLeaveHandled) return; // handled system message => no further actions required
});

bot.on(message('text'), async (ctx) => {
    ctx.reply('👍');
    console.log(ctx.message);
    console.log(ctx);
    // skip operation if the message is not from whitelisted chat
    // if (!Common.isWhitelistedChat(ctx.message.chat.id)) return;

    // console.log('Message obj:', msg);

    const handledAsSilentTime = await readOnlyTimeHandler.handleSilentTime(ctx.message);
    if (handledAsSilentTime) return; // message silenced => no further actions required

    await Common.deleteBadWords(ctx.message, bot);

    // Just FYI:
    // const actualMessage = msg.text;
    // const userId = msg.from.id;
    // console.log('Message obj:', msg);

    const chatMemberStatus = await bot.getChatMember(ctx.message.chat.id, ctx.message.from.id);
    const handledAsFirstMessageOfRecentMember = await newChatMembers.handleFirstMessageOfNewMember(ctx.message, chatMemberStatus);

    !handledAsFirstMessageOfRecentMember &&
    Common.handleRegularMessage(ctx.message);

});

bot.launch();
app.listen(port, () => console.log("Listening on port", process.env.BOT_HTTP_PORT));
