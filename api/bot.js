const { Telegraf, Markup } = require('telegraf');
const { readData, writeData } = require('../lib/database');
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

const ADMIN_ID = 6197540099; 

module.exports = async (req, res) => {
    try {
        if (!req.body || !req.body.message) return res.status(200).send('OK');

        const data = await readData();
        const chatId = req.body.message.from.id;
        const text = req.body.message.text || "";

        // تسجيل المستخدم
        let user = data.users.find(u => u.id === chatId);
        if (!user) {
            user = { id: chatId, name: req.body.message.from.first_name, role: 'user', emails: [], clients: {} };
            data.users.push(user);
            await writeData(data);
        }

        const isReseller = user.role === 'reseller' || chatId === ADMIN_ID;

        // 1. أمر الترقية (يجب أن يكون في البداية)
        if (text.startsWith('/make_reseller')) {
            if (chatId !== ADMIN_ID) return res.status(200).send('OK');

            const targetId = parseInt(text.split(' ')[1]);
            const userIndex = data.users.findIndex(u => u.id === targetId);
            
            if (userIndex !== -1) {
                data.users[userIndex].role = 'reseller';
                await writeData(data);
                await bot.telegram.sendMessage(chatId, `✅ تم ترقية ${targetId} إلى مورد.`);
                try { await bot.telegram.sendMessage(targetId, "🎊 تم منحك صلاحيات مورد!"); } catch(e){}
            } else {
                await bot.telegram.sendMessage(chatId, "❌ المستخدم غير موجود في القاعدة.");
            }
            return res.status(200).send('OK');
        }

        // 2. أمر الاختبار
        if (text === '/test') {
            await bot.telegram.sendMessage(chatId, "✅ نظام Monsieur NFLIX مستجيب للأوامر.");
            return res.status(200).send('OK');
        }

        // 3. أمر البداية والقائمة
        if (text === '/start') {
            let buttons = [['🏠 طلب كود نيتفليكس', '📋 حالتي'], ['🔄 تجديد الاشتراك', '📞 الدعم']];
            if (isReseller) buttons.push(['📖 دليل الاستخدام', '⚙️ إدارة المشتركين']);
            
            await bot.telegram.sendMessage(chatId, "مرحباً بك في Monsieur NFLIX:", Markup.keyboard(buttons).resize());
            return res.status(200).send('OK');
        }

        await bot.handleUpdate(req.body);
    } catch (e) { console.error("Error:", e); }
    res.status(200).send('OK');
};
