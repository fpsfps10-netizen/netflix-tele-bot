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

        // 1. استقبال الأكواد وروابط التلفاز (Webhook)
        if (req.body && req.body.to && req.body.content) {
            const emailTo = req.body.to.toLowerCase().trim();
            const fullContent = req.body.content;
            const targetUsers = data.users.filter(u => u.emails && u.emails.includes(emailTo));

            for (const u of targetUsers) {
                const displayName = u.clients[emailTo] || "مشترك";
                const expiryDate = u.expiries ? u.expiries[emailTo] : null;

                if (!isSubscriptionValid(expiryDate)) {
                    await bot.telegram.sendMessage(u.id, `⚠️ اشتراك <b>${displayName}</b> انتهى. يرجى التجديد لاستلام الأكواد.`, { parse_mode: 'HTML' });
                    continue; 
                }

                const urlMatch = fullContent.match(/https?:\/\/(?:www\.)?netflix\.com\/(?:nm|setup|verify)[^\s<>"]+/g);
                if (/TV/i.test(displayName) && urlMatch) {
                    await bot.telegram.sendMessage(u.id, `📺 <b>تأكيد التلفاز: ${displayName}</b>`, 
                        Markup.inlineKeyboard([[Markup.button.url('✅ تأكيد الآن', urlMatch[0])]]));
                } else {
                    const codeMatch = fullContent.match(/\b\d{4}\b/g);
                    if (codeMatch) await bot.telegram.sendMessage(u.id, `👤 المشترك: <b>${displayName}</b>\n🔢 كود الدخول: <code>${codeMatch[codeMatch.length-1]}</code>`, { parse_mode: 'HTML' });
                }
            }
            return res.status(200).send('OK');
        }

        // 2. معالجة رسائل تليجرام المباشرة
        if (!req.body || !req.body.message) return res.status(200).send('OK');
        const chatId = req.body.message.from.id;
        const text = req.body.message.text || "";
        const isAdmin = chatId === ADMIN_ID;

        let user = data.users.find(u => u.id === chatId);
        if (!user) {
            user = { 
                id: chatId, 
                name: req.body.message.from.first_name || "مستخدم", 
                role: 'user', 
                emails: [], 
                clients: {}, 
                expiries: {} 
            };
            data.users.push(user);
            await writeData(data);
        }

        const isReseller = user.role === 'reseller' || isAdmin;

        // القائمة الرئيسية
        if (text === '/start') {
            const menu = [['🏠 طلب كود نيتفليكس', '📋 حالتي'], ['⚙️ إدارة المشتركين']];
            await bot.telegram.sendMessage(chatId, "مرحباً بك في Monsieur NFLIX:", Markup.keyboard(menu).resize());
            return res.status(200).send('OK');
        }

        // عرض الحالة الأساسية (تم حذف النقاط)
        if (text === '📋 حالتي') {
            await bot.telegram.sendMessage(chatId, 
                `👤 <b>الاسم:</b> ${user.name}\n` +
                `🆔 <b>المعرف الخاص بك:</b> <code>${chatId}</code>`, { parse_mode: 'HTML' });
            return res.status(200).send('OK');
        }

        // عرض جميع المستخدمين للإدارة
        if (text === '⚙️ إدارة المشتركين' && isReseller) {
            const allUsers = data.users.filter(u => u.id !== ADMIN_ID); 
            if (allUsers.length === 0) {
                await bot.telegram.sendMessage(chatId, "⚠️ لا يوجد مستخدمين مسجلين حالياً.");
            } else {
                const buttons = allUsers.map(u => [Markup.button.callback(`${u.name} (ID: ${u.id})`, `view_user_${u.id}`)]);
                await bot.telegram.sendMessage(chatId, "⚙️ قائمة المستخدمين النشطين:", Markup.inlineKeyboard(buttons));
            }
            return res.status(200).send('OK');
        }

        // أمر التجديد البسيط (بدون نقاط)
        if (isReseller && text.startsWith('/renew')) {
            const [_, email, days] = text.split(' ');
            if (email && days) {
                const newDate = calculateExpiry(days);
                const target = data.users.find(u => u.clients && u.clients[email.toLowerCase()]);
                if (target) {
                    target.expiries[email.toLowerCase()] = newDate;
                    await writeData(data);
                    await bot.telegram.sendMessage(chatId, `✅ تم تجديد <b>${target.name}</b> لـ ${days} يوم.\n📅 ينتهي في: ${newDate}`);
                }
            }
            return res.status(200).send('OK');
        }

        await bot.handleUpdate(req.body);
    } catch (e) { console.error("Error:", e.message); }
    if (!res.writableEnded) res.status(200).send('OK');
};
