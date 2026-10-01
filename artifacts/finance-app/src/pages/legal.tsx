import { useState } from "react";
import { Link } from "wouter";

// TODO(owner): fill these in before publishing. Google Play requires a real contact address.
const SUPPORT_EMAIL = "support@YOUR-DOMAIN.com";
const OPERATOR = "[Your name / company name]";
const COUNTRY = "[Your country of registration]";
const UPDATED = "2026-10-01";

type Lang = "ar" | "en";
type Section = { h: string; p: string[] };
type Doc = { title: string; sections: Section[] };

const privacy: Record<Lang, Doc> = {
  en: {
    title: "Privacy Policy",
    sections: [
      { h: "1. Who we are", p: [`Billy Bills AI ("the App") is operated by ${OPERATOR}, ${COUNTRY}. Contact: ${SUPPORT_EMAIL}.`] },
      {
        h: "2. Data we collect",
        p: [
          "Account data: name, email address and sign-in identifiers (including Google or Apple sign-in), handled by our authentication provider.",
          "Financial records you enter: accounts, balances, transactions, currencies, notes, trips, and clients (client name, phone number, notes).",
          "AI assistant data: your chat messages with the assistant and the actions it performs, and voice recordings you choose to send for transcription.",
          "Settings and preferences (language, currencies, exchange rates).",
          "Basic technical logs (request method, path and status code) used for security and debugging. We do not use advertising or analytics trackers.",
        ],
      },
      {
        h: "3. How we use it",
        p: ["To provide the App (store and show your records, generate reports and statements, back up and restore your data), to run the AI assistant, to secure the service and prevent abuse, and to respond to support requests. We do not sell your data and do not use it for advertising."],
      },
      {
        h: "4. Service providers who process data for us",
        p: [
          "Clerk (authentication). Railway (backend hosting and database). Vercel (web hosting).",
          "Google Gemini API: text of your AI chat messages, relevant parts of your financial records needed to answer you, and voice recordings are sent to Google to be processed and answered. Voice recordings are sent only for transcription and are not stored on our servers.",
          "These providers act under their own terms and privacy policies and may process data in countries other than yours.",
        ],
      },
      {
        h: "5. Third-party people's data",
        p: ["If you enter information about other people (such as client names and phone numbers), you are responsible for having the right to do so. We use it only to provide the App to you."],
      },
      {
        h: "6. Retention and deletion",
        p: [
          "We keep your data while your account is active. You can permanently delete your account and all associated data at any time from Settings inside the App, or via the page at /delete-account. Deletion removes your records from our database and your authentication account. Provider-side logs and backups may persist for a short period before expiring.",
          "You can also export your data at any time using the backup feature (Excel file).",
        ],
      },
      { h: "7. Security", p: ["Data is transmitted over HTTPS and access is restricted to your authenticated account. No system is perfectly secure, so please use a strong password and keep your own backups."] },
      { h: "8. Your rights", p: [`You can access, correct, export and delete your data through the App. For any request, or to ask a question about your data, email ${SUPPORT_EMAIL}.`] },
      { h: "9. Children and availability", p: ["The App is intended for adults (18+) and is not directed to children. The App is not offered to users in the European Union, the European Economic Area, the United Kingdom or the United States."] },
      { h: "10. Changes", p: ["We may update this policy. The date at the top shows the latest version; material changes will be notified in the App."] },
    ],
  },
  ar: {
    title: "سياسة الخصوصية",
    sections: [
      { h: "1. من نحن", p: [`تطبيق Billy Bills AI ("التطبيق") تشغّله ${OPERATOR}، ${COUNTRY}. للتواصل: ${SUPPORT_EMAIL}.`] },
      {
        h: "2. البيانات التي نجمعها",
        p: [
          "بيانات الحساب: الاسم والبريد الإلكتروني ومعرّفات تسجيل الدخول (بما فيها الدخول عبر Google أو Apple)، وتُعالج عبر مزوّد المصادقة.",
          "السجلات المالية التي تدخلها: الحسابات والأرصدة والمعاملات والعملات والملاحظات والرحلات والزبائن (اسم الزبون ورقم هاتفه وملاحظاته).",
          "بيانات المساعد الذكي: رسائلك مع المساعد والإجراءات التي ينفذها، والتسجيلات الصوتية التي ترسلها لتحويلها إلى نص.",
          "الإعدادات والتفضيلات (اللغة والعملات وأسعار الصرف).",
          "سجلات تقنية أساسية (نوع الطلب والمسار ورمز الحالة) لأغراض الأمان وإصلاح الأعطال. لا نستخدم أدوات تتبع إعلانية أو تحليلية.",
        ],
      },
      {
        h: "3. كيف نستخدمها",
        p: ["لتشغيل التطبيق (حفظ سجلاتك وعرضها وإنشاء التقارير وكشوف الحساب والنسخ الاحتياطي والاستعادة)، ولتشغيل المساعد الذكي، ولحماية الخدمة ومنع إساءة الاستخدام، وللرد على طلبات الدعم. لا نبيع بياناتك ولا نستخدمها للإعلانات."],
      },
      {
        h: "4. مزودو الخدمة الذين يعالجون البيانات نيابةً عنا",
        p: [
          "Clerk (المصادقة). Railway (استضافة الخادم وقاعدة البيانات). Vercel (استضافة الموقع).",
          "واجهة Google Gemini: يُرسَل إلى Google نص محادثاتك مع المساعد والأجزاء اللازمة من سجلاتك المالية للإجابة، إضافةً إلى التسجيلات الصوتية، لمعالجتها والرد عليك. تُرسل التسجيلات الصوتية للتحويل إلى نص فقط ولا نحفظها على خوادمنا.",
          "يعمل هؤلاء المزودون وفق شروطهم وسياسات خصوصيتهم، وقد تُعالج البيانات في دول غير دولتك.",
        ],
      },
      { h: "5. بيانات أشخاص آخرين", p: ["إذا أدخلت معلومات عن أشخاص آخرين (كأسماء الزبائن وأرقام هواتفهم) فأنت مسؤول عن امتلاك الحق في ذلك. نستخدمها فقط لتقديم التطبيق لك."] },
      {
        h: "6. الاحتفاظ والحذف",
        p: [
          "نحتفظ ببياناتك طالما حسابك فعّال. يمكنك حذف حسابك وكل بياناته نهائياً في أي وقت من الإعدادات داخل التطبيق أو من صفحة /delete-account. يؤدي الحذف إلى إزالة سجلاتك من قاعدة بياناتنا وحساب المصادقة الخاص بك. قد تبقى سجلات ونسخ احتياطية لدى المزودين لفترة قصيرة قبل أن تنتهي.",
          "يمكنك أيضاً تصدير بياناتك في أي وقت عبر ميزة النسخ الاحتياطي (ملف Excel).",
        ],
      },
      { h: "7. الأمان", p: ["تُنقل البيانات عبر HTTPS ويقتصر الوصول إليها على حسابك الموثّق. لا يوجد نظام آمن بشكل مطلق، لذا استخدم كلمة مرور قوية واحتفظ بنسخك الاحتياطية."] },
      { h: "8. حقوقك", p: [`يمكنك الاطلاع على بياناتك وتصحيحها وتصديرها وحذفها من خلال التطبيق. لأي طلب أو استفسار راسلنا على ${SUPPORT_EMAIL}.`] },
      { h: "9. الأطفال والتوفر", p: ["التطبيق مخصص للبالغين (18 سنة فأكثر) وغير موجّه للأطفال. التطبيق غير مقدّم للمستخدمين في الاتحاد الأوروبي والمنطقة الاقتصادية الأوروبية والمملكة المتحدة والولايات المتحدة."] },
      { h: "10. التغييرات", p: ["قد نحدّث هذه السياسة. يبيّن التاريخ في الأعلى آخر نسخة، وسنُعلمك داخل التطبيق بالتغييرات الجوهرية."] },
    ],
  },
};

const terms: Record<Lang, Doc> = {
  en: {
    title: "Terms of Use",
    sections: [
      { h: "1. Acceptance", p: [`By creating an account or using Billy Bills AI ("the App", operated by ${OPERATOR}) you agree to these terms. If you do not agree, do not use the App.`] },
      { h: "2. Eligibility", p: ["You must be at least 18 years old. The App is not offered to users in the European Union, the European Economic Area, the United Kingdom or the United States, and you must not use it from or for those regions."] },
      { h: "3. What the App is", p: ["The App is a tool for recording and organizing your own financial records. It is not accounting, tax, legal, investment or financial advice, and it is not a bank or payment service. It does not move money."] },
      {
        h: "4. AI assistant",
        p: ["The AI assistant can make mistakes, misunderstand voice or text, and perform wrong actions on your records (including creating, changing or deleting items). Always review what it did. Deletions require your explicit confirmation, but you remain responsible for checking results. Do not rely on it for tax, legal or financial decisions. Keep regular backups using the export feature."],
      },
      { h: "5. Your data and responsibilities", p: ["You own your data. You are responsible for the accuracy of what you enter, for having the right to enter information about other people (such as clients), for keeping your login secure, and for complying with the laws that apply to you. Do not misuse the service, attempt to break or overload it, or use it for unlawful activity."] },
      { h: "6. Paid features", p: ["Some features may become paid subscriptions in the future. If so, the price, billing period, renewal and cancellation terms will be shown clearly before you pay, and purchases made through Google Play are also subject to Google Play's terms and refund rules."] },
      { h: "7. Termination", p: ["You may delete your account at any time from Settings. We may suspend or end access if these terms are violated or to protect the service."] },
      { h: "8. Disclaimer and liability", p: ["The App is provided \"as is\" and \"as available\", without warranties of any kind. To the maximum extent permitted by law, we are not liable for indirect or consequential losses, lost profits, or data loss, and our total liability is limited to the amount you paid us in the previous 12 months (or zero if you paid nothing)."] },
      { h: "9. Changes and governing law", p: [`We may update these terms; continued use means acceptance. These terms are governed by the laws of ${COUNTRY}, without affecting any mandatory rights you have under your local law. Contact: ${SUPPORT_EMAIL}.`] },
    ],
  },
  ar: {
    title: "شروط الاستخدام",
    sections: [
      { h: "1. القبول", p: [`بإنشاء حساب أو استخدام Billy Bills AI ("التطبيق"، تشغّله ${OPERATOR}) فأنت توافق على هذه الشروط. إن لم توافق فلا تستخدم التطبيق.`] },
      { h: "2. الأهلية", p: ["يجب أن يكون عمرك 18 سنة على الأقل. التطبيق غير مقدّم للمستخدمين في الاتحاد الأوروبي والمنطقة الاقتصادية الأوروبية والمملكة المتحدة والولايات المتحدة، ولا يجوز استخدامه من هذه المناطق أو لأجلها."] },
      { h: "3. ما هو التطبيق", p: ["التطبيق أداة لتسجيل سجلاتك المالية الخاصة وتنظيمها. وهو ليس استشارة محاسبية أو ضريبية أو قانونية أو استثمارية أو مالية، وليس بنكاً أو خدمة دفع، ولا يحرّك الأموال."] },
      {
        h: "4. المساعد الذكي",
        p: ["قد يخطئ المساعد الذكي، وقد يسيء فهم الصوت أو النص، وقد ينفذ إجراءات خاطئة على سجلاتك (بما فيها الإنشاء أو التعديل أو الحذف). راجع دائماً ما فعله. تتطلب عمليات الحذف تأكيدك الصريح، لكنك تبقى مسؤولاً عن مراجعة النتائج. لا تعتمد عليه في قرارات ضريبية أو قانونية أو مالية. احتفظ بنسخ احتياطية دورية عبر ميزة التصدير."],
      },
      { h: "5. بياناتك ومسؤولياتك", p: ["بياناتك ملك لك. أنت مسؤول عن دقة ما تدخله، وعن امتلاك الحق في إدخال معلومات عن أشخاص آخرين (كالزبائن)، وعن حماية بيانات دخولك، وعن الالتزام بالقوانين التي تنطبق عليك. لا تسئ استخدام الخدمة ولا تحاول تعطيلها أو إرهاقها ولا تستخدمها في نشاط غير قانوني."] },
      { h: "6. الميزات المدفوعة", p: ["قد تصبح بعض الميزات اشتراكات مدفوعة مستقبلاً. وفي هذه الحالة سيُعرض السعر ومدة الفوترة والتجديد وشروط الإلغاء بوضوح قبل الدفع، وتخضع المشتريات عبر Google Play أيضاً لشروط Google Play وسياسة الاسترجاع الخاصة بها."] },
      { h: "7. الإنهاء", p: ["يمكنك حذف حسابك في أي وقت من الإعدادات. ويجوز لنا تعليق الوصول أو إنهاؤه عند مخالفة هذه الشروط أو لحماية الخدمة."] },
      { h: "8. إخلاء المسؤولية وحدودها", p: ["يُقدَّم التطبيق \"كما هو\" و\"حسب التوفر\" دون أي ضمانات. وبالحد الأقصى الذي يسمح به القانون، لا نتحمل مسؤولية الخسائر غير المباشرة أو التبعية أو الأرباح الفائتة أو فقدان البيانات، وتقتصر مسؤوليتنا الإجمالية على المبلغ الذي دفعته لنا خلال الأشهر الـ12 السابقة (أو صفر إن لم تدفع شيئاً)."] },
      { h: "9. التعديلات والقانون الواجب التطبيق", p: [`قد نعدّل هذه الشروط، واستمرارك في الاستخدام يعني قبولها. تخضع هذه الشروط لقوانين ${COUNTRY} دون المساس بأي حقوق إلزامية لك بموجب قانونك المحلي. للتواصل: ${SUPPORT_EMAIL}.`] },
    ],
  },
};

const deletion: Record<Lang, Doc> = {
  en: {
    title: "Delete your account",
    sections: [
      {
        h: "From inside the App (fastest)",
        p: ["Open the App, go to Settings, scroll to the bottom and tap \"Delete Account\". Confirm, and your account and all data are permanently deleted. The same option is available in Settings on the website."],
      },
      {
        h: "If you can't access the App",
        p: [`Email ${SUPPORT_EMAIL} from the address linked to your account with the subject "Delete my account". We will verify and delete your account and data.`],
      },
      {
        h: "What gets deleted",
        p: ["Your profile and sign-in account, all accounts, transactions, clients, trips, AI chat history and settings. This cannot be undone, so export a backup first from Settings if you want to keep a copy. Provider-side logs and backups may persist for a short period before expiring."],
      },
    ],
  },
  ar: {
    title: "حذف حسابك",
    sections: [
      {
        h: "من داخل التطبيق (الأسرع)",
        p: ["افتح التطبيق، اذهب إلى الإعدادات، انزل إلى الأسفل واضغط \"حذف الحساب\". أكّد، وسيُحذف حسابك وكل بياناته نهائياً. الخيار نفسه متوفر في إعدادات الموقع."],
      },
      {
        h: "إذا لم تستطع الدخول للتطبيق",
        p: [`راسلنا على ${SUPPORT_EMAIL} من البريد المرتبط بحسابك بعنوان "حذف حسابي". سنتحقق ونحذف حسابك وبياناتك.`],
      },
      {
        h: "ما الذي يُحذف",
        p: ["ملفك الشخصي وحساب الدخول وكل الحسابات والمعاملات والزبائن والرحلات وسجل محادثات المساعد والإعدادات. لا يمكن التراجع، لذلك صدّر نسخة احتياطية من الإعدادات أولاً إن أردت الاحتفاظ بنسخة. قد تبقى سجلات ونسخ احتياطية لدى المزودين لفترة قصيرة قبل أن تنتهي."],
      },
    ],
  },
};

function LegalPage({ docs, showUpdated = true }: { docs: Record<Lang, Doc>; showUpdated?: boolean }) {
  const [lang, setLang] = useState<Lang>("ar");
  const doc = docs[lang];
  return (
    <div dir={lang === "ar" ? "rtl" : "ltr"} className="min-h-screen bg-background text-foreground">
      <div className="max-w-2xl mx-auto px-5 py-8">
        <div className="flex items-center justify-between mb-6 text-sm">
          <Link href="/" className="text-primary hover:underline">Billy Bills AI</Link>
          <button onClick={() => setLang(lang === "ar" ? "en" : "ar")} className="px-3 py-1 rounded-lg border border-border hover:border-primary/50">
            {lang === "ar" ? "English" : "العربية"}
          </button>
        </div>
        <h1 className="text-2xl font-bold mb-1">{doc.title}</h1>
        {showUpdated && <p className="text-xs text-muted-foreground mb-6">{lang === "ar" ? "آخر تحديث" : "Last updated"}: {UPDATED}</p>}
        {doc.sections.map((s) => (
          <section key={s.h} className="mb-5">
            <h2 className="font-semibold mb-1.5">{s.h}</h2>
            {s.p.map((t, i) => (
              <p key={i} className="text-sm text-muted-foreground leading-relaxed mb-2">{t}</p>
            ))}
          </section>
        ))}
        <div className="mt-8 pt-4 border-t border-border text-xs text-muted-foreground flex gap-4 flex-wrap">
          <Link href="/privacy">{lang === "ar" ? "سياسة الخصوصية" : "Privacy Policy"}</Link>
          <Link href="/terms">{lang === "ar" ? "شروط الاستخدام" : "Terms of Use"}</Link>
          <Link href="/delete-account">{lang === "ar" ? "حذف الحساب" : "Delete account"}</Link>
        </div>
      </div>
    </div>
  );
}

export const PrivacyPage = () => <LegalPage docs={privacy} />;
export const TermsPage = () => <LegalPage docs={terms} />;
export const DeleteAccountPage = () => <LegalPage docs={deletion} showUpdated={false} />;
