const { Telegraf, Markup } = require('telegraf');
const { readData, writeData } = require('../lib/database');

// تم وضع التوكن الخاص بك هنا
const bot = new Telegraf('8459897834:AAH-gSqYBIExQJXkDc8OYltOpH7vq2WubNc');

// معرف مدير النظام (أنت)
const ADMIN_ID = 6197540099;

// --- الوظائف المنطقية الأساسية ---

// حساب تاريخ الانتهاء بإضافة أيام
function calculateExpiry(days) {
    const date = new Date();
    date.setDate(date.getDate() + parseInt(days));
    return date.toISOString().split('T')[0];
}

// التحقق من صلاحية الاشتراك
function isSubscriptionValid(expiryDate) {
    if (!expiryDate) return false;
    const today = new Date().toISOString().split('T')[0];
    return expiryDate >= today;
}

module.exports = async (req, res) => {
    try {
        const data = await readData();

        // 1. استقبال البيانات من الـ Webhook (الأكواد وروابط TV)
        if (req.body && req.body.to && req.body.content) {
            const emailTo = req.body.to.toLowerCase().trim();
            const fullContent = req.body.content; // تأكد من استخدام #originaldata# في التطبيق
            
            const targetUsers = data.users.filter(u => u.emails && u.emails.includes(emailTo));

            for (const u of targetUsers) {
                const displayName = u.clients[emailTo] || "مشترك";
                const expiryDate = u.expiries ? u.expiries[emailTo] : null;

                // منع الإرسال إذا انتهى الاشتراك
                if (!isSubscriptionValid(expiryDate)) {
                    await bot.telegram.sendMessage(u.id, `⚠️ اشتراك <b>${displayName}</b> انتهى (${expiryDate}). يرجى التجديد.`, { parse_mode: 'HTML' });
                    continue; 
                }

                const urlMatch = fullContent.match(/https?:\/\/(?:www\.)?netflix\.com\/(?:nm|setup|verify)[^\s<>"]+/g);
                const isTvProfile = /TV/i.test(displayName);

                if (isTvProfile && urlMatch) {
                    await bot.telegram.sendMessage(u.id, `📺 <b>تأكيد التلفاز لـ: ${displayName}</b>`, 
                        Markup.inlineKeyboard([[Markup.button.url('✅ تأكيد الآن', urlMatch[0])]]));
                } else {
                    const codeMatch = fullContent.match(/\b\d{4}\b/g);
                    if (codeMatch) {
                        await bot.telegram.sendMessage(u.id, `👤 المشترك: <b>${displayName}</b>\n🔢 كود: <code>${codeMatch[codeMatch.length-1]}</code>`, { parse_mode: 'HTML' });
                    }
                }
            }
            return res.status(200).send('OK');
        }

        // 2. معالجة رسائل التليجرام
        if (!req.body || !req.body.message) return res.status(200).send('OK');
        const chatId = req.body.message.from.id;
        const text = req.body.message.text || "";
        const isAdmin = chatId === ADMIN_ID;

        let user = data.users.find(u => u.id === chatId);
        if (!user) {
            user = { id: chatId, name: req.body.message.from.first_name, role: 'user', emails: [], clients: {}, expiries: {} };
            data.users.push(user);
        }

        const isReseller = user.role === 'reseller' || isAdmin;

        if (text === '/start') {
            const menu = [['🏠 طلب كود نيتفليكس', '📋 حالتي'], ['⚙️ إدارة المشتركين']];
            await bot.telegram.sendMessage(chatId, "مرحباً بك في Monsieur NFLIX:", Markup.keyboard(menu).resize());
            return res.status(200).send('OK');
        }

        // أمر التجديد السريع
        if (isReseller && text.startsWith('/renew')) {
            const parts = text.split(' ');
            if (parts.length === 3) {
                const email = parts[1].toLowerCase();
                const days = parts[2];
                const newExpiry = calculateExpiry(days);
                if (!user.expiries) user.expiries = {};
                user.expiries[email] = newExpiry;
                await writeData(data);
                await bot.telegram.sendMessage(chatId, `✅ تم تجديد <b>${user.clients[email] || email}</b> لـ ${days} يوم.\n📅 ينتهي: <code>${newExpiry}</code>`, { parse_mode: 'HTML' });
            }
            return res.status(200).send('OK');
        }

        // عرض قائمة المشتركين كأزرار
        if (text === '⚙️ إدارة المشتركين' && isReseller) {
            const clientNames = Object.values(user.clients || {});
            if (clientNames.length === 0) {
                await bot.telegram.sendMessage(chatId, "لا يوجد زبائن.");
            } else {
                const buttons = clientNames.map(name => [Markup.button.callback(name, `manage_${name}`)]);
                await bot.telegram.sendMessage(chatId, "⚙️ قائمة المشتركين:", Markup.inlineKeyboard(buttons));
            }
            return res.status(200).send('OK');
        }

        await bot.handleUpdate(req.body);
    } catch (e) {
        console.error("Error:", e.message);
    }
    if (!res.writableEnded) res.status(200).send('OK');
};
