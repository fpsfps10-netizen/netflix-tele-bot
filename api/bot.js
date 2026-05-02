const { Telegraf, Markup } = require('telegraf');
const { readData, writeData } = require('../lib/database');

const bot = new Telegraf('8459897834:AAH-gSqYBIExQJXkDc8OYltOpH7vq2WubNc');
const ADMIN_ID = 6197540099;

module.exports = async (req, res) => {
    // 1. استجابة فورية لتجنب الـ Timeout
    if (req.method !== 'POST') {
        return res.status(200).send('Bot is Running...');
    }
    res.status(200).send('OK');

    try {
        const data = await readData();

        // 2. معالجة الإيميلات الواردة (Webhook من MailNow)
        if (req.body && req.body.content) {
            const emailTo = req.body.to || "غير محدد";
            const emailContent = req.body.content;
            await bot.telegram.sendMessage(ADMIN_ID, 
                `📩 <b>إشعار إيميل جديد:</b>\n\n<b>إلى:</b> <code>${emailTo}</code>\n<b>المحتوى:</b>\n<pre>${emailContent}</pre>`, 
                { parse_mode: 'HTML' }
            );
            return;
        }

        // 3. معالجة التحديثات (الرسائل والأزرار)
        // إضافة هذا السطر يضمن أن Telegraf سيعالج الطلب القادم من req.body بالكامل
        await bot.handleUpdate(req.body);

        // وضع الأوامر داخل إطار البوت لضمان التنفيذ
        bot.start(async (ctx) => {
            const menu = [['🏠 طلب كود نيتفليكس', '📋 حالتي'], ['⚙️ إدارة المشتركين']];
            await ctx.reply("مرحباً بك في Monsieur NFLIX:", Markup.keyboard(menu).resize());
        });

        bot.hears('⚙️ إدارة المشتركين', async (ctx) => {
            if (ctx.from.id === ADMIN_ID) {
                const customers = data.users.filter(u => u.id !== ADMIN_ID);
                if (customers.length > 0) {
                    const buttons = customers.map(u => [Markup.button.callback(`${u.name}`, `view_user_${u.id}`)]);
                    await ctx.reply("⚙️ اختر زبوناً للإدارة:", Markup.inlineKeyboard(buttons));
                } else {
                    await ctx.reply("❌ لا يوجد زبائن مسجلين حالياً.");
                }
            }
        });

        // معالجة الأزرار (Callback Queries)
        bot.on('callback_query', async (ctx) => {
            const cbData = ctx.callbackQuery.data;
            if (ctx.from.id === ADMIN_ID) {
                if (cbData.startsWith('view_user_')) {
                    const targetId = parseInt(cbData.replace('view_user_', ''));
                    const user = data.users.find(u => u.id === targetId);
                    if (user) {
                        const emails = Object.keys(user.clients || {});
                        const buttons = emails.map(e => [Markup.button.callback(`📧 ${e}`, `manage_mail_${targetId}_${e}`)]);
                        buttons.push([Markup.button.callback('⬅️ عودة للقائمة', 'manage_all')]);
                        await ctx.editMessageText(`👤 إدارة: <b>${user.name}</b>\nاختر الحساب:`, {
                            parse_mode: 'HTML',
                            ...Markup.inlineKeyboard(buttons)
                        });
                    }
                }
            }
        });

    } catch (err) {
        console.error("Error:", err.message);
    }
};
