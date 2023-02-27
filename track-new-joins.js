const Telegraf = require('telegraf').Telegraf;
require('dotenv').config();
const common = require('./common.js');
const dbRepo = require('./db-repo.js');

const bot = new Telegraf(process.env.DOORMAN_BOT_TOKEN);
const isSilent = process.env.IS_BOT_SILENT;

bot.on('new_chat_members', async (ctx) => {
    console.log('ChatID:', ctx.chat.id);
    // console.log('Context:', ctx);

    const newMembers = ctx.message.new_chat_members;
    for (const newMember of newMembers) {
        // console.debug('New Member', newMember);

        console.log('New member to be added: ', newMember.username);
        const addedMember = await dbRepo.storeNewMemberInDb(newMember)
            .catch((e) => { console.error('Fail adding new member. ', e.detail)});
        console.debug('Result ', addedMember ? addedMember.rowCount: false);

        !isSilent && ctx.reply(`Welcome, ${newMember.first_name}!`);
        // Send a message to the group welcoming the new member
        // ctx.telegram.sendMessage(ctx.chat.id, `Welcome ${newMember.first_name}!`);

        // Will fail: bot can't initiate conversation with a user
        // ctx.telegram.sendMessage(newMember.id, `Welcome ${newMember.first_name}!`);
    }
});

bot.startPolling();
