const { Telegraf, Markup } = require('telegraf');
const { readData, writeData } = require('../lib/database');

const bot = new Telegraf('8459897834:AAH-gSqYBIExQJXkDc8OYltOpH7vq2WubNc');
const ADMIN_ID = 6197540099;

module.exports = async (req, res) => {
    if (req.method !== 'POST') return res.status(200).send('Monsieur NFLIX System: Online');

    try {
        const data = await readData();

        // 1. استقبال تنبيهات MailNow (أكواد نيتفليكس)
        if (req.body && req.body.content) {
            const content = req.body.content;
            await bot.telegram.sendMessage(ADMIN_ID, `📩 <b>كود جديد من الإيميل:</b>\n\n<code>${content}</code>`, { parse_mode: 'HTML' });
            return res.status(200).send('OK');
        }

        // 2. إعداد أوامر البوت
        bot.start(async (ctx) => {
            const menu = [['🏠 طلب كود نيتفليكس', '📋 حالتي'], ['⚙️ إدارة المشتركين']];
            await ctx.reply("مرحباً بك في Monsieur NFLIX لبيع الاشتراكات الرقمية:", Markup.keyboard(menu).resize());
        });

        // 3. إضافة زبون جديد (بناءً على طلبك السابق)
        bot.command('add_client', async (ctx) => {
            if (ctx.from.id !== ADMIN_ID) return;
            const args = ctx.message.text.split(' ');
            if (args.length >= 3) {
                const newId = parseInt(args[1]);
                const name = args.slice(2).join(' ');
                data.users.push({ id: newId, name: name, clients: {}, expiries: {} });
                await writeData(data);
                await ctx.reply(`✅ تم إضافة الزبون: ${name}`);
            } else {
                await ctx.reply("⚠️ التنسيق: /add_client ID_USER NAME");
            }
        });

        // 4. نظام توزيع البروفايلات (1 TV و 4 Phone/PC)
        bot.hears('🏠 طلب كود نيتفليكس', async (ctx) => {
            await ctx.reply("⏳ جاري جلب أحدث كود من الإيميلات المستلمة...");
            // هنا يتم إضافة منطق جلب الكود الأخير المخزن
        });

        // 5. قائمة الإدارة (إظهار Wassim, Badi, إلخ)
        bot.hears('⚙️ إدارة المشتركين', async (ctx) => {
            if (ctx.from.id === ADMIN_ID) {
                const customers = data.users.filter(u => u.id !== ADMIN_ID);
                if (customers.length > 0) {
                    const buttons = customers.map(u => [Markup.button.callback(`👤 ${u.name}`, `view_${u.id}`)]);
                    await ctx.reply("⚙️ قائمة الزبائن المسجلين:", Markup.inlineKeyboard(buttons));
                } else {
                    await ctx.reply("❌ لا يوجد زبائن حالياً في قاعدة البيانات.");
                }
            }
        });

        // 6. عرض تفاصيل الزبون والتحكم (تجديد/حذف)
        bot.action(/view_(.+)/, async (ctx) => {
            const userId = parseInt(ctx.match[1]);
            const user = data.users.find(u => u.id === userId);
            const msg = `👤 <b>الزبون:</b> ${user.name}\n🆔 <b>ID:</b> <code>${user.id}</code>\n📅 <b>تاريخ الانتهاء:</b> ${user.expiry || 'غير محدد'}`;
            
            const buttons = [
                [Markup.button.callback('📅 تحديث الاشتراك', `renew_${userId}`)],
                [Markup.button.callback('🗑️ حذف الزبون', `delete_${userId}`)]
            ];
            await ctx.editMessageText(msg, { parse_mode: 'HTML', ...Markup.inlineKeyboard(buttons) });
        });

        // معالجة التحديث القادم من تليجرام
        await bot.handleUpdate(req.body);
        res.status(200).send('OK');

    } catch (err) {
        console.error("System Error:", err.message);
        res.status(200).send('Error Handled');
    }
};
