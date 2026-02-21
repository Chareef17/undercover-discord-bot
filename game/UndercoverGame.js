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

  start(options = {}) {
    if (!this.canStart()) return { success: false, message: 'Not enough players (need at least ' + this.minPlayers + ')' };

    const playerList = [...this.players.values()];
    const n = playerList.length;

    let undercoverCount, wantMrWhite;

    // Civil ต้องมากกว่า Undercover+Mr.White เสมอ
    if (n === 4) {
      undercoverCount = 1;
      wantMrWhite = false;
    } else if (n === 5) {
      // 5 คน: Civil 4 Under 1 | Civil 3 Under 2 | Civil 3 Under 1 White 1
      const optUnder = options.undercoverCount ?? 1;
      const optMrWhite = options.mrWhite ?? false;
      const ok =
        (optUnder === 1 && !optMrWhite) ||
        (optUnder === 2 && !optMrWhite) ||
        (optUnder === 1 && optMrWhite);
      if (!ok) {
        return {
          success: false,
          message: '5 คน: เลือกได้ 3 แบบ — Under 1 | Under 2 | Under 1 + Mr. White',
        };
      }
      undercoverCount = optUnder;
      wantMrWhite = optMrWhite;
    } else {
      const optUnder = options.undercoverCount ?? 1;
      const optMrWhite = options.mrWhite ?? false;
      const nonCivilianCount = optUnder + (optMrWhite ? 1 : 0);
      if (optMrWhite && n < 5) {
        return { success: false, message: 'Mr. White ใช้ได้เมื่อ 5 คนขึ้นไป' };
      }
      if (optUnder > 3) {
        return { success: false, message: 'Undercover สูงสุด 3 คน' };
      }
      const maxNonCivilian = Math.floor((n - 1) / 2); // civil > nonCivilian
      if (nonCivilianCount > maxNonCivilian) {
        const maxU = Math.min(3, Math.max(1, maxNonCivilian - (optMrWhite ? 1 : 0)));
        return {
          success: false,
          message: `Civil ต้องมากกว่าฝั่งอื่น — Undercover สูงสุด ${maxU} คน${optMrWhite ? ' (กับ Mr. White)' : ''}`,
        };
      }
      undercoverCount = optUnder;
      wantMrWhite = optMrWhite;
    }

    const pair = words[Math.floor(Math.random() * words.length)];
    const [civilianWord, undercoverWord] = pair;

    const indices = playerList.map((_, i) => i);
    const shuffle = (arr) => {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      return arr;
    };
    const shuffled = shuffle([...indices]);

    const undercoverIndices = new Set(shuffled.slice(0, undercoverCount));
    let mrWhiteIndex = -1;
    if (wantMrWhite) {
      const remain = shuffled.slice(undercoverCount);
      mrWhiteIndex = remain[0];
    }

    playerList.forEach((player, i) => {
      if (undercoverIndices.has(i)) {
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

    // ลำดับการพิมพ์ — Mr. White ห้ามเป็นคนแรก
    const alive = this.getAlivePlayers();
    const mrWhitePlayers = alive.filter(p => p.role === ROLES.MR_WHITE);
    const nonMrWhite = alive.filter(p => p.role !== ROLES.MR_WHITE);
    const shuffle = (arr) => {
      const a = [...arr];
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    };
    const firstPlayer = nonMrWhite[Math.floor(Math.random() * nonMrWhite.length)];
    const rest = shuffle(alive.filter(p => p.id !== firstPlayer.id));
    this.describeOrder = [firstPlayer, ...rest];
    this.displayNames = new Map();

    return {
      success: true,
      civilianWord,
      undercoverWord,
      hasMrWhite: mrWhiteIndex >= 0,
      undercoverCount,
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

  getNextToDescribe() {
    if (!this.describeOrder) return null;
    return this.describeOrder.find(p => !this.descriptions.has(p.id)) || null;
  }

  getDescribeOrderWithNames() {
    if (!this.describeOrder) return [];
    return this.describeOrder.map((p, i) => ({
      num: i + 1,
      name: this.displayNames.get(p.id) || p.username,
    }));
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
    const civiliansAlive = alive.filter(p => p.role === ROLES.CIVILIAN);
    // Mr. White เป็นฝ่ายแยก — ชนะเมื่อถูกโหวตออกและทายคำถูก

    return {
      civiliansWin: undercoverAlive.length === 0,
      undercoverWin: undercoverAlive.length > civiliansAlive.length,
      eliminated: null,
    };
  }

  checkMrWhiteGuess(guess) {
    if (!this.wordPair) return false;
    const civilianWord = this.wordPair[0];
    return guess.trim().toLowerCase() === civilianWord.toLowerCase();
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
    const alive = this.getAlivePlayers();
    const mrWhitePlayers = alive.filter(p => p.role === ROLES.MR_WHITE);
    const nonMrWhite = alive.filter(p => p.role !== ROLES.MR_WHITE);
    const shuffle = (arr) => {
      const a = [...arr];
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    };
    const firstPlayer = nonMrWhite[Math.floor(Math.random() * nonMrWhite.length)];
    const rest = shuffle(alive.filter(p => p.id !== firstPlayer.id));
    this.describeOrder = [firstPlayer, ...rest];
  }

  endGame() {
    this.phase = 'ended';
  }

  resetToWaiting() {
    this.phase = 'waiting';
    this.wordPair = null;
    this.descriptions.clear();
    this.votes.clear();
    this.currentRound = 0;
    this.describeOrder = null;
    this.displayNames = new Map();
    delete this.pendingMrWhiteGuess;
    [...this.players.values()].forEach(p => {
      p.role = null;
      p.word = null;
      p.eliminated = false;
      p.voted = false;
    });
  }
}

module.exports = { UndercoverGame, ROLES };
