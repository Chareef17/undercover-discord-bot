const { SlashCommandBuilder } = require('discord.js');

module.exports = [
  new SlashCommandBuilder()
    .setName('uc')
    .setDescription('Undercover game - find the impostor')
    .addSubcommand(sc =>
      sc.setName('create').setDescription('Create a game room (you become Host)')
    )
    .addSubcommand(sc =>
      sc.setName('join').setDescription('Join a game')
    )
    .addSubcommand(sc =>
      sc.setName('leave').setDescription('Leave the room (before game starts)')
    )
    .addSubcommand(sc =>
      sc
        .setName('start')
        .setDescription('Start the game (Host only)')
        .addIntegerOption(opt =>
          opt
            .setName('undercover')
            .setDescription('Number of Undercover (1-3, default: 1)')
            .setMinValue(1)
            .setMaxValue(3)
        )
        .addBooleanOption(opt =>
          opt
            .setName('mr_white')
            .setDescription('Include Mr. White? (needs 5+ players)')
        )
    )
    .addSubcommand(sc =>
      sc.setName('word').setDescription('View your word again (sent via DM)')
    )
    .addSubcommand(sc =>
      sc.setName('vote').setDescription('Start the voting phase (Host only)')
    )
    .addSubcommand(sc =>
      sc.setName('end').setDescription('End the game (Host only)')
    )
    .addSubcommand(sc =>
      sc.setName('help').setDescription('Show how to play and all commands')
    ),
].map(cmd => cmd.toJSON());
