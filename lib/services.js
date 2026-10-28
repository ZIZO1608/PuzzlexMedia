/* The services a visitor can pick in the contact form, by id, with the names the team (ar) and the
   sender's confirmation email (ar / en) use. Keep the ids in step with SERVICE_GROUPS in pages.js. */
'use strict';

const SERVICES = {
  identity: { ar: 'الهوية البصرية', en: 'Visual identity' },
  'social-design': { ar: 'السوشال ميديا والإعلانات', en: 'Social media & ad design' },
  print: { ar: 'المطبوعات والإعلانات الطرقية', en: 'Print & outdoor ads' },
  profiles: { ar: 'البروفايلات والعروض', en: 'Company profiles & decks' },
  'ad-edit': { ar: 'المونتاج الإعلاني', en: 'Ad video editing' },
  'intro-videos': { ar: 'الفيديوهات التعريفية', en: 'Brand & intro videos' },
  'event-videos': { ar: 'فيديوهات المناسبات والفعاليات', en: 'Event videos' },
  'ai-ads': { ar: 'الإعلانات بالذكاء الاصطناعي', en: 'AI-made ads' },
  copywriting: { ar: 'كتابة المحتوى التسويقي', en: 'Marketing copywriting' },
  'content-plan': { ar: 'خطة المحتوى الشهرية', en: 'Monthly content plan' },
  community: { ar: 'إدارة التفاعل', en: 'Community management' },
  kpi: { ar: 'تحليل الأداء', en: 'Performance analysis' },
  'li-profile': { ar: 'لينكدإن · تحسين الحساب', en: 'LinkedIn · Profile optimization' },
  'li-content': { ar: 'لينكدإن · محتوى أسبوعي', en: 'LinkedIn · Weekly expert content' },
  'li-jobs': { ar: 'لينكدإن · التقديم لفرص العمل', en: 'LinkedIn · Job application support' },
  'li-coaching': { ar: 'لينكدإن · جلسات تدريب', en: 'LinkedIn · 1:1 coaching sessions' },
  'li-audit': { ar: 'لينكدإن · تدقيق حساب الشركة', en: 'LinkedIn · Company page audit' },
  'li-plan': { ar: 'لينكدإن · خطة محتوى مؤسسي', en: 'LinkedIn · Corporate content plan' },
  'li-talent': { ar: 'لينكدإن · استقطاب الكفاءات', en: 'LinkedIn · Talent acquisition' },
  'li-ads': { ar: 'لينكدإن · حملات ممولة', en: 'LinkedIn · Paid campaigns' },
  'dev-crm': { ar: 'برمجة · نظام CRM', en: 'Software · CRM system' },
  'dev-erp': { ar: 'برمجة · نظام ERP', en: 'Software · ERP system' },
  'dev-pos': { ar: 'برمجة · نظام نقاط البيع (POS)', en: 'Software · POS system' },
  'dev-custom': { ar: 'برمجة · نظام أو لوحة تحكم مخصصة', en: 'Software · Custom system or dashboard' },
  'dev-automation': { ar: 'برمجة · أتمتة بالذكاء الاصطناعي (n8n)', en: 'Software · AI automation (n8n)' },
  'dev-landing': { ar: 'برمجة · صفحة هبوط', en: 'Software · Landing page' },
  'dev-website': { ar: 'برمجة · موقع إلكتروني', en: 'Software · Website' },
  'dev-store': { ar: 'برمجة · تجارة إلكترونية (متجر)', en: 'Software · E-commerce store' },
  'dev-app': { ar: 'برمجة · تطبيق جوال', en: 'Software · Mobile app' },
  other: { ar: 'غير متأكد — يحتاج استشارة', en: 'Not sure yet — needs advice' },
};

// { id: name } in one language
const serviceNames = (lang) => Object.fromEntries(Object.entries(SERVICES).map(([id, n]) => [id, n[lang === 'en' ? 'en' : 'ar']]));

module.exports = { SERVICES, serviceNames };
