const Telegraf = require('telegraf').Telegraf;
require('dotenv').config();
const common = require('./common.js');

const { Pool } = require('pg');
const pool = new Pool({
    user: process.env.DB_USERNAME,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: 5432,
});

const bot = new Telegraf(process.env.BOT_TOKEN);

async function storeNewMemberInDb(newMember) {

    const insertIntoMembers = async (memberId, isBot, username, firstName, lastName, status, joinedAt) => {
        try {
            const client = await pool.connect();
            const query = `
      INSERT INTO members (
        member_id,
        is_bot,
        username,
        first_name,
        last_name,
        status,
        joined_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `;
            const values = [memberId, isBot, username, firstName, lastName, status, joinedAt];
            await client.query(query, values);
            client.release();
        } catch (err) {
            console.error(err);
        }
    };

    await insertIntoMembers(newMember.id, newMember.is_bot, newMember.username, newMember.first_name, newMember.last_name, 'member', (new Date().toISOString()));
}

bot.on('new_chat_members', async (ctx) => {
    console.log('ChatID:', ctx.chat.id);
    console.log('Context:', ctx);

    const newMembers = ctx.message.new_chat_members;
    for (const newMember of newMembers) {
        console.log('New Member', newMember);

        await storeNewMemberInDb(newMember);

        // ctx.reply(`Welcome, ${newMember.first_name}!`);
        // Send a message to the group welcoming the new member
        // ctx.telegram.sendMessage(ctx.chat.id, `Welcome ${newMember.first_name}!`);
        // ctx.telegram.sendMessage(newMember.id, `Welcome ${newMember.first_name}!`);
    }
});

bot.startPolling();
