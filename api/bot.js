bot.start(async (ctx) => {
    const userId = ctx.from.id;
    const userName = ctx.from.first_name || "مستخدم جديد";

    // التحقق من وجود المستخدم في قاعدة البيانات وإضافته إن لم يوجد
    let user = data.users.find(u => u.id === userId);
    if (!user) {
        data.users.push({
            id: userId,
            name: userName,
            clients: {},
            expiries: {}
        });
        await writeData(data);
    }

    if (userId === ADMIN_ID) {
        // قائمة الأدمن: تظهر فقط لك
        const adminMenu = [
            ['⚙️ إدارة المشتركين', '👥 قائمة المسجلين'],
            ['📊 إحصائيات', '📋 حالتي']
        ];
        await ctx.reply("مرحباً بك أيها المدير. إليك لوحة التحكم الخاصة بـ Monsieur NFLIX:", Markup.keyboard(adminMenu).resize());
    } else {
        // قائمة الزبون: لا تحتوي على أي خيارات إدارية
        const userMenu = [
            ['🏠 طلب كود نيتفليكس', '📋 حالتي']
        ];
        await ctx.reply(`مرحباً بك ${userName} في Monsieur NFLIX 🎬\nاستخدم القائمة أدناه لطلب الكود الخاص بك:`, Markup.keyboard(userMenu).resize());
    }
});
