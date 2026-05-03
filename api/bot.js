const { Telegraf, Markup } = require('telegraf');
const { readData, writeData } = require('../lib/database');

const bot = new Telegraf('8459897834:AAH-gSqYBIExQJXkDc8OYltOpH7vq2WubNc');
const ADMIN_ID = 6197540099;

module.exports = async (req, res) => {
    // استجابة سريعة لمنع أخطاء Vercel 500
    if (req.method !== 'POST') return res.status(200).send('Monsieur NFLIX System: Active');

    try {
        let data = await readData();
        
        // التأكد من هيكلية البيانات لتجنب انهيار الكود
        if (!data || !data.users) {
            data = { users: [] };
        }

        // 1. نظام البداية والتسجيل التلقائي
        bot.start(async (ctx) => {
            const userId = ctx.from.id;
            const userName = ctx.from.first_name || "مستخدم جديد";

            let user = data.users.find(u => u.id === userId);
            if (!user) {
                // تسجيل الزبون فوراً في JSONBin
                data.users.push({
                    id: userId,
                    name: userName,
                    clients: {},
                    expiries: {}
                });
                await writeData(data);
            }

            if (userId === ADMIN_ID) {
                const adminMenu = [['⚙️ إدارة المشتركين', '👥 قائمة المسجلين'], ['📊 إحصائيات', '📋 حالتي']];
                await ctx.reply("مرحباً بك أيها المدير في لوحة تحكم Monsieur NFLIX 🎬", Markup.keyboard(adminMenu).resize());
            } else {
                const userMenu = [['🏠 طلب كود نيتفليكس', '📋 حالتي']];
                await ctx.reply(`مرحباً بك ${userName} في Monsieur NFLIX 🎬\nاستخدم القائمة لطلب الكود الخاص بك.`, Markup.keyboard(userMenu).resize());
            }
        });

        // 2. نظام طلب الكود مع فحص الصلاحية لكل إيميل
        bot.hears('🏠 طلب كود نيتفليكس', async (ctx) => {
            const user = data.users.find(u => u.id === ctx.from.id);
            if (!user) return ctx.reply("❌ يرجى الضغط على /start للتسجيل أولاً.");

            const emails = Object.keys(user.clients || {});
            if (emails.length === 0) return ctx.reply("❌ ليس لديك حسابات مربوطة حالياً. تواصل مع الإدارة.");

            const today = new Date();
            let activeAccounts = [];

            for (const email of emails) {
                const expiryStr = user.expiries?.[email];
                const expiryDate = expiryStr ? new Date(expiryStr) : null;
                if (expiryDate && expiryDate >= today) activeAccounts.push(email);
            }

            if (activeAccounts.length === 0) {
                return ctx.reply("⚠️ <b>عذراً، اشتراكك منتهي!</b>\nيرجى التواصل مع @Monsieur_NFLIX للتجديد.", { parse_mode: 'HTML' });
            }

            const buttons = activeAccounts.map(email => [
                Markup.button.callback(`📺 كود: ${user.clients[email]}`, `get_code_${email}`)
            ]);
            await ctx.reply("اختر الحساب المطلوب:", Markup.inlineKeyboard(buttons));
        });

        // 3. لوحة تحكم الإدارة وعرض المسجلين
        bot.hears('👥 قائمة المسجلين', async (ctx) => {
            if (ctx.from.id !== ADMIN_ID) return;
            const allUsers = data.users.filter(u => u.id !== ADMIN_ID);
            if (allUsers.length === 0) return ctx.reply("❌ لا يوجد مسجلون حالياً.");

            let response = "👥 <b>قائمة المسجلين حالياً:</b>\n\n";
            allUsers.forEach((u, index) => {
                response += `${index + 1}. <b>${u.name}</b> (ID: <code>${u.id}</code>)\n`;
            });
            const buttons = allUsers.slice(0, 10).map(u => [Markup.button.callback(`⚙️ إدارة ${u.name}`, `view_user_${u.id}`)]);
            await ctx.reply(response, { parse_mode: 'HTML', ...Markup.inlineKeyboard(buttons) });
        });

        bot.hears('⚙️ إدارة المشتركين', async (ctx) => {
            if (ctx.from.id !== ADMIN_ID) return;
            const customers = data.users.filter(u => Object.keys(u.clients || {}).length > 0);
            if (customers.length === 0) return ctx.reply("❌ لا يوجد مشتركين بنظام الحسابات حالياً.");
            const buttons = customers.map(u => [Markup.button.callback(`👤 ${u.name}`, `view_user_${u.id}`)]);
            await ctx.reply("⚙️ اختر زبوناً:", Markup.inlineKeyboard(buttons));
        });

        // 4. معالجة العمليات التفاعلية (Inline Queries)
        if (req.body.callback_query) {
            const callbackData = req.body.callback_query.data;
            const fromId = req.body.callback_query.from.id;

            if (callbackData.startsWith('get_code_')) {
                const email = callbackData.replace('get_code_', '');
                await bot.telegram.sendMessage(fromId, `✅ تم طلب الكود لحساب ${email}. سيصلك فوراً.`);
            }

            if (fromId === ADMIN_ID && callbackData.startsWith('view_user_')) {
                const targetId = parseInt(callbackData.replace('view_user_', ''));
                const user = data.users.find(u => u.id === targetId);
                if (user) {
                    const emails = Object.keys(user.clients || {});
                    const buttons = emails.map(email => [Markup.button.callback(`📧 ${email}`, `manage_mail_${targetId}_${email}`)]);
                    buttons.push([Markup.button.callback('➕ ربط إيميل جديد', `ask_link_${targetId}`)]);
                    await bot.telegram.sendMessage(ADMIN_ID, `👤 <b>إدارة:</b> ${user.name}\nID: <code>${targetId}</code>`, { parse_mode: 'HTML', ...Markup.inlineKeyboard(buttons) });
                }
            }
        }

        // 5. أوامر الأدمن النصية (مثل ربط الحسابات)
        const text = req.body.message?.text || "";
        if (req.body.message?.from.id === ADMIN_ID) {
            if (text.startsWith('/link')) {
                const [_, targetId, email, ...prof] = text.split(' ');
                const user = data.users.find(u => u.id === parseInt(targetId));
                if (user) {
                    if (!user.clients) user.clients = {};
                    if (!user.expiries) user.expiries = {};
                    user.clients[email] = prof.join(' ');
                    user.expiries[email] = "2026-12-31"; // تاريخ افتراضي
                    await writeData(data);
                    await bot.telegram.sendMessage(ADMIN_ID, `✅ تم ربط ${email} بـ ${user.name}`);
                }
            }
        }

        await bot.handleUpdate(req.body);
    } catch (e) {
        console.error("Critical Error:", e.message);
    }
    
    if (!res.writableEnded) res.status(200).send('OK');
};
