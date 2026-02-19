require('dotenv').config();

module.exports = {
  token: process.env.DISCORD_TOKEN || '',
  minPlayers: 3,
  maxPlayers: 10,
  votingTime: 30, // วินาที
  describeTime: 45, // วินาที
};
