"""Builds concept/en/*.html from the Arabic pages: same markup, English text, LTR, paths one folder up.
Also adds the language switch, hreflang alternates and the iPhone icon to the Arabic pages (idempotent).
Usage (from the project root): python -I source-files/tools/make_en.py ."""
import re, sys, os

ROOT = sys.argv[1]
SITE = 'https://www.puzzlexmedia.com'
PAGES = ['index.html', 'about.html', 'services.html', 'work.html', 'feedback.html', 'project.html', 'contact.html', 'privacy.html', '404.html']
AR = re.compile('[؀-ۿ]')

EN = {
# shared chrome
'PuzzleX Media — الرئيسية': 'PuzzleX Media — Home', 'القائمة': 'Menu', 'من نحن': 'About', 'خدماتنا': 'Services',
'أعمالنا': 'Work', 'الوضع الفاتح': 'Light mode', 'تواصل معنا': 'Contact us', 'جارٍ التحميل': 'Loading',
'قسمك الإبداعي الجاهز — وكالة تسويق وإبداع.': 'Your ready-made creative department — a marketing and creative agency.',
'روابط الموقع': 'Site links', 'الموقع': 'Site', 'الرئيسية': 'Home', 'تواصل': 'Contact',
'رقم الهاتف — يُضاف لاحقاً': 'Phone — coming soon', 'البريد الإلكتروني — يُضاف لاحقاً': 'Email — coming soon',
'تابعنا': 'Follow us', 'LinkedIn (الرابط يُضاف لاحقاً)': 'LinkedIn (link coming soon)',
'Instagram (الرابط يُضاف لاحقاً)': 'Instagram (link coming soon)', 'X (الرابط يُضاف لاحقاً)': 'X (link coming soon)',
'Facebook (الرابط يُضاف لاحقاً)': 'Facebook (link coming soon)', 'كل قطعة لها مكان.': 'Every piece has its place.',
'PuzzleX Media — نحن القطعة الناقصة في أحجيتك': 'PuzzleX Media — We are the missing piece in your puzzle',
'ابدأ مشروعك': 'Start your project', 'سياسة الخصوصية': 'Privacy policy',
# home
'PuzzleX Media — قسمك الإبداعي الجاهز': 'PuzzleX Media — Your ready-made creative department',
'نحن القطعة الناقصة في أحجيتك: تصميم، محتوى، تسويق وخدمات لينكدإن — قسمك الإبداعي الجاهز في الخليج.': 'We are the missing piece in your puzzle: design, content, marketing and LinkedIn services — your ready-made creative department in the Gulf.',
'الواجهة الرئيسية': 'Home hero', 'كل أحجية': 'Every puzzle', 'تنقصها قطعة': 'is missing a piece',
'مرّر لتكتمل الصورة': 'Scroll to complete the picture',
'وكالة تسويق وإبداع: هوية بصرية، سوشال ميديا، فيديو، محتوى تسويقي، خدمات لينكدإن وبرمجة.': 'A marketing and creative agency: visual identity, social media, video, copywriting, LinkedIn services and software development.',
'نحن القطعة الناقصة في أحجيتك — PuzzleX للتسويق والإنتاج الإعلامي': 'We are the missing piece in your puzzle — PuzzleX marketing and media production',
'شاهد أعمالنا': 'See our work', 'أعمالنا حسب نوع العمل': 'Our work by type',
'هوية بصرية': 'Visual identity', 'سوشال ميديا': 'Social media', 'مونتاج': 'Video editing', 'محتوى تسويقي': 'Copywriting',
'وهذه القطعة…': 'And this piece…', 'نحن': 'is us',
'قيمنا': 'Our values', 'الإبداع': 'Creativity',
'لأننا نؤمن بأن التميّز يبدأ بفكرة مبتكرة وغير مألوفة؛ فالمعتاد لم يعد يلفت الانتباه.': 'Because standing out starts with a fresh, unexpected idea — the usual no longer catches anyone’s eye.',
'الشغف': 'Passion',
'لأننا نصنع ما نحب ونحب ما نصنع؛ وينعكس هذا الشغف في كل تفصيلة من عملنا.': 'Because we make what we love and love what we make — and it shows in every detail of our work.',
'التأثير': 'Impact',
'لأن التصميم الناجح لا يكتفي بجماله؛ بل يترك أثراً ملموساً يمكن قياسه وتطويره باستمرار.': 'Because good design isn’t just beautiful — it leaves a real impact you can measure and keep improving.',
'التميّز': 'Excellence',
'لأننا ندرك أن أدق التفاصيل تصنع الفارق بين العمل الجيد والعمل الاستثنائي.': 'Because the smallest details are what separate good work from exceptional work.',
'شركاء النجاح': 'Partners in success',
'ماذا يقول عملاؤنا': 'What our clients say', 'أكمل رسالتك': 'Finish your message',
'كل آراء العملاء': 'All client feedback',
# feedback page (and its link in every menu)
'آراء العملاء': 'Feedback', 'آراء العملاء: تجارب حقيقية مع PuzzleX Media': 'Client feedback: real experiences with PuzzleX Media',
'ماذا يقول عملاء PuzzleX Media عن العمل معنا: آراء وتقييمات حقيقية من منظمات وشركات وعلامات تجارية.': 'What PuzzleX Media clients say about working with us: real reviews and ratings from organizations, companies and brands.',
'قطعٌ من الثقة،': 'Pieces of trust,', 'بكلماتهم.': 'in their words.',
'ما قاله شركاؤنا عن العمل معنا: عن الفكرة، والتنفيذ، والنتيجة التي وصلوا إليها.': 'What our partners said about working with us: the idea, the execution, and the results they reached.',
'تصفية الآراء': 'Filter reviews', '5 نجوم': '5 stars', '4 نجوم': '4 stars', 'مع صور': 'With photos',
'لم ننشر آراء العملاء هنا بعد — وقد يكون رأيك أول قطعة في هذه الصفحة.': 'No client reviews are published here yet — yours could be the first piece on this page.',
'رأيك هو القطعة التالية.': 'Your review is the next piece.',
'ابدأ مشروعك معنا، ونترك لك هذه المساحة لتكتب عن التجربة.': 'Start your project with us, and this space is yours to write about the experience.',
'بكلماتهم… عن القطع التي أكملناها معاً.': 'In their own words… about the pieces we completed together.',
'منظمات دولية وشركات ناشئة وعلامات راسخة… كلٌّ منها قطعة أكملنا معها أحجيتها.': 'International organizations, start-ups and established brands… each one a puzzle we helped complete.',
'القطعة التالية': 'The next piece', 'مكانك أنت.': 'is your spot.',
'يعرض هذا القسم شعارات 48 من شركاء النجاح.': 'This section shows the logos of 48 partners.',
# about
'من نحن — PuzzleX Media': 'About — PuzzleX Media',
'PuzzleX قسمك الإبداعي الجاهز: شريك استراتيجي يفهم السوق الخليجي ويحوّل أهدافك إلى حلول إبداعية.': 'PuzzleX, your ready-made creative department: a strategic partner who understands the Gulf market and turns your goals into creative solutions.',
'قسمك الإبداعي': 'Your ready-made', 'الجاهز.': 'creative department.',
'هي قسمك الإبداعي الجاهز؛ نعمل كشريك استراتيجي يساعدك على تحقيق أهدافك في السوق الخليجي من خلال فهم عميق للسوق، وتحليل دقيق لاحتياجات جمهورك، وتنفيذ حلول إبداعية تواكب تطلعاتك.': 'is your ready-made creative department. We work as a strategic partner that helps you reach your goals in the Gulf market, through a deep understanding of the market, careful analysis of what your audience needs, and creative work that keeps up with your ambitions.',
'اكتشف خدماتنا': 'Explore our services', 'لماذا نحن؟': 'Why us?',
'أربع قطع، كلٌّ منها سبب… ومعاً تكتمل الصورة.': 'Four pieces, each one a reason… together they complete the picture.',
'قسم إبداعي جاهز': 'A ready-made creative team',
'نختصر عليك وقت التوظيف والتدريب، إذ نعمل كقسم إبداعي متكامل وجاهز لخدمتك مباشرةً وتنفيذ المشاريع والخطط.': 'Skip the hiring and training: we work as a complete creative department, ready to serve you and deliver your projects and plans from day one.',
'فهم السوق المحلي': 'We know the local market',
'لدينا فهم لذائقة الجمهور الخليجي، ونحوّل هذا الفهم إلى حملات إعلانية مؤثرة تحقق صدى واسعاً.': 'We understand the taste of Gulf audiences and turn that into campaigns that land and travel far.',
'سرعة وعمق': 'Speed and depth',
'نقدّم حلولاً تجمع بين سرعة التنفيذ وعمق الفكر الإبداعي، لنضمن لك نتائج سريعة مدروسة دون المساس بجودة الفكرة.': 'Our work combines fast delivery with deep creative thinking, so you get quick, well-considered results without compromising the idea.',
'اتساق الهوية': 'A consistent identity',
'نحرص على الحفاظ على اتساق هوية علامتك التجارية عبر جميع نقاط التواصل، لضمان صورة متكاملة ومترابطة في كل منصة.': 'We keep your brand consistent across every touchpoint, so it looks whole and connected on every platform.',
'رؤيتنا': 'Our vision',
'أن نكون بحلول عام 2030 واحدة من أبرز الوكالات الإبداعية، وأن نكون نموذجاً يُحتذى به في بناء شراكات طويلة الأمد مع الشركات الطامحة للتوسّع عربياً.': 'By 2030, to be one of the leading creative agencies, and a model for long-term partnerships with companies looking to grow across the Arab world.',
'جاهزون لنكمل أحجيتك؟': 'Ready to complete your puzzle?',
'أخبرنا عن مشروعك، ونحن نضع كل قطعة في مكانها.': 'Tell us about your project, and we’ll put every piece in its place.',
# services
'خدماتنا — PuzzleX Media': 'Services — PuzzleX Media',
'خدمات PuzzleX الإبداعية والتسويقية: هويات بصرية، سوشال ميديا، مونتاج، محتوى تسويقي وخدمات لينكدإن.': 'PuzzleX creative and marketing services: visual identities, social media, video editing, marketing content and LinkedIn services.',
'كل خدمة قطعة': 'Every service is a piece', 'من أحجيتك.': 'of your puzzle.',
'نصمّم، ونصوّر، ونكتب، ونبرمج، وندير حضورك الرقمي — اختر القطع التي تحتاجها، ونحن نركّبها في صورة واحدة متكاملة.': 'We design, film, write, build software and run your digital presence — pick the pieces you need, and we’ll put them together into one complete picture.',
'ابدأ باختيار القطع': 'Start picking pieces', 'أقسام الخدمات': 'Service groups', 'التسويق': 'Marketing',
'لينكدإن': 'LinkedIn', 'الخدمات الإبداعية': 'Creative services',
'تصميم ومونتاج تحت سقف واحد: من هوية علامتك إلى آخر فيديو ينشر باسمها.': 'Design and video under one roof: from your brand identity to the latest video published in its name.',
'خدمات التصميم': 'Design', 'الهوية البصرية': 'Visual identity', 'تصميم وتطوير الهويات البصرية.': 'Designing and developing visual identities.',
'السوشال ميديا والإعلانات': 'Social media & ads', 'تصميم محتوى السوشيال ميديا والإعلانات.': 'Designing social media content and ads.',
'المطبوعات والإعلانات الطرقية': 'Print & outdoor', 'تصميم المطبوعات والإعلانات الطرقية.': 'Designing print materials and billboards.',
'البروفايلات والعروض': 'Profiles & decks', 'تصميم بروفايلات الشركات والعروض التقديمية.': 'Designing company profiles and presentations.',
'خدمات المونتاج': 'Video editing', 'المونتاج والإعلانات': 'Video & ads',
'الإعلانات بالذكاء الاصطناعي': 'AI-made ads', 'صور وفيديوهات إعلانية تُصنع بأدوات الذكاء الاصطناعي، أسرع وبتكلفة أقل.': 'Ad images and videos made with AI tools — faster and at a lower cost.',
'الأتمتة بالذكاء الاصطناعي (n8n)': 'AI automation (n8n)', 'سير عمل آلي على n8n يربط أدواتك، ويرد على عملائك، وينجز المهام المتكررة بالذكاء الاصطناعي.': 'Automated n8n workflows that connect your tools, reply to your customers and handle repetitive tasks with AI.',
'التجارة الإلكترونية': 'E-commerce', 'متاجر إلكترونية متكاملة مع المنتجات والدفع والشحن وإدارة الطلبات.': 'Complete online stores with products, payments, shipping and order management.', 'المونتاج الإعلاني': 'Ad editing', 'مونتاج إعلاني وتسويقي.': 'Editing for ads and marketing.',
'الفيديوهات التعريفية': 'Intro videos', 'تنفيذ فيديوهات تعريفية للشركات والأفراد.': 'Intro videos for companies and individuals.',
'فيديوهات المناسبات والفعاليات': 'Event videos',
'تعديل وإخراج الفيديوهات للمناسبات الاجتماعية والاجتماعات والفعاليات الرسمية.': 'Editing and producing videos for social occasions, meetings and official events.',
'الخدمات التسويقية': 'Marketing services', 'نُدير الحضور الرقمي للعلامات التجارية بطريقة منهجية، تشمل:': 'We run brands’ digital presence methodically, including:',
'كتابة المحتوى التسويقي': 'Marketing copywriting', 'خطة المحتوى الشهرية': 'Monthly content plan', 'التخطيط للمحتوى الشهري.': 'Planning each month’s content.',
'إدارة التفاعل': 'Community management', 'إدارة التفاعل على المنصات والردود.': 'Managing engagement and replies across platforms.',
'تحليل الأداء': 'Performance analysis', 'تحليل الأداء وتحسين النتائج (KPIs).': 'Analysing performance and improving results (KPIs).',
'خدمات لينكدإن': 'LinkedIn services', 'حضور مهني يفتح الأبواب، للأفراد وللشركات.': 'A professional presence that opens doors, for individuals and companies.',
'للأفراد': 'For individuals', 'للشركات': 'For companies',
'تحسين الحساب': 'Profile optimization', 'تحسين الحساب وصياغة عناوين وملخصات مقنعة مدعومة بكلمات مفتاحية.': 'Optimizing your profile with compelling, keyword-backed headlines and summaries.',
'محتوى أسبوعي متخصص': 'Weekly expert content', 'مقالات، صور، وفيديوهات قصيرة تبرز خبرتك وتزيد التفاعل.': 'Articles, images and short videos that showcase your expertise and drive engagement.',
'التقديم لفرص العمل': 'Job applications', 'تهيئة الملف والتوجيه في التقديم لفرص العمل.': 'Getting your profile ready and guiding you through job applications.',
'جلسات تدريب شخصية': '1:1 coaching', 'إرشاد عملي لاستخدام أدوات المنصة وتحويل التفاعل إلى فرص محتملة.': 'Hands-on guidance on the platform’s tools and on turning engagement into opportunities.',
'تدقيق حساب الشركة': 'Company page audit', 'تدقيق وتحسين حساب الشركة وتوحيد الهوية البصرية مع حسابات الموظفين وتواجد العلامة.': 'Auditing and improving your company page, and aligning its look with your employees’ profiles and your brand.',
'خطة محتوى مؤسسي': 'Corporate content plan', 'خطة محتوى مؤسسي شهرية، ومنشورات تسويقية.': 'A monthly corporate content plan and marketing posts.',
'استقطاب الكفاءات': 'Talent acquisition', 'استقطاب الكفاءات وإدارة عملية التوظيف.': 'Attracting talent and managing the hiring process.',
'حملات ممولة': 'Paid campaigns', 'حملات إعلانية ممولة مع تقارير أداء مفصلة.': 'Paid ad campaigns with detailed performance reports.',
'تعزيز الهوية الرقمية للشركة وفرقها على LinkedIn': 'Strengthening your company’s and your teams’ digital identity on LinkedIn',
'نجري تدقيقاً شاملاً لصفحة شركتكم ونعيد هيكلتها لضمان هوية رقمية متماسكة؛ ثم نتعاون مع فرق العمل داخلياً لتوحيد الهوية البصرية عبر حساباتهم الشخصية، وتدريبهم على أفضل الممارسات، مما يضاعف حضوركم ويُبرز ثقافة مؤسستكم على المنصة.': 'We run a full audit of your company page and restructure it for a coherent digital identity. Then we work with your teams to align the visual identity across their personal profiles and train them in best practices — multiplying your presence and showing off your company culture on the platform.',
'لم تجد القطعة التي تبحث عنها؟': 'Can’t find the piece you’re looking for?',
'أخبرنا بما تحتاجه، ونصمّم القطعة على مقاس أحجيتك.': 'Tell us what you need, and we’ll shape the piece to fit your puzzle.',
'البرمجة': 'Software', 'الخدمات البرمجية': 'Software services',
'أنظمة ومواقع وتطبيقات تُبنى على مقاس عملك: من إدارة العملاء والمبيعات، إلى نقطة البيع، إلى صفحة الهبوط.': 'Systems, websites and apps built around how your business works: from customers and sales, to the checkout counter, to the landing page.',
'الأنظمة': 'Systems', 'المواقع والتطبيقات': 'Websites & apps',
'أنظمة إدارة العملاء (CRM)': 'CRM systems', 'تطوير أنظمة CRM لإدارة العملاء والمبيعات ومتابعة الصفقات.': 'CRM systems to manage your customers and sales and keep track of deals.',
'أنظمة تخطيط الموارد (ERP)': 'ERP systems', 'أنظمة ERP تجمع المحاسبة والمخزون والمشتريات والموارد البشرية في مكان واحد.': 'ERP systems that bring accounting, inventory, purchasing and HR together in one place.',
'أنظمة نقاط البيع (POS)': 'POS systems', 'أنظمة نقاط بيع للمتاجر والمطاعم، مع المخزون والفواتير والتقارير.': 'Point-of-sale systems for shops and restaurants, with inventory, invoices and reports.',
'أنظمة ولوحات تحكم مخصصة': 'Custom systems & dashboards', 'أنظمة داخلية ولوحات تحكم تُبنى على طريقة عمل فريقك.': 'Internal systems and dashboards built around the way your team works.',
'صفحات الهبوط': 'Landing pages', 'صفحات هبوط سريعة ومقنعة تحوّل الزوار إلى عملاء.': 'Fast, persuasive landing pages that turn visitors into customers.',
'المواقع الإلكترونية': 'Websites', 'مواقع للشركات مع لوحة تحكم تعدّل منها المحتوى بنفسك.': 'Company websites with an admin panel so you can edit the content yourself.',
'المتاجر الإلكترونية': 'Online stores', 'متاجر إلكترونية متكاملة مع الدفع والشحن وإدارة الطلبات.': 'Complete online stores with payments, shipping and order management.',
'تطبيقات الجوال': 'Mobile apps', 'تطبيقات iOS وأندرويد لعملائك أو لفريقك.': 'iOS and Android apps for your customers or your team.',
'أحجيتك': 'Your puzzle', 'أحجيتك:': 'Your puzzle:', 'قطع': 'pieces', 'أرسلها لنا': 'Send it to us', 'إفراغ الأحجية': 'Clear the puzzle',
# work + project
'أعمالنا — PuzzleX Media': 'Work — PuzzleX Media',
'أعمال PuzzleX مع منظمات دولية وعلامات تجارية.': 'PuzzleX work with international organizations and brands.',
'قطع من أحجيات': 'Pieces from our', 'عملائنا.': 'clients’ puzzles.',
'من منظمات دولية إلى علامات تجارية ناشئة: مختارات من المشاريع التي أكملنا معها الصورة.': 'From international organizations to young brands: a selection of projects where we helped complete the picture.',
'المشاريع': 'Projects', 'تصفية حسب القطاع': 'Filter by sector', 'الكل': 'All',
'منظمات دولية وتنموية': 'International & development', 'تعليم وبحث علمي': 'Education & research', 'علامات تجارية': 'Brands',
'الصور المعروضة مؤقتة، وتُستبدل بملفات المشاريع الأصلية.': 'The images shown are placeholders and will be replaced with the original project files.',
'أحجيتك هي التالية.': 'Your puzzle is next.', 'أخبرنا عن مشروعك، ونضيفه إلى هذه الصفحة قريباً.': 'Tell us about your project — it could be on this page soon.',
'مشروع — PuzzleX Media': 'Project — PuzzleX Media', 'مشروع من أعمال PuzzleX.': 'A project from the PuzzleX portfolio.',
'كل الأعمال': 'All work', 'القطاع': 'Sector', 'القطع التي قدّمناها': 'Pieces we delivered', 'السنة': 'Year',
'معرض المشروع': 'Project gallery', 'الصور المعروضة مؤقتة، وتُستبدل بملفات المشروع الأصلية.': 'The images shown are placeholders and will be replaced with the original project files.',
'مشاريع أخرى': 'More projects', 'هل نكمل أحجيتك أنت أيضاً؟': 'Shall we complete your puzzle too?',
'اختر القطع التي تحتاجها، أو أخبرنا بما في ذهنك.': 'Pick the pieces you need, or tell us what you have in mind.',
# contact
'تواصل معنا — PuzzleX Media': 'Contact — PuzzleX Media', 'ابدأ مشروعك مع PuzzleX — قسمك الإبداعي الجاهز.': 'Start your project with PuzzleX — your ready-made creative department.',
'لنكمل أحجيتك': 'Let’s complete your puzzle', 'معاً.': 'together.',
'أخبرنا عن مشروعك والقطع التي تحتاجها، ونعود إليك لنرتّبها معاً في صورة واحدة.': 'Tell us about your project and the pieces you need, and we’ll get back to you to fit them into one picture.',
'الاسم': 'Name', 'الشركة أو العلامة': 'Company or brand', '(اختياري)': '(optional)', 'البريد الإلكتروني': 'Email',
'الهاتف أو واتساب': 'Phone or WhatsApp', 'القطع التي تحتاجها': 'The pieces you need',
'اخترت هذه القطع من صفحة الخدمات — يمكنك تعديلها هنا.': 'You picked these on the services page — you can change them here.',
'حدّثنا عن مشروعك': 'Tell us about your project', 'ما الذي تريد تحقيقه؟ ومن جمهورك؟': 'What do you want to achieve? Who is your audience?',
'أرسل القطعة': 'Send your piece', 'نموذج تجريبي: لا يُرسل أي بيانات حتى يُربط بالخادم.': 'Demo form: nothing is sent until it’s connected to a server.',
'وصلت قطعتك!': 'Your piece arrived!', 'شكراً': 'Thank you',
'— هذه نسخة تجريبية من النموذج، فلم تُرسل بياناتك بعد. عند ربطه بالخادم ستصلنا رسالتك مباشرة.': '— this is a demo version of the form, so your details haven’t been sent yet. Once it’s connected, your message will reach us directly.',
'أرسل رسالة أخرى': 'Send another message',
'نستخدم بياناتك فقط للرد على طلبك.': 'We only use your details to reply to your request.',
'— وصلتنا رسالتك، وسنعود إليك قريباً على بريدك الإلكتروني.': '— we’ve received your message and will get back to you by email soon.', 'تواصل مباشر': 'Direct contact', 'تفضّل بمراسلتنا عبر القناة التي تناسبك.': 'Reach us on whichever channel suits you.',
'الهاتف': 'Phone', 'يُضاف لاحقاً': 'coming soon',
'رقم واتساب يُضاف لاحقاً': 'WhatsApp number coming soon', 'واتساب': 'WhatsApp', 'تواصل معنا الآن': 'Talk with us now',
'طريقة الإرسال': 'How to send', 'أرسل بالبريد الإلكتروني': 'Send by email', 'أرسل عبر واتساب': 'Send on WhatsApp',
'— وصلنا طلبك، وسيتواصل معك فريقنا خلال 48 ساعة.': '— we’ve received your request, and our team will contact you within 48 hours.',
'— فتحنا لك واتساب وفيه تفاصيل طلبك جاهزة؛ اضغط «إرسال» هناك لتصلنا. سيتواصل معك فريقنا خلال 48 ساعة.': '— we’ve opened WhatsApp with your details ready; press “Send” there so they reach us. Our team will contact you within 48 hours.',
'أرسلنا تأكيداً إلى بريدك الإلكتروني.': 'We’ve sent a confirmation to your email.',
# seo titles and descriptions
'PuzzleX Media — وكالة تسويق وإبداع': 'PuzzleX Media — Marketing & Creative Agency',
'PuzzleX Media قسمك الإبداعي الجاهز: هوية بصرية، سوشال ميديا وإعلانات، مونتاج وفيديو، محتوى تسويقي، لينكدإن، وبرمجة الأنظمة والمواقع.': 'Your ready-made creative department: branding, social media and ad design, video, copywriting, LinkedIn, and software, websites and apps.',
'من نحن: قسمك الإبداعي الجاهز في الخليج — PuzzleX Media': 'About PuzzleX Media — Your Ready-Made Creative Department',
'PuzzleX Media قسمك الإبداعي الجاهز: شريك استراتيجي يفهم السوق الخليجي، يختصر عليك التوظيف والتدريب، ويحوّل أهدافك إلى حلول إبداعية متّسقة.': 'PuzzleX Media is your ready-made creative department: a partner who knows the Gulf market, saves you hiring and training, and delivers consistent creative work.',
'خدماتنا: هوية بصرية، سوشال ميديا، مونتاج وبرمجة — PuzzleX Media': 'Services: Branding, Social Media, Video & Software — PuzzleX Media',
'هوية بصرية، تصميم سوشال ميديا وإعلانات، مونتاج وفيديو، محتوى وحملات ممولة، خدمات لينكدإن، وأنظمة CRM وERP ونقاط البيع، والأتمتة بـ n8n، والمواقع والتطبيقات.': 'Visual identity, social media and ad design, video editing, copywriting and paid campaigns, LinkedIn services, CRM, ERP and POS systems, websites and apps.',
'أعمالنا: مشاريع تصميم ومحتوى وفيديو — PuzzleX Media': 'Our Work: Design, Content & Video Projects — PuzzleX Media',
'مختارات من مشاريع PuzzleX Media في التصميم والمحتوى والفيديو مع منظمات دولية وتنموية ومؤسسات تعليمية وعلامات تجارية.': 'Selected PuzzleX Media projects in design, content and video for international and development organizations, education institutions and brands.',
'تواصل معنا وابدأ مشروعك — PuzzleX Media': 'Contact Us — Start Your Project with PuzzleX Media',
'أخبرنا عن مشروعك واختر الخدمات التي تحتاجها: تصميم، فيديو، محتوى، تسويق، لينكدإن أو برمجة، ونعود إليك قريباً.': 'Tell us about your project and pick the services you need: design, video, content, marketing, LinkedIn or software, and we’ll get back to you soon.',
'قسمك الإبداعي الجاهز.': 'Your ready-made creative department.',
'شريك استراتيجي يفهم السوق الخليجي، ويحوّل أهدافك إلى حلول إبداعية تواكب تطلعاتك.': 'A strategic partner who understands the Gulf market and turns your goals into creative work that keeps up with your ambitions.',
# privacy
'سياسة الخصوصية — PuzzleX Media': 'Privacy policy — PuzzleX Media',
'كيف تتعامل PuzzleX Media مع البيانات التي ترسلها عبر نموذج التواصل.': 'How PuzzleX Media handles the details you send through the contact form.',
'ما الذي نجمعه عند استخدامك الموقع، ولماذا، وكم نحتفظ به، وكيف تطلب الاطلاع عليه أو حذفه.': 'What we collect when you use this site, why, how long we keep it, and how to ask to see or delete it.',
'آخر تحديث: 29 أكتوبر 2026': 'Last updated: 29 October 2026',
'ما الذي نجمعه': 'What we collect',
'عند إرسال نموذج التواصل: الاسم، والشركة إن كتبتها، والبريد الإلكتروني، والهاتف إن كتبته، والخدمات التي اخترتها، ونص رسالتك، ولغة الصفحة.': 'When you send the contact form: your name, your company if you give it, your email, your phone if you give it, the services you picked, your message, and the language of the page.',
'مع كل رسالة نسجّل وقت إرسالها وعنوان IP الذي أُرسلت منه، للحدّ من الرسائل المزعجة وإساءة الاستخدام.': 'With each message we record when it was sent and the IP address it came from, to limit spam and abuse.',
'إحصائيات الزيارة: الصفحات التي تفتحها، والأزرار والروابط التي تضغط عليها، والوقت في كل صفحة، والموقع الذي أتيت منه، ونوع جهازك ومتصفحك ولغة الصفحة. لا نحفظ عنوان IP لهذا الغرض: نحسب الزائر برمز يومي مجهول يتغيّر كل يوم ولا يمكن إرجاعه إليك.': 'Visit statistics: the pages you open, the buttons and links you click, the time on each page, the site you came from, your type of device and browser, and the page language. We don’t keep your IP address for this: a visitor is counted with an anonymous daily code that changes every day and can’t be traced back to you.',
'خلال زيارتك يحفظ متصفحك رمزاً عشوائياً يربط صفحات الزيارة الواحدة ببعضها، لنفهم كيف يتنقّل الزوار في الموقع. يُمسح الرمز تلقائياً عند إغلاق الصفحة، ولا يُحفظ أصلاً إن كان متصفحك يطلب عدم التتبّع.': 'During your visit, your browser keeps a random code that links the pages of that visit together, so we can see how visitors move around the site. The code is erased when you close the tab, and is never kept if your browser asks not to be tracked.',
'لماذا نستخدمها': 'Why we use it',
'الإحصائيات لتحسين الموقع فقط، وتُحفظ على خادمنا ولا تُرسل إلى Google أو أي جهة أخرى. وبيانات النموذج للرد على طلبك ومتابعته فقط. لا نرسل لك رسائل تسويقية بناءً على هذا النموذج، ولا نبيع بياناتك ولا نشاركها مع أي جهة لأغراضها الخاصة.': 'The statistics are only for improving the site; they stay on our own server and are never sent to Google or anyone else. The form’s details are only used to reply to your request and follow it up. We don’t send you marketing because you used this form, and we don’t sell your details or share them with anyone for their own purposes.',
'أين تُحفظ ومن يطّلع عليها': 'Where it is kept and who sees it',
'تُحفظ الرسائل على خادم الموقع، ولا يطّلع عليها إلا فريق PuzzleX المخوّل عبر لوحة تحكم محمية بكلمة مرور. وقد تصل نسخة من الرسالة إلى بريد الفريق عبر مزوّد البريد الإلكتروني الذي نستخدمه.': 'Messages are kept on the website’s server, and only authorized PuzzleX team members can see them, through a password-protected admin panel. A copy may also reach the team’s inbox through the email provider we use.',
'مدة الاحتفاظ': 'How long we keep it',
'نحتفظ بالرسالة ما دامت لازمة للرد على طلبك ومتابعة العمل معك، ثم نحذفها. ويمكنك طلب حذفها قبل ذلك في أي وقت. وتُحذف إحصائيات الزيارة تلقائياً بعد 13 شهراً.': 'We keep a message for as long as we need it to reply to you and to work with you, then delete it. You can ask us to delete it sooner at any time. Visit statistics are deleted automatically after 13 months.',
'ما يحفظه متصفحك': 'What your browser keeps',
'لا نستخدم ملفات تعريف الارتباط للإعلانات، ولا أدوات تحليل خارجية. يحفظ متصفحك على جهازك: اختيارك للوضع الفاتح أو الداكن، وأن شاشة التحميل ظهرت لك، والخدمات التي اخترتها حتى ترسل النموذج، ورمز الزيارة العشوائي المذكور أعلاه حتى تغلق الصفحة. يمكنك مسح ذلك في أي وقت من إعدادات متصفحك لهذا الموقع.': 'We use no advertising cookies and no outside analytics tools. Your browser keeps, on your device: your light or dark mode choice, that you have seen the loading screen, the services you picked until you send the form, and the random visit code described above until you close the tab. You can clear this at any time in your browser’s settings for this site.',
'خدمات خارجية': 'Outside services',
'تُحمَّل خطوط الموقع من Google Fonts، لذلك يصل إلى Google عنوان IP الخاص بك عند فتح الصفحة، كما يحدث مع أي ملف يُحمَّل من خادم آخر.': 'The site’s fonts load from Google Fonts, so Google receives your IP address when you open a page, as happens with any file loaded from another server.',
'حقوقك والتواصل معنا': 'Your rights and how to reach us',
'يمكنك طلب الاطلاع على بياناتك أو تصحيحها أو حذفها عبر': 'You can ask to see, correct or delete your details through the',
'صفحة التواصل': 'contact page',
'أو راسلنا مباشرة على البريد:': 'Or email us directly at:',
# 404
'الصفحة غير موجودة — PuzzleX Media': 'Page not found — PuzzleX Media',
'هذه القطعة ليست في مكانها.': 'This piece isn’t where it belongs.',
'ربما تغيّر الرابط أو نُقلت الصفحة. لكن كل قطعة لها مكان — جرّب أحد هذه:': 'The link may have changed or the page moved. But every piece has its place — try one of these:',
'اضغط القطعة لتعيدها إلى مكانها.': 'Click the piece to put it back.',
}
# the same Arabic word means something different on another page
PER_PAGE = {'services.html': {'الإبداع': 'Creative'}}

def translate(html, page):
    table = {**EN, **PER_PAGE.get(page, {})}
    missing = set()
    def text(seg):
        core = seg.strip()
        if not core or not AR.search(core): return seg
        if core not in table: missing.add(core); return seg
        return seg.replace(core, table[core])
    def attr(m):
        v = m.group(2)
        if not AR.search(v): return m.group(0)
        if v not in table: missing.add(v); return m.group(0)
        return f'{m.group(1)}"{table[v]}"'
    out, skip = [], False
    for tok in re.split(r'(<[^>]+>)', html):
        if tok.startswith('<'):
            low = tok.lower()
            if low.startswith('<script') and 'src=' not in low: skip = True
            if low.startswith('</script'): skip = False
            if low.startswith('<style'): skip = True
            if low.startswith('</style'): skip = False
            tok = re.sub(r'(\s[\w:-]+=)"([^"]*)"', attr, tok)
        elif not skip:
            tok = text(tok)
        out.append(tok)
    return ''.join(out), missing

def asset_up(m):
    attr, url = m.group(1), m.group(2)
    if re.match(r'(https?:|#|mailto:|tel:|data:|/|\.\./|\./)', url) or re.match(r'[\w-]+\.html', url): return m.group(0)
    return f'{attr}="../{url}"'

def switch(page, to_en):
    slug = '' if page == 'index.html' else page  # the home page's address is the folder itself
    if to_en: return f'<a class="lang-switch" href="en/{slug}" hreflang="en" lang="en" aria-label="English">EN</a>'
    return f'<a class="lang-switch" href="../{slug}" hreflang="ar" lang="ar" aria-label="العربية">ع</a>'

def head_extras(page, prefix):
    slug = '' if page == 'index.html' else page
    return (f'<link rel="apple-touch-icon" href="{prefix}assets/apple-touch-icon.png">\n'
            f'  <link rel="alternate" hreflang="ar" href="{SITE}/{slug}">\n'
            f'  <link rel="alternate" hreflang="en" href="{SITE}/en/{slug}">')

os.makedirs(os.path.join(ROOT, 'en'), exist_ok=True)
report = {}
for page in PAGES:
    src = os.path.join(ROOT, page)
    if not os.path.exists(src): continue
    ar = open(src, encoding='utf-8').read()
    icon = '<link rel="icon" href="assets/icon.svg" type="image/svg+xml">'
    is404 = page == '404.html'
    # Arabic page: language switch + head extras (once)
    if 'class="lang-switch"' not in ar and not is404:
        ar = ar.replace('<div class="top-actions">', '<div class="top-actions">\n          ' + switch(page, True), 1)
    if 'apple-touch-icon' not in ar and not is404:
        ar = ar.replace(icon, icon + '\n  ' + head_extras(page, ''), 1)
    open(src, 'w', encoding='utf-8', newline='\n').write(ar)

    en, missing = translate(ar, page)
    en = en.replace('<html lang="ar" dir="rtl"', '<html lang="en" dir="ltr"', 1)
    en = en.replace('content="ar_AR"', 'content="en_US"')
    slug = '' if page == 'index.html' else page
    en = en.replace(f'<meta property="og:url" content="{SITE}/{slug}">', f'<meta property="og:url" content="{SITE}/en/{slug}">')
    en = en.replace(f'<link rel="canonical" href="{SITE}/{slug}">', f'<link rel="canonical" href="{SITE}/en/{slug}">')
    if is404:
        # pages link into /en/, assets stay at the root
        en = re.sub(r'href="/((?:[\w-]+\.html)?)"', lambda m: 'href="/en/' + m.group(1) + '"', en)
        en = en.replace('<a class="lang-switch" href="/en/" hreflang="en" lang="en" aria-label="English">EN</a>',
                        '<a class="lang-switch" href="/" hreflang="ar" lang="ar" aria-label="العربية">ع</a>')
    else:
        en = en.replace(switch(page, True), switch(page, False))
        en = re.sub(r'(\s(?:src|href))="([^"]+)"', asset_up, en)
    # forward arrows point the other way in English
    en = en.translate(str.maketrans({'←': '→', '→': '←'}))
    left = sorted({m for m in AR.findall(re.sub(r'<script(?![^>]*src)[\s\S]*?</script>', '', en))})
    open(os.path.join(ROOT, 'en', page), 'w', encoding='utf-8', newline='\n').write(en)
    report[page] = (sorted(missing), len(re.findall('[؀-ۿ]+', re.sub(r'<script(?![^>]*src)[\s\S]*?</script>', '', en))))
for p, (miss, n) in report.items():
    print(p, 'untranslated:', miss, '| arabic runs left:', n)
