const express = require('express');
const cors =require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const DB_PATH = path.join(__dirname, 'database.json');

const GAME_CONFIG = {
    characters: [
        { id: 1, name: 'Новичок', cost: 0, baseIncome: 0.05, description: 'Выдается при старте.' },
        { id: 2, name: 'Старатель', cost: 50, baseIncome: 0.6, description: 'Надежный работник.' },
        { id: 3, name: 'Техно-Мастер', cost: 150, baseIncome: 1.8, description: 'Продвинутый добытчик.' }
    ],
    upgradeCosts: {
        2: [0, 10, 15, 20, 30, 40],
        3: [0, 40, 60, 80, 100, 120]
    },
    levelBonusMultiplier: 0.20 
};

app.use(cors());
app.use(express.json());

function readDatabase() {
    if (!fs.existsSync(DB_PATH)) {
        fs.writeFileSync(DB_PATH, JSON.stringify({}));
    }
    const data = fs.readFileSync(DB_PATH);
    return JSON.parse(data);
}

function writeDatabase(data) {
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

function getCharacterIncome(character, level) {
    const levelBonus = (level - 1) * GAME_CONFIG.levelBonusMultiplier;
    return character.baseIncome * (1 + levelBonus);
}

function createNewPlayer(userId) {
    return {
        userId: userId,
        balance: 0,
        lastLogin: Date.now(),
        characters: [{ id: 1, level: 1 }]
    };
}

function updatePlayerIncome(playerData) {
    const now = Date.now();
    const timeElapsedMs = now - (playerData.lastLogin || now);
    const timeElapsedSeconds = timeElapsedMs / 1000;

    const totalIncomePerDay = playerData.characters.reduce((total, ownedChar) => {
        const charConfig = GAME_CONFIG.characters.find(c => c.id === ownedChar.id);
        return total + (charConfig ? getCharacterIncome(charConfig, ownedChar.level) : 0);
    }, 0);

    const incomePerSecond = totalIncomePerDay / (24 * 60 * 60);
    playerData.balance += timeElapsedSeconds * incomePerSecond;
    playerData.lastLogin = now;
}

app.get('/api/game-state/:userId', (req, res) => {
    const { userId } = req.params;
    const db = readDatabase();
    if (!db[userId]) {
        db[userId] = createNewPlayer(userId);
    }
    updatePlayerIncome(db[userId]);
    writeDatabase(db);
    res.json({ success: true, data: db[userId], config: GAME_CONFIG });
});

app.post('/api/buy-character', (req, res) => {
    const { userId, characterId } = req.body;
    const db = readDatabase();
    const playerData = db[userId];
    if (!playerData) return res.status(404).json({ success: false, message: "Игрок не найден." });
    const charToBuy = GAME_CONFIG.characters.find(c => c.id === characterId);
    if (!charToBuy) return res.status(400).json({ success: false, message: "Персонаж не найден." });
    if (playerData.characters.some(c => c.id === characterId)) return res.status(400).json({ success: false, message: "Этот персонаж уже куплен." });
    
    updatePlayerIncome(playerData);
    if (playerData.balance < charToBuy.cost) {
        writeDatabase(db);
        return res.status(400).json({ success: false, message: "Недостаточно средств." });
    }
    playerData.balance -= charToBuy.cost;
    playerData.characters.push({ id: characterId, level: 1 });
    writeDatabase(db);
    res.json({ success: true, message: `Персонаж "${charToBuy.name}" куплен!`, data: playerData });
});

app.post('/api/upgrade-character', (req, res) => {
    const { userId, characterId } = req.body;
    const db = readDatabase();
    const playerData = db[userId];
    if (!playerData) return res.status(404).json({ success: false, message: "Игрок не найден." });
    const charToUpgrade = playerData.characters.find(c => c.id === characterId);
    if (!charToUpgrade) return res.status(400).json({ success: false, message: "У вас нет этого персонажа." });
    if (charToUpgrade.level >= 6) return res.status(400).json({ success: false, message: "Достигнут максимальный уровень." });
    const upgradeCost = GAME_CONFIG.upgradeCosts[characterId]?.[charToUpgrade.level];
    if (upgradeCost === undefined) return res.status(400).json({ success: false, message: "Для этого персонажа нет улучшений." });
    
    updatePlayerIncome(playerData);
    if (playerData.balance < upgradeCost) {
        writeDatabase(db);
        return res.status(400).json({ success: false, message: "Недостаточно средств для улучшения." });
    }
    playerData.balance -= upgradeCost;
    charToUpgrade.level++;
    writeDatabase(db);
    res.json({ success: true, message: `Персонаж улучшен до уровня ${charToUpgrade.level}!`, data: playerData });
});

app.listen(PORT, () => console.log(`Сервер игры TON Miner запущен на порту ${PORT}`));
