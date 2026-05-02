const { Telegraf, Markup } = require('telegraf');
const { readData, writeData } = require('../lib/database');

const bot = new Telegraf('8459897834:AAH-gSqYBIExQJXkDc8OYltOpH7vq2WubNc');
const ADMIN_ID = 6197540099;

// --- الدوال المساعدة ---
function calculateExpiry(days) {
    const date = new Date();
    date.setDate(date.getDate() + parseInt(days));
    return date.toISOString().split('T')[0];
}

function isSubscriptionValid(expiryDate) {
    if (!expiryDate) return false;
    const today = new Date().toISOString().split('T')[0];
    return expiryDate >= today;
}

module.exports = async (req, res) => {
    try {
        const data = await readData();

        // 1. استقبال الأكواد (Webhook)
        if (req.body && req.body.to && req.body.content) {
            const emailTo = req.body.to.toLowerCase().trim();
            const targetUsers = data.users.filter(u => u.emails && u.emails.includes(emailTo));
            for (const u of targetUsers) {
                const expiryDate = u.expiries ? u.expiries[emailTo] : null;
                if (!isSubscriptionValid(expiryDate)) continue;

                const codeMatch = req.body.content.match(/\b\d{4}\b/g);
                if (codeMatch) await bot.telegram.sendMessage(u.id, `🔢 كود الدخول: <code>${codeMatch[codeMatch.length-1]}</code>`, { parse_mode: 'HTML' });
            }
            return res.status(200).send('OK');
        }

        // 2. معالجة نقرات الأزرار
        if (req.body && req.body.callback_query) {
            const callbackData = req.body.callback_query.data;
            const fromId = req.body.callback_query.from.id;

            if (fromId === ADMIN_ID) {
                if (callbackData.startsWith('view_user_')) {
                    const targetId = parseInt(callbackData.replace('view_user_', ''));
                    const targetUser = data.users.find(u => u.id === targetId);
                    if (targetUser) {
                        let info = `👤 <b>إدارة:</b> ${targetUser.name}\n🆔 <b>ID:</b> <code>${targetId}</code>\n\n`;
                        const emails = Object.keys(targetUser.clients || {});
                        emails.forEach(e => info += `📧 ${e}\n📅 ينتهي: ${targetUser.expiries[e]}\n`);

                        const controls = [
                            [Markup.button.callback('📅 شهر', `renew_${targetId}_30`), Markup.button.callback('📅 3 أشهر', `renew_${targetId}_90`)],
                            [Markup.button.callback('✍️ كتابة تاريخ محدد', `ask_date_${targetId}`)],
                            [Markup.button.callback('🗑️ حذف', `delete_user_${targetId}`)]
                        ];
                        await bot.telegram.sendMessage(fromId, info, { parse_mode: 'HTML', ...Markup.inlineKeyboard(controls) });
                    }
                }

                // طلب كتابة التاريخ
                if (callbackData.startsWith('ask_date_')) {
                    const targetId = callbackData.replace('ask_date_', '');
                    await bot.telegram.sendMessage(fromId, `ارسل التاريخ الجديد للمستخدم <code>${targetId}</code> بهذا الشكل:\n\n <code>/setdate ${targetId} 2026-12-31</code>`, { parse_mode: 'HTML' });
                }

                // تجديد تلقائي بالأيام (للأزرار)
                if (callbackData.startsWith('renew_')) {
                    const [_, targetId, days] = callbackData.split('_');
                    const targetUser = data.users.find(u => u.id === parseInt(targetId));
                    const email = Object.keys(targetUser.clients)[0];
                    if (targetUser && email) {
                        targetUser.expiries[email] = calculateExpiry(days);
                        await writeData(data);
                        await bot.telegram.sendMessage(fromId, `✅ تم التجديد لـ ${targetUser.name} حتى ${targetUser.expiries[email]}`);
                    }
                }
            }
            return res.status(200).send('OK');
        }

        // 3. الأوامر اليدوية (تحديد التاريخ مباشرة)
        if (!req.body || !req.body.message) return res.status(200).send('OK');
        const chatId = req.body.message.from.id;
        const text = req.body.message.text || "";

        if (chatId === ADMIN_ID && text.startsWith('/setdate')) {
            const [_, targetId, newDate] = text.split(' ');
            const targetUser = data.users.find(u => u.id === parseInt(targetId));
            
            // التأكد من صحة تنسيق التاريخ (YYYY-MM-DD)
            if (targetUser && /^\d{4}-\d{2}-\d{2}$/.test(newDate)) {
                const email = Object.keys(targetUser.clients)[0];
                if (email) {
                    targetUser.expiries[email] = newDate;
                    await writeData(data);
                    await bot.telegram.sendMessage(chatId, `✅ تم تحديث تاريخ انتهاء <b>${targetUser.name}</b> إلى: <code>${newDate}</code>`, { parse_mode: 'HTML' });
                }
            } else {
                await bot.telegram.sendMessage(chatId, "❌ خطأ في التاريخ. استخدم الصيغة: YYYY-MM-DD");
            }
            return res.status(200).send('OK');
        }

        if (text === '/start') {
            const menu = [['🏠 طلب كود نيتفليكس', '📋 حالتي'], ['⚙️ إدارة المشتركين']];
            await bot.telegram.sendMessage(chatId, "مرحباً بك في Monsieur NFLIX:", Markup.keyboard(menu).resize());
        }

        if (text === '⚙️ إدارة المشتركين' && chatId === ADMIN_ID) {
            const allUsers = data.users.filter(u => u.id !== ADMIN_ID); 
            const buttons = allUsers.map(u => [Markup.button.callback(`${u.name} (ID: ${u.id})`, `view_user_${u.id}`)]);
            await bot.telegram.sendMessage(chatId, "⚙️ اختر زبوناً:", Markup.inlineKeyboard(buttons));
        }

        await bot.handleUpdate(req.body);
    } catch (e) { console.error(e); }
    if (!res.writableEnded) res.status(200).send('OK');
};
