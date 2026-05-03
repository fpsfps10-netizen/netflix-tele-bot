const { Telegraf, Markup } = require('telegraf');
const { readData, writeData } = require('../lib/database');

const bot = new Telegraf('8459897834:AAH-gSqYBIExQJXkDc8OYltOpH7vq2WubNc');
const ADMIN_ID = 6197540099;

module.exports = async (req, res) => {
    if (req.method !== 'POST') return res.status(200).send('Monsieur NFLIX System: Active');

    try {
        const data = await readData();

        // --- التعديل الجوهري: حفظ الزبون تلقائياً عند البداية ---
        bot.start(async (ctx) => {
            const userId = ctx.from.id;
            const userName = ctx.from.first_name || "مستخدم جديد";

            // التحقق إذا كان المستخدم مسجلاً مسبقاً
            let user = data.users.find(u => u.id === userId);
            
            if (!user) {
                // إضافة الزبون الجديد لقاعدة البيانات
                data.users.push({
                    id: userId,
                    name: userName,
                    clients: {},
                    expiries: {}
                });
                await writeData(data);
                console.log(`New user registered: ${userName}`);
            }

            let menu = [['🏠 طلب كود نيتفليكس', '📋 حالتي']];
            if (userId === ADMIN_ID) {
                menu.push(['⚙️ إدارة المشتركين', '👥 قائمة المسجلين']);
            }
            await ctx.reply(`مرحباً بيك ${userName} في Monsieur NFLIX 🎬`, Markup.keyboard(menu).resize());
        });

        // زر عرض المسجلين (سيعمل الآن بعد تسجيل الزبائن)
        bot.hears('👥 قائمة المسجلين', async (ctx) => {
            if (ctx.from.id !== ADMIN_ID) return;
            const allUsers = data.users.filter(u => u.id !== ADMIN_ID);
            
            if (allUsers.length === 0) {
                return ctx.reply("❌ قاعدة البيانات فارغة. اطلب من الزبائن الضغط على /start أولاً.");
            }

            let response = "👥 <b>قائمة المسجلين حالياً:</b>\n\n";
            allUsers.forEach((u, index) => {
                response += `${index + 1}. <b>${u.name}</b> (ID: <code>${u.id}</code>)\n`;
            });
            
            const buttons = allUsers.map(u => [Markup.button.callback(`⚙️ إدارة ${u.name}`, `view_user_${u.id}`)]);
            await ctx.reply(response, { parse_mode: 'HTML', ...Markup.inlineKeyboard(buttons) });
        });

        // بقية معالجات الأزرار والأوامر (نفس الكود السابق)
        // ... (إدارة المشتركين، طلب الكود، إلخ)

        await bot.handleUpdate(req.body);
    } catch (e) { console.error("Error:", e.message); }
    if (!res.writableEnded) res.status(200).send('OK');
};
