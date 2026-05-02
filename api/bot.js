const { Telegraf, Markup } = require('telegraf');
const { readData, writeData } = require('../lib/database');

const bot = new Telegraf('8459897834:AAH-gSqYBIExQJXkDc8OYltOpH7vq2WubNc');
const ADMIN_ID = 6197540099; // معرف الإدمن Monsieur NFLIX

module.exports = async (req, res) => {
    // استجابة فورية لتجنب الـ Timeout
    if (req.method !== 'POST') {
        return res.status(200).send('Bot is Running...');
    }
    res.status(200).send('OK');

    try {
        const data = await readData();

        // 1. معالجة الإيميلات الواردة من Webhook (بناءً على إعدادات MailNow)
        if (req.body && req.body.content) {
            const emailTo = req.body.to || "غير محدد";
            const emailContent = req.body.content;

            await bot.telegram.sendMessage(ADMIN_ID, 
                `📩 <b>إشعار إيميل جديد:</b>\n\n<b>إلى:</b> <code>${emailTo}</code>\n<b>المحتوى:</b>\n<pre>${emailContent}</pre>`, 
                { parse_mode: 'HTML' }
            );
            return;
        }

        // 2. معالجة أزرار تليجرام (Callback Queries)
        if (req.body.callback_query) {
            const cb = req.body.callback_query;
            const cbData = cb.data;

            if (cb.from.id === ADMIN_ID) {
                // عرض حسابات الزبون (مثل Wassim أو Badi)
                if (cbData.startsWith('view_user_')) {
                    const targetId = parseInt(cbData.replace('view_user_', ''));
                    const user = data.users.find(u => u.id === targetId);
                    if (user) {
                        const emails = Object.keys(user.clients || {});
                        const buttons = emails.map(e => [Markup.button.callback(`📧 ${e}`, `manage_mail_${targetId}_${e}`)]);
                        buttons.push([Markup.button.callback('⬅️ عودة للقائمة', 'manage_all')]);
                        
                        await bot.telegram.sendMessage(ADMIN_ID, `👤 إدارة: <b>${user.name}</b>\nاختر الحساب:`, {
                            parse_mode: 'HTML',
                            ...Markup.inlineKeyboard(buttons)
                        });
                    }
                }
                
                // إدارة إيميل محدد (بروفايل + تاريخ)
                if (cbData.startsWith('manage_mail_')) {
                    const [_, __, targetId, email] = cbData.split('_');
                    await bot.telegram.sendMessage(ADMIN_ID, `⚙️ إعدادات الحساب: <code>${email}</code>\nماذا تريد أن تفعل؟`, {
                        parse_mode: 'HTML',
                        ...Markup.inlineKeyboard([
                            [Markup.button.callback('👤 تعديل البروفايل', `edit_p_${targetId}_${email}`)],
                            [Markup.button.callback('📅 تعديل التاريخ', `edit_d_${targetId}_${email}`)]
                        ])
                    });
                }
            }
            return;
        }

        // 3. معالجة أوامر تليجرام العادية
        const msg = req.body.message;
        if (msg && msg.text) {
            const chatId = msg.from.id;
            const text = msg.text;

            if (text === '/start') {
                const menu = [['🏠 طلب كود نيتفليكس', '📋 حالتي'], ['⚙️ إدارة المشتركين']];
                await bot.telegram.sendMessage(chatId, "مرحباً بك في Monsieur NFLIX:", Markup.keyboard(menu).resize());
            } 
            else if (text === '⚙️ إدارة المشتركين' && chatId === ADMIN_ID) {
                const customers = data.users.filter(u => u.id !== ADMIN_ID);
                const buttons = customers.map(u => [Markup.button.callback(`${u.name}`, `view_user_${u.id}`)]);
                await bot.telegram.sendMessage(chatId, "⚙️ اختر زبوناً للإدارة:", Markup.inlineKeyboard(buttons));
            }
            
            await bot.handleUpdate(req.body);
        }

    } catch (err) {
        console.error("Error:", err.message);
    }
};
