const { Telegraf, Markup } = require('telegraf');
const { readData, writeData } = require('../lib/database');
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

// معرف الأدمن (6197540099)
const ADMIN_ID = 6197540099; 

module.exports = async (req, res) => {
    try {
        const data = await readData();
        if (!req.body || !req.body.message) return res.status(200).send('OK');

        const chatId = req.body.message.from.id;
        const text = req.body.message.text || "";

        // تسجيل المستخدم تلقائياً
        let user = data.users.find(u => u.id === chatId);
        if (!user) {
            user = { id: chatId, name: req.body.message.from.first_name, role: 'user', emails: [], clients: {} };
            data.users.push(user);
            await writeData(data);
        }

        const isReseller = user.role === 'reseller' || chatId === ADMIN_ID;

        // أمر الاختبار (سيؤكد نجاح الرفع)
        if (text === '/test') {
            return await bot.telegram.sendMessage(chatId, "✅ النسخة المحدثة تعمل الآن.");
        }

        // ترقية مورد (يتطلب وجود المستخدم مسبقاً)
        if (text.startsWith('/make_reseller')) {
            if (chatId !== ADMIN_ID) return; 

            const targetId = parseInt(text.split(' ')[1]);
            if (!targetId) return await bot.telegram.sendMessage(chatId, "⚠️ يرجى إدخال المعرف.");

            const userIndex = data.users.findIndex(u => u.id === targetId);
            
            if (userIndex !== -1) {
                data.users[userIndex].role = 'reseller';
                await writeData(data);
                await bot.telegram.sendMessage(chatId, `✅ تم تعيين المورد ${targetId} بنجاح.`);
            } else {
                await bot.telegram.sendMessage(chatId, "❌ المستخدم غير موجود، يجب عليه إرسال /start أولاً.");
            }
            return;
        }

        if (text === '/start') {
            let buttons = [['🏠 طلب كود نيتفليكس', '📋 حالتي'], ['🔄 تجديد الاشتراك', '📞 الدعم']];
            if (isReseller) buttons.push(['📖 دليل الاستخدام', '⚙️ إدارة المشتركين']);
            
            return await bot.telegram.sendMessage(chatId, "مرحباً بك في Monsieur NFLIX:", Markup.keyboard(buttons).resize());
        }

        await bot.handleUpdate(req.body);
    } catch (e) { console.error("Error:", e); }
    res.status(200).send('OK');
};
