import fs from 'fs/promises';
import path from 'path';
import { logger } from '../utils/logger.js';

const TIMERS_FILE = path.resolve('data/temp_roles.json');

// Загрузка сохраненных таймеров
async function loadTimers() {
    try {
        const data = await fs.readFile(TIMERS_FILE, 'utf8');
        return JSON.parse(data);
    } catch {
        return [];
    }
}

// Сохранение таймеров
async function saveTimers(timers) {
    try {
        await fs.mkdir(path.dirname(TIMERS_FILE), { recursive: true });
        await fs.writeFile(TIMERS_FILE, JSON.stringify(timers, null, 2));
    } catch (err) {
        logger.error('Failed to save temp roles timers:', err);
    }
}

// Добавить временную роль (например, на 1 час = 3600 * 1000 мс)
export async function scheduleTempRole(guildId, userId, roleId, durationMs) {
    const timers = await loadTimers();
    const expiresAt = Date.now() + durationMs;

    // Удаляем старую запись, если была
    const filtered = timers.filter(t => !(t.guildId === guildId && t.userId === userId && t.roleId === roleId));
    
    filtered.push({ guildId, userId, roleId, expiresAt });
    await saveTimers(filtered);
}

// Проверка и очистка истекших ролей
export async function checkTempRoles(client) {
    const timers = await loadTimers();
    if (timers.length === 0) return;

    const now = Date.now();
    const remainingTimers = [];

    for (const item of timers) {
        if (now >= item.expiresAt) {
            // Время вышло — снимаем роль
            try {
                const guild = await client.guilds.fetch(item.guildId).catch(() => null);
                if (!guild) continue;

                const member = await guild.members.fetch(item.userId).catch(() => null);
                if (!member) continue;

                if (member.roles.cache.has(item.roleId)) {
                    await member.roles.remove(item.roleId);
                    logger.info(`Temp role ${item.roleId} automatically removed from ${member.user.tag} (time expired)`);
                }
            } catch (err) {
                logger.error(`Failed to remove expired temp role ${item.roleId} for user ${item.userId}:`, err);
            }
        } else {
            // Время еще не вышло, оставляем в списке
            remainingTimers.push(item);
        }
    }

    if (remainingTimers.length !== timers.length) {
        await saveTimers(remainingTimers);
    }
}

// Автоматический запуск проверки в фоновом режиме (каждую минуту)
let isIntervalStarted = false;

export function initTempRoleChecker(client) {
    if (isIntervalStarted) return;
    isIntervalStarted = true;

    // Проверяем сразу при инициализации
    checkTempRoles(client);

    // Запускаем интервал проверки каждую минуту (60000 мс)
    setInterval(() => {
        checkTempRoles(client);
    }, 60 * 1000);
}
