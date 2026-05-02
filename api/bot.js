const { Telegraf, Markup } = require('telegraf');
const { readData, writeData } = require('../lib/database');

const bot = new Telegraf('8459897834:AAH-gSqYBIExQJXkDc8OYltOpH7vq2WubNc');
const ADMIN_ID = 6197540099;

module.exports = async (req, res) => {
    // إرسال استجابة فورية لتليجرام لتجنب الـ Timeout
    if (!res.headersSent) res.status(200).send('OK');

    try {
        const data = await readData();

        // معالجة الضغط على الأزرار (Wassim, Badi, إلخ)
        if (req.body && req.body.callback_query) {
            const callbackData = req.body.callback_query.data;
            const fromId = req.body.callback_query.from.id;

            if (fromId === ADMIN_ID) {
                // عرض قائمة الإيميلات عند اختيار زبون
                if (callbackData.startsWith('view_user_')) {
                    const targetId = parseInt(callbackData.replace('view_user_', ''));
                    const targetUser = data.users.find(u => u.id === targetId);
                    
                    if (targetUser) {
                        const emails = Object.keys(targetUser.clients || {});
                        const buttons = emails.map(email => [
                            Markup.button.callback(`📧 ${email}`, `manage_mail_${targetId}_${email}`)
                        ]);
                        buttons.push([Markup.button.callback('➕ ربط حساب جديد', `ask_link_${targetId}`)]);
                        
                        await bot.telegram.sendMessage(fromId, `👤 إدارة: ${targetUser.name}\nاختر الحساب:`, 
                            Markup.inlineKeyboard(buttons));
                    }
                }
            }
            return;
        }

        // معالجة الرسائل العادية
        if (req.body && req.body.message) {
            const chatId = req.body.message.from.id;
            const text = req.body.message.text || "";

            if (text === '/start') {
                const menu = [['🏠 طلب كود نيتفليكس', '📋 حالتي'], ['⚙️ إدارة المشتركين']];
                await bot.telegram.sendMessage(chatId, "مرحباً بك في Monsieur NFLIX:", Markup.keyboard(menu).resize());
            } 
            else if (text === '⚙️ إدارة المشتركين' && chatId === ADMIN_ID) {
                const allUsers = data.users.filter(u => u.id !== ADMIN_ID);
                const buttons = allUsers.map(u => [Markup.button.callback(`${u.name} (ID: ${u.id})`, `view_user_${u.id}`)]);
                await bot.telegram.sendMessage(chatId, "⚙️ اختر زبوناً:", Markup.inlineKeyboard(buttons));
            }
            
            await bot.handleUpdate(req.body);
        }
    } catch (e) {
        console.error("Critical Error:", e.message);
    }
};
