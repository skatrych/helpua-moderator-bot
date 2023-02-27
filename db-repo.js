const {Pool} = require("pg");

const getDbPool = () => {
    return new Pool({
        user: process.env.DB_USERNAME,
        host: process.env.DB_HOST,
        database: process.env.DB_NAME,
        password: process.env.DB_PASSWORD,
        port: 5432,
    });
};

const insertIntoMembers = async (memberId, isBot, username, firstName, lastName, status, joinedAt) => {
    const client = await getDbPool().connect();
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
    const result = await client.query(query, values);
    client.release();

    return result;
}

// ------ Public functions

module.exports.storeNewMemberInDb = async (newMember) => {
    return await insertIntoMembers(
        newMember.id,
        newMember.is_bot,
        newMember.username,
        newMember.first_name,
        newMember.last_name,
        'member',
        (new Date()).toUTCString());
}