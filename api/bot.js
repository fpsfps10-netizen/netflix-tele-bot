const { Telegraf, Markup } = require('telegraf');
const { readData, writeData } = require('../lib/database');

const bot = new Telegraf('8459897834:AAH-gSqYBIExQJXkDc8OYltOpH7vq2WubNc');
const ADMIN_ID = 6197540099;

module.exports = async (req, res) => {
    if (req.method !== 'POST') return res.status(200).send('Monsieur NFLIX System: Active');

    try {
        const data = await readData();

        // 1. القائمة الرئيسية (إضافة زر قائمة المسجلين للأدمن)
        bot.start(async (ctx) => {
            let menu = [['🏠 طلب كود نيتفليكس', '📋 حالتي']];
            if (ctx.from.id === ADMIN_ID) {
                menu.push(['⚙️ إدارة المشتركين', '👥 قائمة المسجلين']);
            }
            await ctx.reply("مرحباً بك في Monsieur NFLIX 🎬", Markup.keyboard(menu).resize());
        });

        // 2. وظيفة عرض جميع الزبائن المسجلين (بدون فلترة الصلاحية)
        bot.hears('👥 قائمة المسجلين', async (ctx) => {
            if (ctx.from.id !== ADMIN_ID) return;
            
            const allUsers = data.users.filter(u => u.id !== ADMIN_ID);
            
            if (allUsers.length === 0) {
                return ctx.reply("❌ لا يوجد أي مستخدم مسجل في قاعدة البيانات حالياً.");
            }

            let response = "👥 <b>قائمة جميع المسجلين:</b>\n\n";
            allUsers.forEach((u, index) => {
                response += `${index + 1}. <b>${u.name}</b> (<code>${u.id}</code>)\n`;
            });

            // أزرار سريعة للانتقال لإدارة زبون معين
            const buttons = allUsers.map(u => [Markup.button.callback(`⚙️ إدارة ${u.name}`, `view_user_${u.id}`)]);
            
            await ctx.reply(response, { 
                parse_mode: 'HTML', 
                ...Markup.inlineKeyboard(buttons) 
            });
        });

        // 3. نظام الإدارة المتقدم (المعالج السابق)
        bot.hears('⚙️ إدارة المشتركين', async (ctx) => {
            if (ctx.from.id !== ADMIN_ID) return;
            const customers = data.users.filter(u => u.id !== ADMIN_ID);
            if (customers.length > 0) {
                const buttons = customers.map(u => [Markup.button.callback(`👤 ${u.name}`, `view_user_${u.id}`)]);
                await ctx.reply("⚙️ اختر زبوناً للإدارة:", Markup.inlineKeyboard(buttons));
            } else {
                await ctx.reply("❌ لا يوجد زبائن حالياً.");
            }
        });

        // معالجة الأزرار التفاعلية
        if (req.body.callback_query) {
            const callbackData = req.body.callback_query.data;
            const fromId = req.body.callback_query.from.id;

            if (fromId === ADMIN_ID && callbackData.startsWith('view_user_')) {
                const targetId = parseInt(callbackData.replace('view_user_', ''));
                const targetUser = data.users.find(u => u.id === targetId);
                
                if (targetUser) {
                    const emails = Object.keys(targetUser.clients || {});
                    const emailButtons = emails.map(email => [
                        Markup.button.callback(`📧 ${email}`, `manage_mail_${targetId}_${email}`)
                    ]);
                    emailButtons.push([Markup.button.callback('➕ ربط إيميل جديد', `ask_link_${targetId}`)]);
                    
                    await bot.telegram.sendMessage(fromId, `👤 <b>إدارة:</b> ${targetUser.name}\nID: <code>${targetId}</code>`, {
                        parse_mode: 'HTML',
                        ...Markup.inlineKeyboard(emailButtons)
                    });
                }
            }
            return res.status(200).send('OK');
        }

        await bot.handleUpdate(req.body);
    } catch (e) { console.error("Error:", e.message); }
    if (!res.writableEnded) res.status(200).send('OK');
};
