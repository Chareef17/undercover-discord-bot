const words = require('../words');

const ROLES = {
  CIVILIAN: 'civilian',   // ได้คำปกติ
  UNDERCOVER: 'undercover', // ได้คำอื่น
  MR_WHITE: 'mr_white',   // ไม่ได้คำเลย (ถ้ามี 5+ คน)
};

class UndercoverGame {
  constructor(hostId, channelId, config = {}) {
    this.hostId = hostId;
    this.channelId = channelId;
    this.players = new Map(); // userId -> { id, username, role, word, vote }
    this.phase = 'waiting'; // waiting, describing, voting, ended
    this.currentRound = 0;
    this.wordPair = null;
    this.minPlayers = config.minPlayers || 3;
    this.maxPlayers = config.maxPlayers || 10;
    this.votes = new Map();
    this.descriptions = new Map();
  }

  addPlayer(userId, username) {
    if (this.players.size >= this.maxPlayers) return false;
    if (this.players.has(userId)) return false;
    this.players.set(userId, {
      id: userId,
      username,
      role: null,
      word: null,
      voted: false,
      eliminated: false,
    });
    return true;
  }

  removePlayer(userId) {
    return this.players.delete(userId);
  }

  getPlayerCount() {
    return this.players.size;
  }

  getAlivePlayers() {
    return [...this.players.values()].filter(p => !p.eliminated);
  }

  canStart() {
    return this.players.size >= this.minPlayers && this.phase === 'waiting';
  }

  start() {
    if (!this.canStart()) return { success: false, message: 'ผู้เล่นไม่เพียงพอ (ต้องมีอย่างน้อย ' + this.minPlayers + ' คน)' };

    const playerList = [...this.players.values()];
    const pair = words[Math.floor(Math.random() * words.length)];
    const [civilianWord, undercoverWord] = pair;

    // เลือก Undercover 1 คน
    const undercoverIndex = Math.floor(Math.random() * playerList.length);
    
    // ถ้ามี 5+ คน มีโอกาสได้ Mr. White
    let mrWhiteIndex = -1;
    if (playerList.length >= 5 && Math.random() < 0.3) {
      do {
        mrWhiteIndex = Math.floor(Math.random() * playerList.length);
      } while (mrWhiteIndex === undercoverIndex);
    }

    playerList.forEach((player, i) => {
      if (i === undercoverIndex) {
        player.role = ROLES.UNDERCOVER;
        player.word = undercoverWord;
      } else if (i === mrWhiteIndex) {
        player.role = ROLES.MR_WHITE;
        player.word = null;
      } else {
        player.role = ROLES.CIVILIAN;
        player.word = civilianWord;
      }
    });

    this.wordPair = pair;
    this.phase = 'describing';
    this.currentRound = 1;
    this.descriptions.clear();
    this.votes.clear();

    return {
      success: true,
      civilianWord,
      undercoverWord,
      hasMrWhite: mrWhiteIndex >= 0,
    };
  }

  submitDescription(userId, description) {
    if (this.phase !== 'describing') return false;
    const player = this.players.get(userId);
    if (!player || player.eliminated) return false;
    if (this.descriptions.has(userId)) return false;

    this.descriptions.set(userId, description);
    return true;
  }

  allDescribed() {
    const alive = this.getAlivePlayers();
    return alive.every(p => this.descriptions.has(p.id));
  }

  startVoting() {
    this.phase = 'voting';
    this.votes.clear();
    [...this.players.values()].forEach(p => {
      p.voted = false;
    });
  }

  vote(voterId, targetId) {
    if (this.phase !== 'voting') return false;
    const voter = this.players.get(voterId);
    const target = this.players.get(targetId);
    if (!voter || !target || voter.eliminated || target.eliminated) return false;
    if (voter.voted) return false;
    if (voterId === targetId) return false;

    this.votes.set(voterId, targetId);
    voter.voted = true;
    return true;
  }

  getVoteCounts() {
    const counts = new Map();
    for (const targetId of this.votes.values()) {
      counts.set(targetId, (counts.get(targetId) || 0) + 1);
    }
    return counts;
  }

  allVoted() {
    const alive = this.getAlivePlayers();
    return alive.every(p => p.voted);
  }

  eliminatePlayer(userId) {
    const player = this.players.get(userId);
    if (player) player.eliminated = true;
  }

  checkGameEnd() {
    const alive = this.getAlivePlayers();
    const undercoverAlive = alive.filter(p => p.role === ROLES.UNDERCOVER);
    const mrWhiteAlive = alive.filter(p => p.role === ROLES.MR_WHITE);

    // Undercover หรือ Mr. White ถูก vote ออก = Civilian ชนะ
    // เหลือ Undercover/Mr.White มากกว่าหรือเท่า Civilian = Undercover ชนะ
    const civiliansAlive = alive.filter(p => p.role === ROLES.CIVILIAN);

    return {
      civiliansWin: undercoverAlive.length === 0 && mrWhiteAlive.length === 0,
      undercoverWin: undercoverAlive.length + mrWhiteAlive.length >= civiliansAlive.length,
      eliminated: null, // จะเซ็ตหลังจาก vote
    };
  }

  getPlayerInfo(userId) {
    const p = this.players.get(userId);
    if (!p) return null;
    return {
      ...p,
      word: p.word,
      role: p.role,
    };
  }

  resetRound() {
    this.descriptions.clear();
    this.votes.clear();
    this.currentRound++;
    this.phase = 'describing';
    [...this.players.values()].forEach(p => { p.voted = false; });
  }

  endGame() {
    this.phase = 'ended';
  }
}

module.exports = { UndercoverGame, ROLES };
