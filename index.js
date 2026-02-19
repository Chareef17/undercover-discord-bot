const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');
const config = require('./config');
const { UndercoverGame, ROLES } = require('./game/UndercoverGame');

// เก็บเกมที่กำลังเล่นอยู่ (channelId -> game)
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

client.once('ready', () => {
  console.log(`✅ Bot พร้อมใช้งานในชื่อ: ${client.user.tag}`);
  client.user.setActivity('!u - เกม Undercover', { type: 3 });
});

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  if (!message.content.startsWith(config.prefix)) return;

  const args = message.content.slice(config.prefix.length).trim().split(/\s+/);
  const command = args[0]?.toLowerCase();
  if (!command || !config.commandAliases.includes(command)) return;

  const sub = (args[1] || '').toLowerCase();
  const channelId = message.channel.id;

  // ตัวย่อคำสั่ง: c=create, j=join, l=leave, s=start, n=next, e=end, w=word
  const cmdMap = { c: 'create', j: 'join', l: 'leave', s: 'start', n: 'next', e: 'end', w: 'word' };
  const subCommand = cmdMap[sub] || sub;

  // help (หรือไม่ใส่คำสั่ง)
  if (!subCommand || subCommand === 'help') {
    const embed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle('🎭 เกม Undercover - วิธีเล่น')
      .setDescription(`
**กติกา:**
- ผู้เล่นส่วนใหญ่จะได้ **คำเดียวกัน** (Civilian)
- 1 คนจะได้ **คำที่ใกล้เคียง** (Undercover)
- ถ้ามี 5+ คน อาจมี **Mr. White** ที่ไม่ได้คำเลย

**คำสั่ง:** (ใช้ \`!u\` หรือ \`!uc\`)
\`\`\`
!u c / !u create   - สร้างห้อง (Host)
!u j / !u join     - เข้าร่วม
!u l / !u leave    - ออก
!u s / !u start    - เริ่มเกม (Host)
!u w / !u word     - ดูคำของตัวเอง
!u n / !u next     - ไปโหวต (Host)
!u e / !u end      - จบเกม (Host)
\`\`\`

**ขั้นตอนการเล่น:**
1. แต่ละรอบ ทุกคนบอก **คำอธิบาย 1 คำ** เกี่ยวกับคำของตัวเอง
2. หลังจากนั้น โหวตกันว่าคิดว่าใครเป็น Undercover
3. คนที่ได้โหวตมากที่สุดจะถูก淘汰
4. Civilian ชนะเมื่อหา Undercover ได้หมด
5. Undercover ชนะเมื่อเหลือคนน้อยกว่าเท่ากับจำนวน Undercover
      `)
      .setFooter({ text: `ต้องมีผู้เล่นอย่างน้อย ${config.minPlayers} คน` });
    return message.reply({ embeds: [embed] });
  }

  if (subCommand === 'create') {
    if (activeGames.has(channelId)) {
      return message.reply('⚠️ มีเกมกำลังเล่นอยู่ในแชเนลนี้แล้ว');
    }
    const game = new UndercoverGame(message.author.id, channelId, config);
    game.addPlayer(message.author.id, message.author.username);
    activeGames.set(channelId, game);

    const embed = new EmbedBuilder()
      .setColor(0x57F287)
      .setTitle('🎮 ห้องเกม Undercover ถูกสร้างแล้ว!')
      .setDescription(`${message.author} เป็น Host\n\nพิมพ์ \`!u j\` เพื่อเข้าร่วม`)
      .addFields({ name: 'ผู้เล่น (1/', value: `${config.maxPlayers})`, inline: true })
      .addFields({ name: 'เริ่มเกม', value: '`!u s` (Host)', inline: true })
      .setFooter({ text: `ต้องมีอย่างน้อย ${config.minPlayers} คนถึงจะเริ่มได้` });
    return message.reply({ embeds: [embed] });
  }

  // !uc join
  if (subCommand === 'join') {
    const game = getGame(channelId);
    if (!game) return message.reply('⚠️ ไม่มีเกมในแชเนลนี้ พิมพ์ `!u c` เพื่อสร้าง');
    if (game.phase !== 'waiting') return message.reply('⚠️ เกมเริ่มแล้ว');

    const added = game.addPlayer(message.author.id, message.author.username);
    if (!added) return message.reply('⚠️ คุณอยู่ในห้องแล้ว หรือห้องเต็ม');

    const count = game.getPlayerCount();
    return message.reply(`✅ ${message.author} เข้าร่วมแล้ว! (${count}/${config.maxPlayers})`);
  }

  // !uc leave
  if (subCommand === 'leave') {
    const game = getGame(channelId);
    if (!game) return message.reply('⚠️ ไม่มีเกม');
    if (game.phase !== 'waiting') return message.reply('⚠️ เกมเริ่มแล้ว ไม่สามารถออกได้');

    game.removePlayer(message.author.id);
    const count = game.getPlayerCount();
    if (count === 0) {
      activeGames.delete(channelId);
      return message.reply('ห้องถูกปิดแล้ว (ไม่มีผู้เล่น)');
    }
    return message.reply(`✅ ออกจากห้องแล้ว (เหลือ ${count} คน)`);
  }

  // !uc start
  if (subCommand === 'start') {
    const game = getGame(channelId);
    if (!game) return message.reply('⚠️ ไม่มีเกม');
    if (game.hostId !== message.author.id) return message.reply('⚠️ เฉพาะ Host เท่านั้นที่เริ่มได้');

    const result = game.start();
    if (!result.success) return message.reply(result.message);

    const embed = new EmbedBuilder()
      .setColor(0xFEE75C)
      .setTitle('🎭 เกมเริ่มแล้ว!')
      .setDescription(`ทุกคนจะได้รับคำของตัวเองใน **DM** จากบอท!\n\nถ้าไม่ได้รับ DM ให้ตรวจสอบว่าเปิดรับ DM จากสมาชิกเซิร์ฟเวอร์\n\nเมื่อพร้อมแล้ว ให้บอก **คำอธิบาย 1 คำ** เกี่ยวกับคำของคุณ (พิมพ์ในแชทนี้)`)
      .addFields(
        { name: 'จำนวนผู้เล่น', value: String(game.getPlayerCount()), inline: true },
        { name: 'Mr. White', value: result.hasMrWhite ? 'มี' : 'ไม่มี', inline: true }
      )
      .setFooter({ text: `Host พิมพ์ !u n เมื่อทุกคนอธิบายครบ` });

    // ส่งคำให้แต่ละคนทาง DM
    for (const [userId, player] of game.players) {
      try {
        const user = await client.users.fetch(userId);
        let wordMsg = '';
        if (player.role === ROLES.MR_WHITE) {
          wordMsg = '🃏 คุณคือ **Mr. White**!\nคุณไม่ได้คำ — ให้ลองทำให้คนอื่นคิดว่าคุณรู้คำ';
        } else if (player.role === ROLES.UNDERCOVER) {
          wordMsg = `🔴 คำของคุณ: **${player.word}**\n(คุณคือ Undercover — คำของคนอื่นต่างจากคุณ!)`;
        } else {
          wordMsg = `🟢 คำของคุณ: **${player.word}**`;
        }
        await user.send(wordMsg);
      } catch (e) {
        console.error('ส่ง DM ไม่ได้:', userId, e.message);
      }
    }

    await message.reply({ embeds: [embed] });
  }

  // !uc word - ดูคำซ้ำ (DM)
  if (subCommand === 'word') {
    const game = getGame(channelId);
    if (!game) return message.reply('⚠️ ไม่มีเกม');
    const player = game.players.get(message.author.id);
    if (!player) return message.reply('⚠️ คุณไม่ได้อยู่ในเกม');

    try {
      const user = await client.users.fetch(message.author.id);
      let wordMsg = '';
      if (player.role === ROLES.MR_WHITE) {
        wordMsg = '🃏 คุณคือ **Mr. White** - คุณไม่มีคำ';
      } else {
        wordMsg = `คำของคุณ: **${player.word}**`;
      }
      await user.send(wordMsg);
      return message.reply('✅ ส่งคำให้คุณทาง DM แล้ว');
    } catch (e) {
      return message.reply('⚠️ ส่ง DM ไม่ได้ ให้เปิดรับ DM จากสมาชิกเซิร์ฟเวอร์');
    }
  }

  // !uc next - Host ข้ามไปโหวต
  if (subCommand === 'next') {
    const game = getGame(channelId);
    if (!game) return message.reply('⚠️ ไม่มีเกม');
    if (game.hostId !== message.author.id) return message.reply('⚠️ เฉพาะ Host เท่านั้น');
    if (game.phase !== 'describing') return message.reply('⚠️ ยังไม่ถึงขั้นโหวต');

    game.startVoting();

    const alive = game.getAlivePlayers();
    const options = alive.map((p, i) => ({
      label: p.username,
      value: p.id,
      description: `โหวตให้ ${p.username}`,
    }));

    const row = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('undercover_vote')
        .setPlaceholder('เลือกคนที่คิดว่าเป็น Undercover')
        .addOptions(options.slice(0, 25))
    );

    const embed = new EmbedBuilder()
      .setColor(0xED4245)
      .setTitle('🗳️ ช่วงโหวต!')
      .setDescription('ใช้เมนูด้านล่างโหวตคนที่คิดว่าเป็น Undercover');

    return message.reply({ embeds: [embed], components: [row] });
  }

  // !uc end
  if (subCommand === 'end') {
    const game = getGame(channelId);
    if (!game) return message.reply('⚠️ ไม่มีเกม');
    if (game.hostId !== message.author.id) return message.reply('⚠️ เฉพาะ Host เท่านั้น');

    activeGames.delete(channelId);
    return message.reply('✅ เกมถูกจบแล้ว');
  }
});

// รับคำอธิบายในแชท (เมื่อ phase = describing)
client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  const game = getGame(message.channel.id);
  if (!game || game.phase !== 'describing') return;

  const player = game.players.get(message.author.id);
  if (!player || player.eliminated) return;

  // ถ้าเป็นคำสั่ง ข้าม
  if (message.content.startsWith(config.prefix)) return;

  const desc = message.content.trim().slice(0, 50);
  if (!desc) return;

  const ok = game.submitDescription(message.author.id, desc);
  if (!ok) return;

  const count = game.descriptions.size;
  const total = game.getAlivePlayers().length;

  if (count >= total) {
    await message.reply(`✅ ทุกคนอธิบายครบแล้ว! Host พิมพ์ \`!u n\` เพื่อโหวต`);
  } else {
    await message.reply(`📝 บันทึกคำอธิบายของคุณแล้ว (${count}/${total})`);
  }
});

// Interaction - โหวต
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isStringSelectMenu()) return;
  if (interaction.customId !== 'undercover_vote') return;

  const game = getGame(interaction.channel.id);
  if (!game || game.phase !== 'voting') {
    return interaction.reply({ content: '⚠️ ไม่สามารถโหวตได้ในขณะนี้', ephemeral: true });
  }

  const targetId = interaction.values[0];
  const ok = game.vote(interaction.user.id, targetId);
  if (!ok) {
    return interaction.reply({ content: '⚠️ โหวตไม่ได้ (อาจโหวตแล้ว หรือโหวตตัวเอง)', ephemeral: true });
  }

  await interaction.reply({ content: '✅ โหวตเรียบร้อย', ephemeral: true });

  // ตรวจว่าทุกคนโหวตครบหรือยัง
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
    .setTitle('🗳️ ผลโหวต')
    .setDescription(`${eliminated.username} ถูก淘汰 (ได้ ${maxVotes} โหวต)`);

  // เปิดเผยบทบาท
  let roleText = '';
  if (eliminated.role === ROLES.UNDERCOVER) roleText = '🔴 **Undercover**';
  else if (eliminated.role === ROLES.MR_WHITE) roleText = '🃏 **Mr. White**';
  else roleText = '🟢 **Civilian**';
  embed.addFields({ name: 'บทบาท', value: roleText, inline: false });

  const check = game.checkGameEnd();

  if (check.civiliansWin) {
    embed.addFields({ name: '🏆 ผลเกม', value: '**Civilian ชนะ!**', inline: false });
    game.endGame();
    activeGames.delete(interaction.channel.id);
  } else if (check.undercoverWin) {
    embed.addFields({ name: '🏆 ผลเกม', value: '**Undercover ชนะ!**', inline: false });
    embed.addFields(
      { name: 'คำ Civilian', value: game.wordPair[0], inline: true },
      { name: 'คำ Undercover', value: game.wordPair[1], inline: true }
    );
    game.endGame();
    activeGames.delete(interaction.channel.id);
  } else {
    embed.setFooter({ text: 'รอบถัดไป — ทุกคนบอกคำอธิบาย 1 คำ' });
    game.resetRound();
  }

  await interaction.channel.send({ embeds: [embed] });
});

client.login(config.token).catch(err => {
  console.error('Login failed:', err.message);
  console.log('ตรวจสอบว่าใส่ DISCORD_TOKEN ในไฟล์ .env ถูกต้อง');
});
