const { Telegraf, Markup } = require('telegraf');
const { readData, writeData } = require('../lib/database');
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

const ADMIN_ID = 6197540099;

module.exports = async (req, res) => {
    try {
        const data = await readData();
        if (!req.body || !req.body.message) {
            // معالجة الأكواد التلقائية (نفس الكود السابق)
            return res.status(200).send('OK');
        }

        const chatId = req.body.message.from.id;
        const text = req.body.message.text || "";
        const isAdmin = chatId === ADMIN_ID;

        let user = data.users.find(u => u.id === chatId);
        if (!user) {
            user = { id: chatId, name: req.body.message.from.first_name, role: 'user', emails: [], clients: {} };
            data.users.push(user);
            await writeData(data);
        }

        // --- عرض قائمة الزبائن (كما في الصورة) ---
        if (text === '⚙️ إدارة المشتركين') {
            const clients = user.clients || {};
            const clientNames = Object.values(clients);

            if (clientNames.length === 0) {
                await bot.telegram.sendMessage(chatId, "⚠️ لا يوجد زبائن مسجلين حالياً.");
                return res.status(200).send('OK');
            }

            // إنشاء أزرار بأسماء الزبائن
            const buttons = clientNames.map(name => [Markup.button.callback(name, `manage_${name}`)]);
            
            await bot.telegram.sendMessage(chatId, "⚙️ قائمة آخر المشتركين:", 
                Markup.inlineKeyboard(buttons)
            );
            return res.status(200).send('OK');
        }

        // --- معالجة الضغط على اسم الزبون لعرض الخيارات ---
        bot.action(/manage_(.+)/, async (ctx) => {
            const clientName = ctx.match[1];
            const actionButtons = [
                [Markup.button.callback('🗑️ حذف', `delete_${clientName}`)],
                [Markup.button.callback('🔄 تجديد (YYYY-MM-DD)', `renew_${clientName}`)],
                [Markup.button.callback('📧 ربط إيميل', `link_${clientName}`)],
                [Markup.button.callback('👤 اسم البروفايل', `profile_${clientName}`)]
            ];

            await ctx.editMessageText(`اختر الإجراء لـ الزبون: <b>${clientName}</b>`, {
                parse_mode: 'HTML',
                ...Markup.inlineKeyboard(actionButtons)
            });
        });

        // --- معالجة أمر الحذف أو التعديل ---
        bot.action(/delete_(.+)/, async (ctx) => {
            const clientName = ctx.match[1];
            // منطق الحذف من قاعدة البيانات
            const emailToDelete = Object.keys(user.clients).find(key => user.clients[key] === clientName);
            if (emailToDelete) {
                delete user.clients[emailToDelete];
                user.emails = user.emails.filter(e => e !== emailToDelete);
                await writeData(data);
                await ctx.answerCbQuery(`✅ تم حذف الزبون ${clientName}`);
                await ctx.editMessageText(`✅ تم حذف الزبون ${clientName} بنجاح.`);
            }
        });

        // الاستجابة العادية للأزرار السفلية
        if (text === '/start') {
            const keyboard = [
                ['🏠 طلب كود نيتفليكس', '📋 حالتي'],
                ['🔍 البحث عن زبون', '⚙️ إدارة المشتركين']
            ];
            await bot.telegram.sendMessage(chatId, "مرحباً بك في Monsieur NFLIX:", Markup.keyboard(keyboard).resize());
        }

        await bot.handleUpdate(req.body);
    } catch (e) { console.error("Error:", e.message); }
    if (!res.writableEnded) res.status(200).send('OK');
};
