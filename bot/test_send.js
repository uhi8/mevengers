const TelegramBot = require('node-telegram-bot-api');
require('dotenv').config({ path: '../.env' });
const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: false });
bot.sendMessage('1160610439', 'Testing message via lib!').then(console.log).catch(console.error);
bot.sendMessage('1889539620', 'Testing message via lib!').then(console.log).catch(console.error);
