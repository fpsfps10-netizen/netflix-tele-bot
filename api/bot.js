const { Telegraf, Markup } = require('telegraf');
const { readData, writeData } = require('../lib/database');
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

const ADMIN_ID = 6197540099; // معرف الأدمن الخاص بك

module.exports = async (req, res) => {
    try {
        if (!req.body || !req.body.message) return res.status(200).send('OK');

        const data = await readData();
        const chatId = req.body.message.from.id;
        const text = req.body.message.text || "";

        let user = data.users.find(u => u.id === chatId);
        const isReseller = (user && user.role === 'reseller') || chatId === ADMIN_ID;

        // --- قسم الرد على الأزرار النصية ---

        if (text === '🏠 طلب كود نيتفليكس') {
            await bot.telegram.sendMessage(chatId, "📩 من فضلك أرسل إيميل الحساب المطلوب كوده.");
            return res.status(200).send('OK');
        }

        if (text === '📋 حالتي') {
            const roleName = isReseller ? "مورد معتمد" : "زبون";
            await bot.telegram.sendMessage(chatId, `👤 الاسم: ${req.body.message.from.first_name}\n🎖️ الرتبة: ${roleName}`);
            return res.status(200).send('OK');
        }

        if (text === '⚙️ إدارة المشتركين' && isReseller) {
            await bot.telegram.sendMessage(chatId, "🛠️ لوحة الإدارة: يمكنك البحث عن العملاء أو متابعة التجديدات.");
            return res.status(200).send('OK');
        }

        if (text === '📞 الدعم') {
            await bot.telegram.sendMessage(chatId, "👨‍💻 للتواصل مع الدعم الفني: @YourUsername");
            return res.status(200).send('OK');
        }

        // --- قسم الأوامر البرمجية ---

        if (text === '/start') {
            let buttons = [
                ['🏠 طلب كود نيتفليكس', '📋 حالتي'],
                ['🔄 تجديد الاشتراك', '📞 الدعم']
            ];
            if (isReseller) buttons.push(['📖 دليل الاستخدام', '⚙️ إدارة المشتركين']);
            
            await bot.telegram.sendMessage(chatId, "مرحباً بك في Monsieur NFLIX:", Markup.keyboard(buttons).resize());
            return res.status(200).send('OK');
        }

        await bot.handleUpdate(req.body);
    } catch (e) {
        console.error("Error:", e.message);
    }
    if (!res.writableEnded) res.status(200).send('OK');
};
