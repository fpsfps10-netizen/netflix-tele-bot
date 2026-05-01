const { Telegraf, Markup } = require('telegraf');
const { readData, writeData } = require('../lib/database');
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

// معرف الأدمن الخاص بك
const ADMIN_ID = 6197540099; 

module.exports = async (req, res) => {
    try {
        const data = await readData();

        if (req.body && req.body.message && req.body.message.text) {
            const chatId = req.body.message.from.id;
            const text = req.body.message.text;

            // 1. تسجيل المستخدم فوراً لضمان وجوده في قاعدة البيانات
            let user = data.users.find(u => u.id === chatId);
            if (!user) {
                user = { id: chatId, name: req.body.message.from.first_name, role: 'user', emails: [], clients: {} };
                data.users.push(user);
                await writeData(data);
            }
            
            const isReseller = user.role === 'reseller' || chatId === ADMIN_ID;

            // 2. تحديث قائمة الأزرار
            if (text === '/start') {
                let buttons = [['🏠 طلب كود نيتفليكس', '📋 حالتي'], ['🔄 تجديد الاشتراك', '📞 الدعم']];
                if (isReseller) buttons.push(['📖 دليل الاستخدام', '⚙️ إدارة المشتركين']);
                
                return await bot.telegram.sendMessage(chatId, "مرحباً بك في Monsieur NFLIX:", Markup.keyboard(buttons).resize());
            }

            // 3. معالجة أمر الترقية (هذا الجزء الذي تم إصلاحه)
            if (text.startsWith('/make_reseller')) {
                if (chatId !== ADMIN_ID) {
                    return await bot.telegram.sendMessage(chatId, "❌ هذا الأمر متاح للمسؤول فقط.");
                }

                const targetId = parseInt(text.split(' ')[1]);
                if (!targetId) return await bot.telegram.sendMessage(chatId, "⚠️ أرسل ID المستخدم بعد الأمر.");

                const userIndex = data.users.findIndex(u => u.id === targetId);
                if (userIndex !== -1) {
                    data.users[userIndex].role = 'reseller';
                    await writeData(data);
                    await bot.telegram.sendMessage(chatId, `✅ تم تفعيل رتبة المورد لـ <code>${targetId}</code>`, { parse_mode: 'HTML' });
                    await bot.telegram.sendMessage(targetId, "🎊 تم منحك صلاحيات مورد!");
                } else {
                    await bot.telegram.sendMessage(chatId, "❌ المستخدم غير مسجل. اطلب منه إرسال /start.");
                }
                return;
            }
        }
        await bot.handleUpdate(req.body);
    } catch (e) { console.error("Error:", e); }
    res.status(200).send('OK');
};
