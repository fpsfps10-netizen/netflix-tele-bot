const { Telegraf, Markup } = require('telegraf');
const { readData, writeData } = require('../lib/database');

const bot = new Telegraf('8459897834:AAH-gSqYBIExQJXkDc8OYltOpH7vq2WubNc');
const ADMIN_ID = 6197540099;

module.exports = async (req, res) => {
    if (req.method !== 'POST') return res.status(200).send('Monsieur NFLIX: Online');

    try {
        let data = await readData();
        if (!data || !data.users) data = { users: [] };

        // 1. الترحيب والتسجيل التلقائي
        bot.start(async (ctx) => {
            const userId = ctx.from.id;
            const userName = ctx.from.first_name || "مستخدم";

            let user = data.users.find(u => u.id === userId);
            if (!user) {
                data.users.push({ id: userId, name: userName, clients: {}, expiries: {} });
                await writeData(data);
            }

            const menu = (userId === ADMIN_ID) 
                ? [['⚙️ إدارة المشتركين', '👥 قائمة المسجلين']] 
                : [['🏠 طلب كود نيتفليكس', '📋 حالتي']];
            
            await ctx.reply(`مرحباً بك في Monsieur NFLIX 🎬`, Markup.keyboard(menu).resize());
        });

        // 2. عرض الزبائن (كما في Screenshot_20260502_002534_org_telegram_messenger_LaunchActivity_2.jpg)
        bot.hears('⚙️ إدارة المشتركين', async (ctx) => {
            if (ctx.from.id !== ADMIN_ID) return;
            const customers = data.users.filter(u => u.id !== ADMIN_ID);
            
            if (customers.length === 0) return ctx.reply("❌ لا يوجد زبائن حالياً.");

            const buttons = customers.map(u => [Markup.button.callback(`👤 ${u.name}`, `view_user_${u.id}`)]);
            await ctx.reply("⚙️ قائمة آخر المشتركين:", Markup.inlineKeyboard(buttons));
        });

        // 3. معالجة الأزرار التفاعلية (تجديد، ربط، حذف)
        if (req.body.callback_query) {
            const callbackData = req.body.callback_query.data;
            const fromId = req.body.callback_query.from.id;

            if (fromId === ADMIN_ID) {
                const targetId = callbackData.split('_').pop();

                if (callbackData.startsWith('view_user_')) {
                    const controls = [
                        [Markup.button.callback('🔄 تجديد التاريخ', `ask_date_${targetId}`)],
                        [Markup.button.callback('📧 ربط إيميل', `ask_link_${targetId}`)],
                        [Markup.button.callback('👤 اسم البروفايل', `ask_prof_${targetId}`)],
                        [Markup.button.callback('🗑️ حذف الزبون', `confirm_del_${targetId}`)]
                    ];
                    await bot.telegram.sendMessage(ADMIN_ID, `إدارة المستخدم (${targetId}):`, Markup.inlineKeyboard(controls));
                }

                // تعليمات الإدخال بناءً على زر "تجديد" أو "ربط" الظاهر في الصورة
                if (callbackData.startsWith('ask_date_')) {
                    await ctx.reply(`لتجديد التاريخ، انسخ وأرسل:\n<code>/setdate ${targetId} email@example.com 2026-12-31</code>`, { parse_mode: 'HTML' });
                }
                if (callbackData.startsWith('ask_link_')) {
                    await ctx.reply(`لربط حساب، انسخ وأرسل:\n<code>/link ${targetId} email@example.com اسم_البروفايل</code>`, { parse_mode: 'HTML' });
                }
                if (callbackData.startsWith('ask_prof_')) {
                    await ctx.reply(`لتغيير اسم البروفايل، انسخ وأرسل:\n<code>/setprof ${targetId} email@example.com الاسم_الجديد</code>`, { parse_mode: 'HTML' });
                }
            }
        }

        // 4. تنفيذ العمليات عبر الأوامر النصية (Admin Only)
        const text = req.body.message?.text || "";
        if (req.body.message?.from.id === ADMIN_ID) {
            
            // أمر الربط
            if (text.startsWith('/link')) {
                const [_, targetId, email, ...profParts] = text.split(' ');
                const user = data.users.find(u => u.id === parseInt(targetId));
                if (user && email) {
                    user.clients[email] = profParts.join(' ');
                    user.expiries[email] = "2026-12-31"; 
                    await writeData(data);
                    await bot.telegram.sendMessage(ADMIN_ID, `✅ تم ربط ${email} بنجاح.`);
                }
            }

            // أمر تجديد التاريخ
            if (text.startsWith('/setdate')) {
                const [_, targetId, email, newDate] = text.split(' ');
                const user = data.users.find(u => u.id === parseInt(targetId));
                if (user && user.expiries[email]) {
                    user.expiries[email] = newDate;
                    await writeData(data);
                    await bot.telegram.sendMessage(ADMIN_ID, `✅ تم تحديث تاريخ ${email} إلى ${newDate}`);
                }
            }
        }

        await bot.handleUpdate(req.body);
    } catch (e) {
        console.error("Critical Error:", e.message); // رصد الأخطاء كما في السجلات السابقة
    }
    if (!res.writableEnded) res.status(200).send('OK');
};
