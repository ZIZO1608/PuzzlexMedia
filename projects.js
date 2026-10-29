/* PuzzleX — project data for the work grid and the project pages.
   Every description sticks to what the company's portfolio PDF shows; images are placeholders until the
   real project files arrive. `logo` is the partner logo cut from the PDF (assets/partners/pNN.webp). */

const SECTORS = {
  org: 'منظمات دولية وتنموية',
  academic: 'تعليم وبحث علمي',
  brand: 'علامات تجارية',
};

const PROJECTS = [
  {
    id: 'lcoy', client: 'LCOY Syria 2025', title: 'مؤتمر الشباب المحلي للتغير المناخي', sector: 'org', year: 2025,
    logo: 'p29', colors: ['#1f8f63', '#0b3d2d'], services: ['هوية فعالية', 'سوشال ميديا', 'مطبوعات'],
    summary: 'المحتوى البصري الكامل لمؤتمر الشباب المحلي للتغير المناخي في سوريا 2025: منشورات توعوية بأسلوب الكولاج، إعلانات جلسات النقاش المركّزة في المحافظات، وأجندة المؤتمر.',
  },
  {
    id: 'unicef-amen', client: 'UNICEF', title: 'هوية مشروع «آمن»', sector: 'org',
    logo: 'p06', colors: ['#1cabe2', '#0a5b80'], services: ['هوية بصرية', 'تطبيقات الهوية'],
    summary: 'هوية بصرية كاملة لمشروع «آمن»، وتطبيقاتها على القرطاسية والحقائب والملابس والمواد التوعوية.',
  },
  {
    id: 'unicef-safe-step', client: 'UNICEF', title: 'ورشة «خطوة أمان»', sector: 'org',
    logo: 'p06', colors: ['#2a6fa8', '#122c47'], services: ['هوية فعالية', 'مطبوعات'],
    summary: 'مواد ورشة العمل الوطنية «خطوة أمان» للتوعية بمخاطر الذخائر المتفجرة ودعم الضحايا: الدعوات، الرول أب، الملفات والحقائب.',
  },
  {
    id: 'unicef-mental-health', client: 'UNICEF', title: 'اليوم العالمي للصحة النفسية', sector: 'org',
    logo: 'p06', colors: ['#2e9d6a', '#124d33'], services: ['حملة توعوية', 'سوشال ميديا'],
    summary: 'حملة توعوية لليوم العالمي للصحة النفسية: سلسلة منشورات حول الصحة النفسية في مكان العمل وللأطفال.',
  },
  {
    id: 'undp', client: 'UNDP', title: 'مشاريع ومعرض «مبدعات»', sector: 'org',
    logo: 'p03', colors: ['#0468b1', '#022c4d'], services: ['مطبوعات', 'لوحات طرقية', 'سوشال ميديا'],
    summary: 'مواد مشاريع برنامج الأمم المتحدة الإنمائي: إعلانات فرص العمل، الرول أب، اللوحات الطرقية، ومنشورات معرض «مبدعات» للصناعات اليدوية في حلب.',
  },
  {
    id: 'weworld', client: 'WeWorld · GVC', title: 'كتالوج «مجتمعات تعليمية دامجة»', sector: 'org',
    logo: 'p05', colors: ['#f08a24', '#8a430a'], services: ['كتالوج', 'مطبوعات'],
    summary: 'تصميم كتالوج كامل لمشروع تجريبي يعتمد نهجاً مجتمعياً للتعليم الدامج في حلب ودير الزور.',
  },
  {
    id: 'safierr', client: 'SAFIERR', title: 'مؤتمرا SAFIERR Reef وTech', sector: 'academic',
    logo: 'p48', colors: ['#2a2380', '#0d0b2e'], services: ['هوية فعالية', 'سوشال ميديا', 'موشن وفيديو'],
    summary: 'الهوية والمحتوى لمؤتمرين علميين: منشورات المحاور البحثية، دعوات المشاركة العلمية، وفيديوهات «Save the date».',
  },
  {
    id: 'academic-forum', client: 'المنتدى الأكاديمي السوري', title: 'الهوية والمحتوى', sector: 'academic',
    logo: 'p31', colors: ['#1e5aa8', '#0b2447'], services: ['هوية بصرية', 'سوشال ميديا'],
    summary: 'هوية المنتدى الأكاديمي السوري للابتكار والتعليم والبحث والإصلاح، وسلسلة منشورات حول محاوره ومؤتمراته.',
  },
  {
    id: 'coffee-021', client: '021 Coffee Shop', title: 'هوية «Zero Twenty One»', sector: 'brand',
    logo: 'p38', colors: ['#0b7a3b', '#05351a'], services: ['هوية بصرية', 'تطبيقات الهوية', 'سوشال ميديا'],
    summary: 'هوية بصرية كاملة لمقهى «021» وتطبيقاتها على الأكواب والقوائم والملابس، مع إدارة محتوى السوشال ميديا ومواسمه.',
  },
  {
    id: 'crown-stone', client: 'Crown Stone', title: 'محتوى معرض الرخام', sector: 'brand',
    logo: 'p32', colors: ['#25305a', '#0b1022'], services: ['سوشال ميديا', 'هوية بصرية'],
    summary: 'محتوى سوشال ميديا لمعرض رخام بأسلوب فني: سلسلة «أنواع الرخام» والرخام معروضاً كلوحات فنية، إلى جانب هوية العلامة.',
  },
  {
    id: 'royal', client: 'Royal', title: 'مصنعا رويال للأخشاب والزجاج', sector: 'brand',
    logo: 'p27', colors: ['#1f6b3a', '#0b2d17'], services: ['سوشال ميديا', 'كتالوج', 'هوية بصرية'],
    summary: 'محتوى السوشال ميديا وكتالوج الأبواب لمصنع رويال للأخشاب، والهوية البصرية لمصنع رويال للزجاج.',
  },
  {
    id: 'yallago', client: 'YallaGo!', title: 'حملة «التكسي على باب بيتك»', sector: 'brand',
    logo: 'p30', colors: ['#4a7fd0', '#1b3f78'], services: ['لوحات طرقية', 'حملة إعلانية'],
    summary: 'حملة لوحات طرقية لتطبيق طلب التكسي «يلاغو!»: رسائل قصيرة عن الأمان والسرعة والتوصيل حتى باب البيت.',
  },
  {
    id: 'chicago-gym', client: 'Chicago Gym', title: 'محتوى النادي الرياضي', sector: 'brand',
    logo: 'p39', colors: ['#c8202f', '#4a0a10'], services: ['سوشال ميديا'],
    summary: 'محتوى سوشال ميديا لنادٍ رياضي: برامج التدريب، دورات التايكوندو، النصائح الغذائية والمناسبات.',
  },
  {
    id: 'nutrition-360', client: '360 Nutrition', title: 'هوية علامة مكملات رياضية', sector: 'brand',
    logo: 'p16', colors: ['#2a2a2a', '#3d4a00'], services: ['هوية بصرية', 'تطبيقات الهوية'],
    summary: 'هوية بصرية لعلامة مكملات غذائية رياضية وتطبيقاتها على الملابس والملصقات والتغليف.',
  },
];

/* English pages (/en/): the same projects, translated; merged over the Arabic fields above */
const PROJECTS_EN = {
  'lcoy': { title: 'Local Conference of Youth on Climate Change', services: ['Event identity', 'Social media', 'Print'],
    summary: 'The full visual content for the Local Conference of Youth on climate change in Syria, 2025: collage-style awareness posts, announcements for the focused discussion sessions across the governorates, and the conference agenda.' },
  'unicef-amen': { title: '“Amen” project identity', services: ['Visual identity', 'Identity applications'],
    summary: 'A complete visual identity for the “Amen” project, applied to stationery, bags, clothing and awareness materials.' },
  'unicef-safe-step': { title: '“Safe Step” workshop', services: ['Event identity', 'Print'],
    summary: 'Materials for the national “Safe Step” workshop on explosive ordnance risk awareness and victim assistance: invitations, roll-ups, folders and bags.' },
  'unicef-mental-health': { title: 'World Mental Health Day', services: ['Awareness campaign', 'Social media'],
    summary: 'An awareness campaign for World Mental Health Day: a series of posts on mental health at work and for children.' },
  'undp': { title: 'Projects and the “Mubdi’at” exhibition', services: ['Print', 'Billboards', 'Social media'],
    summary: 'Materials for UNDP projects: job announcements, roll-ups, billboards, and posts for the “Mubdi’at” handicrafts exhibition in Aleppo.' },
  'weworld': { title: '“Inclusive Learning Communities” catalogue', services: ['Catalogue', 'Print'],
    summary: 'A complete catalogue for a pilot project taking a community-based approach to inclusive education in Aleppo and Deir ez-Zor.' },
  'safierr': { title: 'SAFIERR Reef and Tech conferences', services: ['Event identity', 'Social media', 'Motion & video'],
    summary: 'Identity and content for two scientific conferences: posts on the research tracks, calls for papers, and “Save the date” videos.' },
  'academic-forum': { client: 'Syrian Academic Forum', title: 'Identity and content', services: ['Visual identity', 'Social media'],
    summary: 'The identity of the Syrian Academic Forum for innovation, education, research and reform, and a series of posts on its themes and conferences.' },
  'coffee-021': { title: '“Zero Twenty One” identity', services: ['Visual identity', 'Identity applications', 'Social media'],
    summary: 'A complete visual identity for the “021” coffee shop, applied to cups, menus and clothing, plus its social media content and seasonal campaigns.' },
  'crown-stone': { title: 'Marble showroom content', services: ['Social media', 'Visual identity'],
    summary: 'Artful social media content for a marble showroom: a “Types of marble” series and marble presented as works of art, alongside the brand identity.' },
  'royal': { title: 'Royal wood and glass factories', services: ['Social media', 'Catalogue', 'Visual identity'],
    summary: 'Social media content and a door catalogue for the Royal wood factory, and the visual identity for the Royal glass factory.' },
  'yallago': { title: '“A taxi at your door” campaign', services: ['Billboards', 'Ad campaign'],
    summary: 'A billboard campaign for the YallaGo! taxi app: short messages about safety, speed and pick-up right at your door.' },
  'chicago-gym': { title: 'Gym content', services: ['Social media'],
    summary: 'Social media content for a gym: training programmes, taekwondo classes, nutrition tips and occasions.' },
  'nutrition-360': { title: 'Sports supplements brand identity', services: ['Visual identity', 'Identity applications'],
    summary: 'A visual identity for a sports nutrition brand, applied to clothing, stickers and packaging.' },
};
if (document.documentElement.lang === 'en') {
  Object.assign(SECTORS, { org: 'International & development', academic: 'Education & research', brand: 'Brands' });
  PROJECTS.forEach((p) => Object.assign(p, PROJECTS_EN[p.id]));
}
