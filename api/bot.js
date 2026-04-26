const { Telegraf, Markup } = require('telegraf');
const path = require('path');
require('dotenv').config({ path: path.resolve(process.cwd(), '.env') });
const { readData, writeData } = require('../lib/database');

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
const ADMIN_IDS = process.env.ADMIN_USER_IDS 
  ? process.env.ADMIN_USER_IDS.split(',').map(id => id.trim()) 
  : [process.env.ADMIN_USER_ID];

const WHATSAPP_URL = 'https://wa.me/213555862000?text=سلام،%20أريد%20الاستفسار%20عن%20اشتراك%20Mrnflix';

bot.start(async (ctx) => {
    const userId = ctx.from.id;
    const data = await readData();
    if (!data.users.find(u => u.id === userId)) {
        data.users.push({ id: userId, name: ctx.from.first_name, addedAt: new Date().toISOString(), tag: 'جديد' });
        await writeData(data);
    }

    // إنشاء لوحة المفاتيح
    let buttons = [['📋 حالتي', '📞 الدعم']];
    // إذا كان المستخدم مديراً، نضيف له زر الإدارة
    if (ADMIN_IDS.includes(String(userId))) {
        buttons.push(['⚙️ إدارة المشتركين']);
    }

    ctx.replyWithHTML(`👋 مرحباً بك في <b>Mrnflix</b>!\nID الخاص بك هو: <code>${userId}</code>`, 
    Markup.keyboard(buttons).resize());
});

// --- قسم الإدارة بالأزرار ---
bot.hears('⚙️ إدارة المشتركين', async (ctx) => {
    if (!ADMIN_IDS.includes(String(ctx.from.id))) return;
    const data = await readData();
    if (data.users.length === 0) return ctx.reply('لا يوجد مستخدمون حالياً.');

    ctx.reply('اختر مستخدماً لتعديل تاريخ انتهائه:', 
        Markup.inlineKeyboard(
            data.users.map(u => [Markup.button.callback(`${u.name} (${u.id})`, `edit_${u.id}`)])
        )
    );
});

// التعامل مع الضغط على اسم المستخدم
bot.action(/edit_(.+)/, async (ctx) => {
    const userId = ctx.match[1];
    ctx.answerCbQuery();
    ctx.replyWithHTML(`أرسل الآن التاريخ الجديد للمستخدم <code>${userId}</code> بصيغة:\n\n <code>set ${userId} 2026-05-30</code>\n\n(يمكنك نسخ الرقم ولصقه للتسهيل)`);
});

// الردود العادية
bot.hears('📋 حالتي', async (ctx) => {
    const data = await readData();
    const user = data.users.find(u => u.id === ctx.from.id);
    if (!user || !user.expiryDate) return ctx.reply('ℹ️ لا يوجد اشتراك مسجل حالياً. تواصل مع الدعم للتفعيل.');
    ctx.replyWithHTML(`👤 الحالة: مشترك نشط\n📅 تاريخ الانتهاء: <code>${user.expiryDate}</code>`);
});

bot.hears('📞 الدعم', (ctx) => {
    ctx.reply('للتحدث مع الدعم الفني، اضغط على الزر أدناه:', 
    Markup.inlineKeyboard([[Markup.button.url('🟢 مراسلة عبر واتساب', WHATSAPP_URL)]]));
});

// بقاء أمر السيت القديم للاحتياط
bot.hears(/^set (\d+) (\d{4}-\d{2}-\d{2})$/, async (ctx) => {
    if (!ADMIN_IDS.includes(String(ctx.from.id))) return;
    const [_, id, date] = ctx.match;
    const data = await readData();
    const idx = data.users.findIndex(u => u.id === Number(id));
    if (idx !== -1) {
        data.users[idx].expiryDate = date;
        await writeData(data);
        ctx.reply(`✅ تم تحديث تاريخ ${data.users[idx].name} إلى ${date}`);
    } else {
        ctx.reply('❌ المستخدم غير موجود.');
    }
});

module.exports = async (req, res) => {
    if (req.body) await bot.handleUpdate(req.body);
    res.status(200).send('OK');
};
