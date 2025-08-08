<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">
    <title>TON Miner Game</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <script src="https://telegram.org/js/telegram-web-app.js"></script>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
    <style>
        body { font-family: 'Inter', sans-serif; background-color: #121212; color: #E0E0E0; overscroll-behavior-y: none; }
        .glass-card { background: rgba(44, 44, 44, 0.6); backdrop-filter: blur(10px); border: 1px solid rgba(255, 255, 255, 0.1); }
        .btn-primary { background: linear-gradient(90deg, #0077FF, #00C2FF); transition: all 0.3s ease; }
        .btn-primary:hover:not(:disabled) { transform: translateY(-2px); box-shadow: 0 4px 15px rgba(0, 150, 255, 0.3); }
        .btn-secondary { background-color: #374151; transition: background-color 0.3s ease; }
        .btn-secondary:hover:not(:disabled) { background-color: #4B5563; }
        .btn:disabled { opacity: 0.5; cursor: not-allowed; }
    </style>
</head>
<body class="min-h-screen flex flex-col items-center p-4">
    <div id="app-container" class="w-full max-w-md mx-auto hidden">
        <header class="w-full glass-card rounded-xl p-4 mb-6 text-center">
            <h1 class="text-xl font-bold text-white">TON Miner</h1>
            <p class="text-sm text-gray-400">Ваш баланс:</p>
            <div class="text-3xl font-bold text-cyan-400 mt-1"><span id="balance-amount">0.0000</span> TON</div>
            <p class="text-xs text-gray-500 mt-2">Доход в сутки: <span id="daily-income">0.00</span> TON</p>
        </header>
        <main id="characters-container" class="space-y-4"></main>
        <footer class="mt-6">
             <button id="withdraw-btn" class="w-full btn-secondary text-white font-bold py-3 px-4 rounded-lg" disabled>Вывести средства (в разработке)</button>
        </footer>
    </div>
    <div id="loader" class="w-16 h-16 border-4 border-gray-600 border-t-cyan-400 rounded-full animate-spin absolute top-1/2 left-1/2 -mt-8 -ml-8"></div>
    <div id="message-modal" class="hidden fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 p-4">
        <div class="glass-card rounded-lg p-6 text-center max-w-sm w-full">
            <p id="modal-text" class="mb-4"></p>
            <button id="modal-close-btn" class="btn-primary text-white font-bold py-2 px-6 rounded-lg w-full">Понятно</button>
        </div>
    </div>
    <script>
        const API_BASE_URL = 'https://your-backend-url.onrender.com'; // !!! ЗАМЕНИТЬ НА СВОЙ URL !!!
        let gameState = {}, gameConfig = {}, userId = null;
        const tg = window.Telegram.WebApp;

        const loader = document.getElementById('loader');
        const appContainer = document.getElementById('app-container');
        const balanceAmountEl = document.getElementById('balance-amount');
        const dailyIncomeEl = document.getElementById('daily-income');
        const charactersContainer = document.getElementById('characters-container');
        const modal = document.getElementById('message-modal');
        const modalText = document.getElementById('modal-text');
        const modalCloseBtn = document.getElementById('modal-close-btn');

        async function apiRequest(endpoint, method = 'GET', body = null) {
            try {
                const response = await fetch(`${API_BASE_URL}${endpoint}`, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : null });
                const data = await response.json();
                if (!response.ok) throw new Error(data.message || 'Ошибка сервера');
                return data;
            } catch (error) {
                showMessage(error.message);
                throw error;
            }
        }

        function showMessage(message) { modalText.textContent = message; modal.classList.remove('hidden'); }
        function getCharacterIncome(character, level) { return character.baseIncome * (1 + (level - 1) * gameConfig.levelBonusMultiplier); }
        function calculateTotalIncome() { return gameState.characters.reduce((total, ownedChar) => { const charConfig = gameConfig.characters.find(c => c.id === ownedChar.id); return total + (charConfig ? getCharacterIncome(charConfig, ownedChar.level) : 0); }, 0); }

        function renderGame() {
            balanceAmountEl.textContent = gameState.balance.toFixed(4);
            dailyIncomeEl.textContent = calculateTotalIncome().toFixed(4);
            charactersContainer.innerHTML = '';
            gameConfig.characters.forEach(charConfig => {
                const ownedChar = gameState.characters.find(c => c.id === charConfig.id);
                const isOwned = !!ownedChar;
                const level = isOwned ? ownedChar.level : 0;
                const currentIncome = isOwned ? getCharacterIncome(charConfig, level) : charConfig.baseIncome;
                const isMaxLevel = isOwned && (level >= 6 || !gameConfig.upgradeCosts[charConfig.id]);
                const upgradeCost = isOwned && !isMaxLevel ? gameConfig.upgradeCosts[charConfig.id][level] : 0;
                const card = `
                    <div class="glass-card rounded-xl p-4 flex flex-col space-y-3">
                        <div class="flex justify-between items-start">
                            <div>
                                <h2 class="text-lg font-bold text-white">${charConfig.name} ${isOwned ? `<span class="text-sm font-normal text-gray-300">(Ур. ${level})</span>` : ''}</h2>
                                <p class="text-xs text-gray-400">${charConfig.description || ''}</p>
                            </div>
                            <div class="text-right">
                                <p class="font-semibold text-cyan-400">${currentIncome.toFixed(4)}</p>
                                <p class="text-xs text-gray-500">TON/сутки</p>
                            </div>
                        </div>
                        ${isOwned ? `<button class="${isMaxLevel ? 'bg-gray-600' : 'btn-primary'} text-white font-bold py-2 px-4 rounded-lg w-full text-sm" ${isMaxLevel ? 'disabled' : ''} onclick="upgradeCharacter(${charConfig.id})">${isMaxLevel ? 'Макс. уровень' : `Улучшить за ${upgradeCost.toFixed(2)} TON`}</button>` : `<button class="btn-secondary text-white font-bold py-2 px-4 rounded-lg w-full text-sm" onclick="buyCharacter(${charConfig.id})">Купить за ${charConfig.cost.toFixed(2)} TON</button>`}
                    </div>`;
                charactersContainer.insertAdjacentHTML('beforeend', card);
            });
        }

        async function fetchGameState() {
            try {
                const response = await apiRequest(`/api/game-state/${userId}`);
                if (response.success) {
                    gameState = response.data; gameConfig = response.config; renderGame();
                    setInterval(() => { gameState.balance += calculateTotalIncome() / 86400; balanceAmountEl.textContent = gameState.balance.toFixed(4); }, 1000);
                }
            } catch (error) { showMessage("Не удалось загрузить данные игры. Попробуйте позже."); } 
            finally { loader.classList.add('hidden'); appContainer.classList.remove('hidden'); }
        }

        window.buyCharacter = async (id) => { try { const res = await apiRequest('/api/buy-character', 'POST', { userId, characterId: id }); if (res.success) { gameState = res.data; renderGame(); showMessage(`Поздравляем! Вы приобрели персонажа.`); } } catch(e) {} };
        window.upgradeCharacter = async (id) => { try { const res = await apiRequest('/api/upgrade-character', 'POST', { userId, characterId: id }); if (res.success) { gameState = res.data; renderGame(); showMessage(`Персонаж улучшен!`); } } catch(e) {} };

        document.addEventListener('DOMContentLoaded', () => {
            tg.ready(); tg.expand();
            userId = tg.initDataUnsafe?.user?.id;
            if (userId) { fetchGameState(); } else { loader.classList.add('hidden'); showMessage("Ошибка: откройте приложение через бота в Telegram."); }
            modalCloseBtn.addEventListener('click', () => modal.classList.add('hidden'));
        });
    </script>
</body>
</html>
