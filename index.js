const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  REST,
  Routes,
} = require('discord.js');
const config = require('./config');
const { UndercoverGame, ROLES } = require('./game/UndercoverGame');
const commands = require('./commands');

const activeGames = new Map();
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.GuildMembers,
  ],
});

function getGame(channelId) {
  return activeGames.get(channelId);
}

async function runCommand(interaction) {
  const sub = interaction.options.getSubcommand();
  const channelId = interaction.channel.id;
  const user = interaction.user;

  if (sub === 'help') {
    const embed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle('🎭 Undercover - How to Play')
      .setDescription(`
**Rules:**
- Most players get the **same word** (Civilian)
- 1 player gets a **similar word** (Undercover)
- With 5+ players, there may be **Mr. White** with no word

**Commands:** Type \`/uc\` and select
\`\`\`
/uc create   - Create room (Host)
/uc join     - Join game
/uc leave    - Leave room
/uc start    - Start game — เลือกจำนวน Undercover และ Mr. White ได้
/uc word     - View your word
/uc vote     - Start voting
/uc end      - End game (Host)
/uc help     - Show this help
\`\`\`

**How to play:**
1. Everyone gives a **one-word hint** about their word (พิมพ์ในแชท)
2. ใช้ \`/uc vote\` เมื่อทุกคนอธิบายแล้ว
3. Vote for who you think is the Undercover
4. Player with most votes is eliminated
5. Civilians win by eliminating all Undercover

**/uc start — เลือกค่า:**
- \`undercover\`: 1, 2 หรือ 3 (จำนวน Undercover)
- \`mr_white\`: เลือก **Yes** = มี Mr. White | **No** = ไม่มี (พิมพ์ Yes/No ตัวใหญ่ตัวเล็กก็ได้)
      `)
      .setFooter({ text: `Minimum ${config.minPlayers} players required` });
    return interaction.reply({ embeds: [embed], ephemeral: true });
  }

  if (sub === 'create') {
    if (activeGames.has(channelId)) {
      return interaction.reply({ content: '⚠️ A game is already in progress', ephemeral: true });
    }
    const game = new UndercoverGame(user.id, channelId, config);
    game.addPlayer(user.id, user.username);
    activeGames.set(channelId, game);

    const embed = new EmbedBuilder()
      .setColor(0x57F287)
      .setTitle('🎮 Game room created!')
      .setDescription(`${user} สร้างห้อง\n\nใช้ \`/uc join\` เพื่อเข้าร่วม`)
      .addFields({ name: 'Players', value: `1/${config.maxPlayers}`, inline: true })
      .addFields({ name: 'Start game', value: '`/uc start`', inline: true })
      .setFooter({ text: `Need at least ${config.minPlayers} players` });
    return interaction.reply({ embeds: [embed] });
  }

  if (sub === 'join') {
    const game = getGame(channelId);
    if (!game) return interaction.reply({ content: '⚠️ No game here. Use `/uc create` first', ephemeral: true });
    if (game.phase !== 'waiting') return interaction.reply({ content: '⚠️ Game has already started', ephemeral: true });

    const added = game.addPlayer(user.id, user.username);
    if (!added) return interaction.reply({ content: '⚠️ You are already in or the room is full', ephemeral: true });

    const count = game.getPlayerCount();
    return interaction.reply(`✅ ${user} joined! (${count}/${config.maxPlayers})`);
  }

  if (sub === 'leave') {
    const game = getGame(channelId);
    if (!game) return interaction.reply({ content: '⚠️ No game', ephemeral: true });
    if (game.phase !== 'waiting') return interaction.reply({ content: '⚠️ Game started, cannot leave', ephemeral: true });

    game.removePlayer(user.id);
    const count = game.getPlayerCount();
    if (count === 0) {
      activeGames.delete(channelId);
      return interaction.reply('Room closed.');
    }
    return interaction.reply(`✅ Left. (${count} players remaining)`);
  }

  if (sub === 'start') {
    const game = getGame(channelId);
    if (!game) return interaction.reply({ content: '⚠️ No game', ephemeral: true });
    if (!game.players.has(user.id)) return interaction.reply({ content: '⚠️ You must be in the game', ephemeral: true });

    const undercoverOpt = interaction.options.getInteger('undercover');
    const mrWhiteOpt = interaction.options.getBoolean('mr_white');
    const result = game.start({
      undercoverCount: undercoverOpt ?? 1,
      mrWhite: mrWhiteOpt ?? false,
    });
    if (!result.success) return interaction.reply({ content: result.message, ephemeral: true });

    await interaction.deferReply();

    const guild = interaction.guild;
    if (guild) {
      for (const [userId] of game.players) {
        try {
          const member = await guild.members.fetch(userId);
          game.displayNames.set(userId, member.displayName || member.user.username);
        } catch {
          game.displayNames.set(userId, game.players.get(userId).username);
        }
      }
    }

    const orderList = game.getDescribeOrderWithNames();
    const orderText = orderList.map(({ num, name }) => `${num}. ${name}`).join('\n');
    const nextPlayer = game.getNextToDescribe();
    const nextName = nextPlayer ? (game.displayNames.get(nextPlayer.id) || nextPlayer.username) : '-';

    const embed = new EmbedBuilder()
      .setColor(0xFEE75C)
      .setTitle('🎭 Game started!')
      .setDescription(`ทุกคนจะได้คำทาง **DM**!\n\nพิมพ์คำอธิบาย **1 คำ** ในแชท (ตัวใหญ่ตัวเล็กไม่มีผล)`)
      .addFields(
        { name: 'Players', value: String(game.getPlayerCount()), inline: true },
        { name: 'Undercover', value: String(result.undercoverCount), inline: true },
        { name: 'Mr. White', value: result.hasMrWhite ? 'Yes' : 'No', inline: true },
        { name: 'ลำดับการพิมพ์', value: orderText, inline: false },
        { name: 'ถึงรอบ', value: `**${nextName}** ให้พิมพ์ใบ้`, inline: false }
      )
      .setFooter({ text: 'ใช้ /uc vote เมื่อทุกคนอธิบายแล้ว' });

    for (const [userId, player] of game.players) {
      try {
        const u = await client.users.fetch(userId);
        let msg = '';
        if (player.role === ROLES.MR_WHITE) {
          msg = 'You have no word — pretend you know it';
        } else if (player.role === ROLES.UNDERCOVER) {
          msg = `Your word: **${player.word}**`;
        } else {
          msg = `Your word: **${player.word}**`;
        }
        await u.send(msg);
      } catch (e) {
        console.error('DM failed:', userId, e.message);
      }
    }

    return interaction.editReply({ embeds: [embed] });
  }

  if (sub === 'word') {
    const game = getGame(channelId);
    if (!game) return interaction.reply({ content: '⚠️ No game', ephemeral: true });
    const player = game.players.get(user.id);
    if (!player) return interaction.reply({ content: '⚠️ You are not in the game', ephemeral: true });

    try {
      const u = await client.users.fetch(user.id);
      const msg = player.role === ROLES.MR_WHITE
        ? 'You have no word — pretend you know it'
        : `Your word: **${player.word}**`;
      await u.send(msg);
      return interaction.reply({ content: '✅ Sent your word via DM', ephemeral: true });
    } catch (e) {
      return interaction.reply({ content: '⚠️ Cannot DM you. Enable DMs from server members', ephemeral: true });
    }
  }

  if (sub === 'vote') {
    const game = getGame(channelId);
    if (!game) return interaction.reply({ content: '⚠️ No game', ephemeral: true });
    if (!game.players.has(user.id)) return interaction.reply({ content: '⚠️ You must be in the game', ephemeral: true });
    if (game.phase !== 'describing') return interaction.reply({ content: '⚠️ Not voting phase yet', ephemeral: true });

    game.startVoting();
    const alive = game.getAlivePlayers();
    const options = alive.slice(0, 25).map(p => ({
      label: p.username,
      value: p.id,
      description: `Vote for ${p.username}`,
    }));

    const row = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('undercover_vote')
        .setPlaceholder('Select who you think is the Undercover')
        .addOptions(options)
    );

    const embed = new EmbedBuilder()
      .setColor(0xED4245)
      .setTitle('🗳️ Voting time!')
      .setDescription('Select who you think is the Undercover');

    return interaction.reply({ embeds: [embed], components: [row] });
  }

  if (sub === 'end') {
    const game = getGame(channelId);
    if (!game) return interaction.reply({ content: '⚠️ No game', ephemeral: true });
    if (game.hostId !== user.id) return interaction.reply({ content: '⚠️ Host only', ephemeral: true });

    activeGames.delete(channelId);
    return interaction.reply('✅ Game ended.');
  }
}

client.once('ready', async () => {
  console.log(`✅ Bot ready: ${client.user.tag}`);

  const rest = new REST({ version: '10' }).setToken(config.token);
  try {
    await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
    console.log('✅ Slash commands registered');
  } catch (err) {
    console.error('Command registration failed:', err);
  }

  client.user.setActivity('/uc help - Undercover game', { type: 3 });
});

client.on('interactionCreate', async (interaction) => {
  if (interaction.isChatInputCommand() && interaction.commandName === 'uc') {
    return runCommand(interaction);
  }

  if (interaction.isStringSelectMenu() && interaction.customId === 'undercover_vote') {
    const game = getGame(interaction.channel.id);
    if (!game || game.phase !== 'voting') {
      return interaction.reply({ content: '⚠️ Cannot vote now', ephemeral: true });
    }

    const targetId = interaction.values[0];
    const ok = game.vote(interaction.user.id, targetId);
    if (!ok) {
      return interaction.reply({ content: '⚠️ Cannot vote', ephemeral: true });
    }

    await interaction.reply({ content: '✅ Vote recorded', ephemeral: true });

    if (!game.allVoted()) return;

    const counts = game.getVoteCounts();
    let maxVotes = 0;
    let eliminatedId = null;
    for (const [id, count] of counts) {
      if (count > maxVotes) {
        maxVotes = count;
        eliminatedId = id;
      }
    }

    const eliminated = game.players.get(eliminatedId);
    game.eliminatePlayer(eliminatedId);

    const embed = new EmbedBuilder()
      .setColor(0xED4245)
      .setTitle('🗳️ Vote result')
      .setDescription(`${eliminated.username} was eliminated (${maxVotes} votes)`);

    let roleText = '';
    if (eliminated.role === ROLES.UNDERCOVER) roleText = '🔴 **Undercover**';
    else if (eliminated.role === ROLES.MR_WHITE) roleText = '🃏 **Mr. White**';
    else roleText = '🟢 **Civilian**';
    embed.addFields({ name: 'Role', value: roleText, inline: false });

    const check = game.checkGameEnd();

    if (check.civiliansWin) {
      embed.addFields({ name: '🏆 Result', value: '**Civilians win!**', inline: false });
      embed.addFields({ name: '🔁 Next game', value: 'Use `/uc start` to play again', inline: false });
      game.resetToWaiting();
    } else if (check.undercoverWin) {
      embed.addFields({ name: '🏆 Result', value: '**Undercover wins!**', inline: false });
      embed.addFields(
        { name: 'Civilian word', value: game.wordPair[0], inline: true },
        { name: 'Undercover word', value: game.wordPair[1], inline: true }
      );
      embed.addFields({ name: '🔁 Next game', value: 'Use `/uc start` to play again', inline: false });
      game.resetToWaiting();
    } else {
      game.resetRound();
      const orderList = game.getDescribeOrderWithNames();
      const orderText = orderList.map(({ num, name }) => `${num}. ${name}`).join('\n');
      const nextPlayer = game.getNextToDescribe();
      const nextName = nextPlayer ? (game.displayNames.get(nextPlayer.id) || nextPlayer.username) : '-';
      embed.addFields(
        { name: 'ลำดับการพิมพ์ (รอบถัดไป)', value: orderText, inline: false },
        { name: 'ถึงรอบ', value: `**${nextName}** ให้พิมพ์ใบ้`, inline: false }
      );
      embed.setFooter({ text: 'Next round — give your one-word hint' });
    }

    await interaction.channel.send({ embeds: [embed] });
  }
});

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  const game = getGame(message.channel.id);
  if (!game || game.phase !== 'describing') return;

  const player = game.players.get(message.author.id);
  if (!player || player.eliminated) return;

  if (message.content.startsWith('/')) return;

  const desc = message.content.trim().slice(0, 50);
  if (!desc) return;

  const ok = game.submitDescription(message.author.id, desc);
  if (!ok) return;

  const count = game.descriptions.size;
  const total = game.getAlivePlayers().length;

  if (count >= total) {
    await message.reply(`✅ ทุกคนอธิบายแล้ว! ใช้ \`/uc vote\` เพื่อโหวต`);
  } else {
    const nextPlayer = game.getNextToDescribe();
    let nextName = nextPlayer ? (game.displayNames.get(nextPlayer.id) || nextPlayer.username) : '-';
    if (nextPlayer && message.guild && !game.displayNames.has(nextPlayer.id)) {
      try {
        const member = await message.guild.members.fetch(nextPlayer.id);
        nextName = member.displayName || nextPlayer.username;
        game.displayNames.set(nextPlayer.id, nextName);
      } catch {
        nextName = nextPlayer.username;
      }
    }
    await message.reply(`📝 บันทึกแล้ว (${count}/${total})\n\nถึงรอบ **${nextName}** ให้พิมพ์ใบ้`);
  }
});

client.login(config.token).catch(err => {
  console.error('Login failed:', err.message);
  console.log('Check DISCORD_TOKEN in .env');
});
