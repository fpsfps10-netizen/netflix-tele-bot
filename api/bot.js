const { Telegraf, Markup } = require('telegraf');
const { readData, writeData } = require('../lib/database');
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

// معرف الأدمن (Monsieur NFLIX)
const ADMIN_ID = 6197540099;

// نصوص دليل الاستخدام بتنسيق HTML
const GUIDES = {
    admin: `⚙️ <b>قائمة أوامر الإدارة:</b>\n\n` +
           `<code>/make_reseller &lt;ID&gt;</code>\n` +
           `تعيين مستخدم كمورد (Reseller).\n\n` +
           `<code>/add_client &lt;email&gt; &lt;name&gt;</code>\n` +
           `إضافة حساب لزبائنك الشخصيين.\n\n` +
           `ℹ️ <b>معلومات:</b>\n` +
           `/my_id - عرض معرفك الخاص.\n` +
           `/support - عرض رسالة المساعدة.`,
    
    reseller: `📖 <b>دليل استخدام المورد:</b>\n\n` +
              `<code>/add_client &lt;email&gt; &lt;name&gt;</code>\n` +
              `ربط إيميل جديد باسم زبون لتوجيه الأكواد إليه آلياً.\n\n` +
              `ℹ️ <b>تنبيه:</b>\n` +
              `ستصلك تنبيهات الأكواد بأسماء زبائنك مباشرة هنا.`
};

module.exports = async (req, res) => {
    try {
        const data = await readData();

        // 1. معالجة توجيه الأكواد التلقائية (Webhooks الخارجية)
        if (req.body && req.body.to && req.body.content) {
            const emailTo = req.body.to.toLowerCase().trim();
            const content = req.body.content;
            const targetUsers = data.users.filter(u => 
                (u.emails && u.emails.includes(emailTo)) || (u.email && u.email === emailTo)
            );

            const codeMatch = content.match(/\b\d{4}\b/g);
            const validCode = codeMatch ? codeMatch[codeMatch.length - 1] : null;

            for (const u of targetUsers) {
                const displayName = (u.clients && u.clients[emailTo]) ? u.clients[emailTo] : "حسابك الشخصي";
                if (validCode) {
                    await bot.telegram.sendMessage(u.id, `👤 <b>المشترك: ${displayName}</b>\n🔢 الكود: <code>${validCode}</code>`, { parse_mode: 'HTML' });
                }
            }
            return res.status(200).send('OK');
        }

        if (!req.body || !req.body.message) return res.status(200).send('OK');

        const chatId = req.body.message.from.id;
        const text = req.body.message.text || "";

        // تسجيل المستخدم تلقائياً
        let user = data.users.find(u => u.id === chatId);
        if (!user) {
            user = { id: chatId, name: req.body.message.from.first_name, role: 'user', emails: [], clients: {} };
            data.users.push(user);
            await writeData(data);
        }
        
        const isReseller = user.role === 'reseller' || chatId === ADMIN_ID;

        // --- 2. الرد على نصوص الأزرار ---
        if (text === '🏠 طلب كود نيتفليكس') {
            await bot.telegram.sendMessage(chatId, "📩 من فضلك أرسل إيميل الحساب المطلوب كوده.");
            return res.status(200).send('OK');
        }

        if (text === '📋 حالتي') {
            const roleName = isReseller ? "مورد معتمد" : "زبون";
            await bot.telegram.sendMessage(chatId, `👤 الاسم: ${user.name}\n🎖️ الرتبة: ${roleName}\n🆔 ID: <code>${chatId}</code>`, { parse_mode: 'HTML' });
            return res.status(200).send('OK');
        }

        if (text === '📖 دليل الاستخدام' && isReseller) {
            const guideText = (chatId === ADMIN_ID) ? GUIDES.admin : GUIDES.reseller;
            await bot.telegram.sendMessage(chatId, guideText, { parse_mode: 'HTML' });
            return res.status(200).send('OK');
        }

        if (text === '⚙️ إدارة المشتركين' && isReseller) {
            await bot.telegram.sendMessage(chatId, "🛠️ لوحة الإدارة: استخدم <code>/add_client</code> لربط الزبائن.", { parse_mode: 'HTML' });
            return res.status(200).send('OK');
        }

        // --- 3. معالجة الأوامر البرمجية ---
        if (text === '/start' || text === '/support') {
            let buttons = [
                ['🏠 طلب كود نيتفليكس', '📋 حالتي'],
                ['🔄 تجديد الاشتراك', '📞 الدعم'],
                ['🔍 البحث عن زبون']
            ];
            if (isReseller) buttons.push(['📖 دليل الاستخدام', '⚙️ إدارة المشتركين']);
            
            await bot.telegram.sendMessage(chatId, "مرحباً بك في نظام Monsieur NFLIX الآلي:", Markup.keyboard(buttons).resize());
            return res.status(200).send('OK');
        }

        if (text.startsWith('/make_reseller') && chatId === ADMIN_ID) {
            const targetId = parseInt(text.split(' ')[1]);
            const userIndex = data.users.findIndex(u => u.id === targetId);
            if (userIndex !== -1) {
                data.users[userIndex].role = 'reseller';
                await writeData(data);
                await bot.telegram.sendMessage(chatId, `✅ تم تفعيل رتبة مورد لـ ${targetId}`);
                try { await bot.telegram.sendMessage(targetId, "🎊 مبروك! تم منحك صلاحيات مورد."); } catch(e){}
            }
            return res.status(200).send('OK');
        }

        if (isReseller && text.startsWith('/add_client')) {
            const parts = text.split(' ');
            if (parts.length >= 3) {
                const email = parts[1].toLowerCase().trim();
                const clientName = parts.slice(2).join(' ');
                if (!user.emails) user.emails = [];
                if (!user.clients) user.clients = {};
                if (!user.emails.includes(email)) user.emails.push(email);
                user.clients[email] = clientName;
                await writeData(data);
                await bot.telegram.sendMessage(chatId, `✅ تم ربط <code>${email}</code> بـ <b>${clientName}</b>`, { parse_mode: 'HTML' });
            }
            return res.status(200).send('OK');
        }

        await bot.handleUpdate(req.body);
    } catch (e) { console.error("Error:", e.message); }
    if (!res.writableEnded) res.status(200).send('OK');
};
