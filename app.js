/* Garant web app. The screens and styles come from the interface prototype;
   this file adds the working parts: map, search, accounts, reports, AI chat. */
(function () {
'use strict';

/* ================= state ================= */
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* private mode */ } }
};
const S = {
  lang: store.get('garant.lang', 'en') === 'ru' ? 'ru' : 'en',
  theme: (() => { const v = store.get('garant.theme', ''); if (v === 'dark' || v === 'light') return v; try { return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'; } catch (e) { return 'light'; } })(),
  m: window.innerWidth < 860,
  route: { name: 'home', id: null, q: '' },
  ready: false, user: null, profile: null, unread: 0, menu: false,
  signTab: 'in', authBusy: false, authErr: '', recovery: false,
  q: '', results: null, searchErr: '', filter: 'all', sel: 0,
  cand: store.get('garant.cand', null), checking: false,
  report: null, plot: null, saved: false, history: [], tab: 'risks', reportErr: '',
  chat: [], chatBusy: false, summary: null,
  plots: null, pfilter: 'all', notifs: null, nfilter: 'all'
};
let API = null;

/* ================= i18n: English is the source text, RU is the translation ================= */
const RU = {
'Home':'Главная','Search results':'Результаты поиска','Sign in':'Вход','Risk report':'Отчёт о рисках','AI assistant':'ИИ-помощник','My plots':'Мои участки','Notifications':'Уведомления',
'Address or cadastral number':'Адрес или кадастровый номер','Search':'Поиск','Kazakhstan':'Казахстан',
'This report is for reference only and does not replace a legal review. Data comes from OpenStreetMap and published akimat decrees and may be incomplete.':'Отчёт носит справочный характер и не заменяет юридическую проверку. Данные взяты из OpenStreetMap и опубликованных постановлений акиматов и могут быть неполными.',
'How it works':'Как это работает','Privacy':'Конфиденциальность','Help':'Помощь',
'Kazakhstan · free beta':'Казахстан · бесплатная бета','Check a plot before you buy':'Проверьте участок до покупки',
'Garant checks a plot against published seizure decrees and live map data: water, construction, planned roads and power lines nearby. Every risk lists its source and date.':'Garant сверяет участок с опубликованными постановлениями об изъятии и живыми данными карты: вода, стройки, планируемые дороги и ЛЭП рядом. У каждого риска указаны источник и дата.',
'Check plot':'Проверить участок','For example: 21-318-067-2166 or Kenesary 21, Astana':'Например: 21-318-067-2166 или Кенесары 21, Астана',
'Enter an address or cadastral number':'Введите адрес или кадастровый номер','We find the place on the map of Kazakhstan. You can also click the map.':'Найдём место на карте Казахстана. Можно просто кликнуть по карте.',
'Get a risk report':'Получите отчёт о рисках','Seizure lists, water, construction and planned roads nearby, each with a source and date.':'Списки изъятия, вода, стройки и планируемые дороги рядом, у каждого источник и дата.',
'Watch for changes':'Следите за изменениями','Save the plot: we re-check it and show what changed.':'Сохраните участок: мы перепроверяем его и показываем, что изменилось.',
'Where the data comes from':'Откуда данные','OpenStreetMap, live':'OpenStreetMap, в реальном времени','Akimat seizure decrees: Astana':'Постановления акимата об изъятии: Астана','Akimat seizure decrees: Almaty':'Постановления акимата об изъятии: Алматы','Land Code of Kazakhstan':'Земельный кодекс РК',
'Click the map to pick a place':'Кликните по карте, чтобы выбрать место','Click the map to move the point':'Кликните по карте, чтобы передвинуть точку',
'All':'Все','Addresses and buildings':'Адреса и здания','Streets and areas':'Улицы и районы','Seizure registry':'Реестр изъятия',
'Searching…':'Ищем…','Nothing found. Check the spelling or add the city name.':'Ничего не найдено. Проверьте написание или добавьте название города.',
'Search is temporarily unavailable. Try again in a minute.':'Поиск временно недоступен. Попробуйте через минуту.',
'This cadastral number is not in the seizure registry. To check map risks, search by address or click the map.':'Этого кадастрового номера нет в реестре изъятия. Чтобы проверить риски по карте, найдите участок по адресу или кликните по карте.',
'Type an address, a place or a cadastral number.':'Введите адрес, населённый пункт или кадастровый номер.',
'Land plot':'Земельный участок','Selected point':'Выбранная точка','Building':'Здание','Street':'Улица','Locality':'Населённый пункт','Area':'Территория','Place':'Объект','On a seizure list':'В списке изъятия','approximate location':'место указано приблизительно',
'Your risk report is ready':'Отчёт о рисках готов','Sign in or create an account to see the risks for this plot. It’s free.':'Войдите или зарегистрируйтесь, чтобы увидеть риски по этому участку. Это бесплатно.',
'Open the report to see the risks for this plot.':'Откройте отчёт, чтобы увидеть риски по этому участку.',
'Seizure lists for Astana and Almaty':'Списки изъятия по Астане и Алматы','Water, construction and roads within 500 m':'Вода, стройки и дороги в радиусе 500 м','Source and date for every risk':'Источник и дата каждого риска',
'Sign in to open report':'Войти и открыть отчёт','Create account':'Создать аккаунт','Open report':'Открыть отчёт','Report':'Отчёт',
'Checking the plot…':'Проверяем участок…','We are reading live map data and the seizure registry. This takes up to a minute when the map servers are busy.':'Читаем живые данные карты и реестр изъятия. Если серверы карты загружены, это занимает до минуты.',
'Sign in to Garant':'Вход в Garant','Sign in to open the plot report and watch for changes.':'Войдите, чтобы открыть отчёт по участку и следить за изменениями.',
'Sign up':'Регистрация','Email':'E-mail','Password':'Пароль','Forgot password?':'Забыли пароль?','New password':'Новый пароль','Save password':'Сохранить пароль','Set a new password':'Задайте новый пароль','Enter a new password for your account.':'Введите новый пароль для своего аккаунта.',
'Your password is stored encrypted. Your plots and reports are visible only to you.':'Пароль хранится в зашифрованном виде. Ваши участки и отчёты видны только вам.',
'Full name':'Имя','Create a free account to open reports and watch plots.':'Создайте бесплатный аккаунт, чтобы открывать отчёты и следить за участками.',
'At least 8 characters':'Не короче 8 символов','Enter a valid email address.':'Введите корректный e-mail.','The password must be at least 8 characters long.':'Пароль должен быть не короче 8 символов.','Enter your name.':'Введите имя.',
'Wrong email or password.':'Неверный e-mail или пароль.','This email is already registered. Sign in instead.':'Этот e-mail уже зарегистрирован. Войдите в аккаунт.','Too many attempts. Wait a minute and try again.':'Слишком много попыток. Подождите минуту и попробуйте снова.',
'Confirm your email first: open the link we sent you.':'Сначала подтвердите e-mail: откройте ссылку из письма.','We sent a confirmation link to your email. Open it to finish sign-up.':'Мы отправили ссылку для подтверждения на ваш e-mail. Откройте её, чтобы завершить регистрацию.',
'This password is too weak. Choose a longer one.':'Пароль слишком простой. Придумайте длиннее.','Something went wrong. Try again.':'Что-то пошло не так. Попробуйте ещё раз.','No connection to the server. Check the internet and try again.':'Нет связи с сервером. Проверьте интернет и попробуйте снова.',
'Enter your email above, then press “Forgot password?”.':'Введите e-mail выше и нажмите «Забыли пароль?».','If this email is registered, we sent a link to reset the password.':'Если этот e-mail зарегистрирован, мы отправили ссылку для сброса пароля.','Password saved.':'Пароль сохранён.','Password reset by email is not switched on yet. Write to the site owner.':'Сброс пароля по почте пока не включён. Напишите владельцу сайта.',
'Sign out':'Выйти','Signed out.':'Вы вышли из аккаунта.',
'Live data':'Живые данные','Watch this plot':'Следить за участком','Watching':'Отслеживается','Download PDF':'Скачать PDF','Check result':'Итог проверки','Checked':'Проверено',
'High risk':'Высокий риск','Medium risk':'Средний риск','Low risk':'Низкий риск','Low':'Низкий','Medium':'Средний','High':'Высокий','high':'высокий','medium':'средний','low':'низкий',
'Ask Garant AI about this plot':'Спросите ИИ Garant об этом участке','Plain-language answers based on this report and the published decrees.':'Ответы простым языком на основе отчёта и опубликованных постановлений.',
'Risks':'Риски','Projects & permits':'Проекты и изъятия','Projects':'Проекты','Documents':'Документы','Changes':'Изменения',
'Confidence':'Уверенность','Source':'Источник','Data as of':'Данные от',
'Project':'Проект','Distance':'Расстояние','Document':'Документ','Status':'Статус','Period':'Срок',
'this address':'этот адрес','in this city':'в этом городе','on the plot':'на участке','Seizure':'Изъятие','Under construction':'Строится','Planned':'Планируется','Construction site':'Стройплощадка','Road under construction':'Дорога строится','Planned road':'Планируемая дорога',
'No projects found near this plot.':'Проектов рядом с участком не найдено.','No documents for this plot.':'Документов по этому участку нет.',
'First check':'Первая проверка','Re-checked: no changes':'Перепроверено: без изменений','Risk level changed':'Уровень риска изменился','Risk level':'Уровень риска',
'Check again':'Проверить снова','The report could not be loaded.':'Не удалось загрузить отчёт.','Report not found. It may belong to another account.':'Отчёт не найден. Возможно, он принадлежит другому аккаунту.',
'Back to report':'Назад к отчёту','Garant AI':'ИИ Garant','Beta':'Бета','AI summary of this plot':'ИИ-сводка по участку',
'Ask a question':'Задайте вопрос','Try a question':'Попробуйте вопрос','Ask about this plot…':'Спросите об этом участке…','Send':'Отправить',
'Is it safe to buy this plot?':'Безопасно ли покупать этот участок?','What should I check before signing?':'Что проверить перед подписанием договора?','What do these risks mean if I want to build a house?':'Что эти риски значат, если я хочу построить дом?','Will I get compensation if the plot is seized?':'Получу ли я компенсацию, если участок изымут?',
'AI answers can be wrong. Check the cited documents before you make a decision.':'Ответы ИИ могут быть неточными. Перед решением проверьте указанные документы.',
'What the AI uses':'Что использует ИИ','This plot’s risk report':'Отчёт о рисках этого участка','Published akimat seizure decrees':'Опубликованные постановления акимата об изъятии','Garant AI is thinking…':'ИИ Garant думает…',
'You have used today’s 20 questions. Come back tomorrow.':'Вы использовали 20 вопросов на сегодня. Возвращайтесь завтра.','The AI is busy right now. Try again in a minute.':'ИИ сейчас занят. Попробуйте через минуту.','The AI assistant is not connected yet. The report itself works.':'ИИ-помощник пока не подключён. Сам отчёт работает.','The AI could not answer. Try again.':'ИИ не смог ответить. Попробуйте ещё раз.',
'Add plot':'Добавить участок','With changes':'С изменениями','New changes':'Есть изменения','Updated':'Обновлено','Not checked yet':'Ещё не проверен',
'You are not watching any plots yet.':'У вас пока нет участков под наблюдением.','Find a plot, open its report and press “Watch this plot”.':'Найдите участок, откройте отчёт и нажмите «Следить за участком».','Find a plot':'Найти участок',
'When a re-check finds a new risk or the risk level changes, the plot is marked “New changes” and a notification appears.':'Если перепроверка находит новый риск или меняется уровень риска, участок отмечается «Есть изменения» и появляется уведомление.',
'Unread':'Непрочитанные','unread':'непрочитанных','No notifications yet.':'Уведомлений пока нет.','They appear when a re-check of a watched plot finds changes.':'Они появляются, когда перепроверка отслеживаемого участка находит изменения.',
'Notification settings':'Настройки уведомлений','Shown here for':'Показываются здесь для','Risk level changes':'Изменение уровня риска','When a re-check gives a new level':'Когда перепроверка даёт новый уровень',
'New risks':'Новые риски','A new seizure decree, construction site or planned road':'Новое постановление об изъятии, стройка или планируемая дорога','Risks that disappeared':'Исчезнувшие риски','When a risk is no longer found':'Когда риск больше не находится',
'New risk found':'Найден новый риск','A risk is no longer found':'Риск больше не находится',
'Your plot':'Ваш участок','Water':'Вода','Construction':'Стройка','Power line':'ЛЭП','The map could not be loaded. Everything else works.':'Карту не удалось загрузить. Всё остальное работает.',
'Added to My plots. Changes will appear in Notifications.':'Участок добавлен в «Мои участки». Изменения появятся в уведомлениях.','Removed from My plots.':'Участок убран из отслеживания.',
'In the print window choose “Save as PDF”.':'В окне печати выберите «Сохранить как PDF».',
'Privacy policy':'Политика конфиденциальности','Garant is not set up yet':'Garant ещё не настроен','The site owner has to add the Supabase project address and key to config.js.':'Владельцу сайта нужно добавить адрес и ключ проекта Supabase в файл config.js.',
'Page not found':'Страница не найдена','Loading…':'Загрузка…','m²':'м²','m':'м','km':'км'
};
const t = (s) => (S.lang === 'ru' && RU[s]) || s;
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const T = (s) => esc(t(s));
const ru = () => S.lang === 'ru';
const L = (o, k) => (o && (o[k + '_' + S.lang] || o[k + '_ru'] || o[k + '_en'])) || '';
const safeUrl = (u) => (/^https:\/\//i.test(String(u || '')) ? String(u) : '#');
const pad = (n) => String(n).padStart(2, '0');
function fmtDate(v) { if (!v) return '—'; const d = new Date(v); if (isNaN(d)) return '—'; return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`; }
function fmtNum(n) { return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ru() ? ' ' : ','); }
function fmtDist(mtr) { if (mtr == null) return '—'; if (mtr <= 0) return t('on the plot'); return mtr >= 1000 ? `${(mtr / 1000).toFixed(1)} ${t('km')}` : `${fmtNum(mtr)} ${t('m')}`; }
const fmtArea = (a) => `${fmtNum(a)} ${t('m²')}`;
const LEVEL = { high: ['high', 'High', 'High risk'], mid: ['mid', 'Medium', 'Medium risk'], low: ['low', 'Low', 'Low risk'] };

/* ================= texts built from report data ================= */
const nm = (p) => (ru() ? p.name : (p.name_en || p.name)) || '';
const q = (s) => (ru() ? `«${s}»` : `“${s}”`);
function period(pr) {
  if (!pr || (!pr.period_from && !pr.period_to)) return '';
  if (pr.period_from && pr.period_to) return ru() ? ` Срок изъятия: ${fmtDate(pr.period_from)} – ${fmtDate(pr.period_to)}.` : ` Seizure period: ${fmtDate(pr.period_from)} – ${fmtDate(pr.period_to)}.`;
  return ru() ? ` Выкуп планируют завершить до ${fmtDate(pr.period_to || pr.period_from)}.` : ` The buyout is planned to finish by ${fmtDate(pr.period_to || pr.period_from)}.`;
}
function itemText(it) {
  const p = it.params || {}, pr = p.project || {}, d = fmtDist(p.distance), n = nm(p), hits = (p.hits || []).join('; ');
  const R = ru();
  switch (it.code) {
    case 'seizure_cadastral': return [R ? 'Кадастровый номер в списке изъятия' : 'Cadastral number is on a seizure list',
      (R ? `Этот кадастровый номер включён в список принудительного отчуждения для государственных нужд: ${L(pr, 'title')}. ${L(pr, 'purpose')}.` : `This cadastral number is listed for compulsory seizure for state needs: ${L(pr, 'title')}. ${L(pr, 'purpose')}.`) + period(pr)];
    case 'seizure_exact': return [R ? 'Адрес в списке изъятия' : 'Address is on a seizure list',
      (R ? `Этот адрес включён в список принудительного отчуждения для государственных нужд: ${L(pr, 'title')}. В списке: ${hits}.` : `This address is listed for compulsory seizure for state needs: ${L(pr, 'title')}. Listed as: ${hits}.`) + period(pr)];
    case 'seizure_street': return [R ? 'Изъятие на этой же улице' : 'Seizure on the same street',
      (R ? `На этой улице изымают другие адреса: ${hits}. Проект: ${L(pr, 'title')}. Убедитесь, что участок не затронут.` : `Other addresses on this street are being seized: ${hits}. Project: ${L(pr, 'title')}. Make sure this plot is not affected.`) + period(pr)];
    case 'seizure_locality': return [R ? 'Изъятие в этом же массиве' : 'Seizure in the same neighbourhood',
      (R ? `В этом же садовом товариществе или микрорайоне изымают участки (${p.count}): ${hits}. Проект: ${L(pr, 'title')}.` : `Plots in the same garden society or microdistrict are being seized (${p.count}): ${hits}. Project: ${L(pr, 'title')}.`) + period(pr)];
    case 'planned_road': {
      const built = p.status === 'construction';
      const where = p.distance <= 0 ? (R ? 'проходит по участку' : 'crosses the plot') : (R ? `в ${d} от участка` : `${d} from the plot`);
      return [built ? (R ? 'Рядом строится дорога' : 'Road under construction nearby') : (R ? 'Рядом планируется дорога' : 'Planned road nearby'),
        R ? `${n ? q(n) : (built ? 'Строящаяся дорога' : 'Планируемая дорога')} ${where}. На карте она отмечена как ${built ? 'строящаяся' : 'планируемая'}; землю вдоль неё могут занять под дорогу.`
          : `${n ? q(n) : (built ? 'A road under construction' : 'A planned road')} ${p.distance <= 0 ? 'crosses the plot' : 'is ' + where}. The map marks it as ${built ? 'under construction' : 'planned'}; land along it may be needed for the road.`];
    }
    case 'construction': return [R ? 'Строительство рядом' : 'Construction nearby',
      R ? `Стройплощадка${n ? ' ' + q(n) : ''} ${p.distance <= 0 ? 'на участке' : 'в ' + d}${p.count > 1 ? `; всего в радиусе 500 м: ${p.count}` : ''}. Ожидайте шум и трафик на время стройки.`
        : `A construction site${n ? ' ' + q(n) : ''} is ${p.distance <= 0 ? 'on the plot' : d + ' away'}${p.count > 1 ? `; ${p.count} sites within 500 m` : ''}. Expect noise and traffic while it is built.`];
    case 'water': return [R ? 'Вода рядом' : 'Water nearby',
      R ? `${n ? q(n) : 'Река, канал или озеро'} ${p.distance <= 0 ? 'на участке' : 'в ' + d + ' от участка'}. Узнайте историю паводков и границы водоохранной зоны: строить в ней ограничено.`
        : `${n ? q(n) : 'A river, canal or lake'} is ${p.distance <= 0 ? 'on the plot' : d + ' from the plot'}. Check the flood history and the water protection zone, where building is restricted.`];
    case 'power_line': {
      const kv = /^\d+$/.test(p.voltage || '') ? ` ${Math.round(p.voltage / 1000)} ${R ? 'кВ' : 'kV'}` : '';
      return [R ? 'Рядом высоковольтная ЛЭП' : 'High-voltage power line nearby',
        R ? `Линия электропередачи${kv} проходит ${p.distance <= 0 ? 'над участком' : 'в ' + d + ' от участка'}. В её охранной зоне строительство ограничено.` : `A power line${kv} runs ${p.distance <= 0 ? 'over the plot' : d + ' from the plot'}. Building is restricted inside its protection zone.`];
    }
    case 'major_road': return [R ? 'Рядом крупная дорога' : 'Major road nearby', R ? `${n ? q(n) : 'Крупная дорога'} в ${d}. Ожидайте шум и трафик.` : `${n ? q(n) : 'A major road'} is ${d} away. Expect noise and traffic.`];
    case 'railway': return [R ? 'Рядом железная дорога' : 'Railway nearby', R ? `Железная дорога в ${d}. Ожидайте шум и вибрацию.` : `A railway is ${d} away. Expect noise and vibration.`];
    case 'industrial': return [R ? 'Рядом промзона' : 'Industrial area nearby', R ? `Промышленная территория${n ? ' ' + q(n) : ''} ${p.distance <= 0 ? 'включает этот участок' : 'в ' + d}. Уточните санитарную зону в акимате.` : `An industrial area${n ? ' ' + q(n) : ''} ${p.distance <= 0 ? 'includes this plot' : 'is ' + d + ' away'}. Ask the akimat about its sanitary zone.`];
    case 'landfill': return [R ? 'Рядом полигон отходов' : 'Landfill nearby', R ? `Полигон отходов в ${d}. Возможны запах и ограничения по санитарной зоне.` : `A landfill is ${d} away. Expect smell and possible sanitary-zone restrictions.`];
    case 'cemetery': return [R ? 'Рядом кладбище' : 'Cemetery nearby', R ? `Кладбище${n ? ' ' + q(n) : ''} в ${d}. У кладбищ бывает санитарная зона, где жильё ограничено.` : `A cemetery${n ? ' ' + q(n) : ''} is ${d} away. Cemeteries can have a sanitary zone where housing is restricted.`];
    default: return [it.code, ''];
  }
}
function okText(o) {
  const p = o.params || {}, R = ru(), city = R ? p.city_ru : p.city_en;
  switch (o.code) {
    case 'no_water': return [R ? 'Воды в радиусе 200 м нет' : 'No water within 200 m', R ? 'Рек, каналов и озёр рядом с участком в OpenStreetMap нет.' : 'No rivers, canals or lakes near the plot in OpenStreetMap.'];
    case 'no_construction': return [R ? 'Строек и планируемых дорог в радиусе 500 м нет' : 'No construction or planned roads within 500 m', R ? 'По данным OpenStreetMap на дату проверки.' : 'According to OpenStreetMap on the day of the check.'];
    case 'no_seizure': return [R ? 'В списках изъятия не найден' : 'Not on the seizure lists', R ? `Адрес не совпал ни с одной из ${p.checked} записей реестра изъятия (${city}).` : `The address does not match any of the ${p.checked} entries in the seizure registry (${city}).`];
    case 'address_unknown': return [R ? 'Списки изъятия не сверены по адресу' : 'Seizure lists were not compared by address', R ? 'Во время проверки не удалось определить адрес точки. Нажмите «Проверить снова» через пару минут.' : 'The address of the point could not be determined during this check. Press “Check again” in a couple of minutes.'];
    case 'no_registry': return [R ? 'Списки изъятия для этого города не загружены' : 'Seizure lists are not loaded for this city', R ? 'В Garant есть постановления об изъятии только по Астане и Алматы. Уточните в местном акимате, нет ли постановлений по этому адресу.' : 'Garant has seizure decrees for Astana and Almaty only. Ask the local akimat about decrees for this address.'];
    case 'no_official_layers': return [R ? 'Красные линии и зоны затопления не проверены' : 'Red lines and flood zones are not checked', R ? 'Официальные красные линии, генплан и зоны затопления не публикуются как открытые данные. Запросите выписку из генплана в акимате.' : 'Official red lines, the master plan and flood zones are not published as open data. Request a master-plan extract from the akimat.'];
    case 'osm_unavailable': return [R ? 'Данные карты не загрузились' : 'Map data did not load', R ? 'OpenStreetMap не ответил во время проверки, объекты рядом не проверены. Нажмите «Проверить снова» через пару минут.' : 'OpenStreetMap did not answer during this check, so nearby objects were not checked. Press “Check again” in a couple of minutes.'];
    default: return [o.code, ''];
  }
}
function srcName(s) { if (!s) return '—'; if (s.name === 'registry') return ru() ? 'Реестр изъятия Garant' : 'Garant seizure registry'; if (s.name === 'official') return ru() ? 'Нет открытых данных' : 'No open data'; return s.name || '—'; }
function headline(data) {
  if (!data.items.length) return ru() ? 'В доступных данных рисков не найдено. Официальные красные линии и зоны затопления в эту проверку не входят.' : 'No risks were found in the available data. Official red lines and flood zones are not part of this check.';
  return itemText(data.items[0])[1];
}
function fallbackSummary(data) {
  const out = [];
  out.push(data.items.length ? itemText(data.items[0])[1] : headline(data));
  const warn = (data.ok || []).filter((o) => o.warn).map((o) => okText(o)[0]);
  if (warn.length) out.push((ru() ? 'Не проверено: ' : 'Not checked: ') + warn.join('; ').toLowerCase() + '.');
  out.push(ru() ? 'Покажите отчёт юристу и запросите выписку из генплана в акимате до подписания договора.' : 'Show this report to a lawyer and request a master-plan extract from the akimat before you sign.');
  return out;
}

/* ================= icons ================= */
const I = {
  search: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
  bell: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0"/></svg>',
  pin: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21Z"/><circle cx="12" cy="9.5" r="2.5"/></svg>',
  chev: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>',
  back: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>',
  eye: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>',
  check: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>',
  warn: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 8v5m0 3.5v.5"/><circle cx="12" cy="12" r="9"/></svg>',
  down: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12m0 0-4-4m4 4 4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/></svg>',
  lock: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>',
  shield: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6l-8-3Z"/></svg>',
  plus: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  send: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
  spark: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l1.8 4.9L19 9.7l-5.2 1.8L12 16.4l-1.8-4.9L5 9.7l5.2-1.8L12 3Z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15Z"/></svg>',
  doc: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9l-6-6Z"/><path d="M14 3v6h6"/></svg>'
};
const LOGO = '<svg width="30" height="30" viewBox="0 0 28 28" aria-hidden="true"><rect x="1" y="1" width="26" height="26" rx="8" fill="#0e9f4e"/><path d="M7 19.5 11.5 8l5 3.5L21 9v10.5H7Z" fill="none" stroke="#fff" stroke-width="1.7" stroke-linejoin="round"/><circle cx="16.5" cy="11.5" r="1.7" fill="#fff"/></svg>';

/* ================= shared pieces ================= */
function initials() {
  const n = (S.profile && S.profile.full_name) || (S.user && S.user.email) || '';
  const parts = n.split(/[\s@._-]+/).filter(Boolean);
  return ((parts[0] || '?')[0] + ((parts[1] || '')[0] || '')).toUpperCase();
}
const userName = () => (S.profile && S.profile.full_name) || (S.user && S.user.email) || '';
const THEME_ICO = {
  moon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z"/></svg>',
  sun: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
};
function applyTheme() {
  document.documentElement.dataset.theme = S.theme;
  const meta = document.querySelector('meta[name="theme-color"]'); if (meta) meta.content = S.theme === 'dark' ? '#0f1a14' : '#ffffff';
}
function setTheme(th, remember) {
  if (th === S.theme) return;
  S.theme = th; if (remember) store.set('garant.theme', th);
  store.set('garant.basemap2', '');   // the map follows the new theme
  applyTheme();
  document.querySelectorAll('[data-act="theme"]').forEach((b) => { b.innerHTML = th === 'dark' ? THEME_ICO.sun : THEME_ICO.moon; const l = t(th === 'dark' ? 'Light theme' : 'Dark theme'); b.title = l; b.setAttribute('aria-label', l); });
  document.querySelectorAll('.map-layers [data-base]').forEach((x) => { const on = x.dataset.base === curBase(); x.classList.toggle('on', on); x.setAttribute('aria-pressed', on); });
  restyleMaps();
}
applyTheme();
try { matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => { if (!store.get('garant.theme', '')) setTheme(e.matches ? 'dark' : 'light', false); }); } catch (e) { /* old browser */ }
function header(active) {
  const m = S.m, signed = !!S.user;
  const lang = `<div class="lang" role="group" aria-label="Language"><button type="button" data-lang="en" class="${S.lang === 'en' ? 'on' : ''}">EN</button><button type="button" data-lang="ru" class="${S.lang === 'ru' ? 'on' : ''}">RU</button></div>`;
  return `<header class="hdr">
    <a class="logo" href="#/">${LOGO}<span>Garant</span></a>
    ${m ? '' : `<form class="input hsearch" data-form="search" role="search">${I.search}<input type="search" name="q" placeholder="${T('Address or cadastral number')}" aria-label="${T('Search')}" value="${S.route.name === 'search' ? esc(S.q) : ''}"></form>`}
    <span class="sp"></span>
    ${signed && !m ? `<nav class="navl"><button type="button" data-href="#/plots" class="${active === 'plots' ? 'on' : ''}">${T('My plots')}</button></nav>` : ''}
    ${lang}
    <button type="button" class="icon-btn" data-act="theme" aria-label="${T(S.theme === 'dark' ? 'Light theme' : 'Dark theme')}" title="${T(S.theme === 'dark' ? 'Light theme' : 'Dark theme')}">${S.theme === 'dark' ? THEME_ICO.sun : THEME_ICO.moon}</button>
    ${signed
      ? `<button type="button" class="icon-btn" data-href="#/notifications" aria-label="${T('Notifications')}">${I.bell}${S.unread ? '<span class="dot"></span>' : ''}</button>
         <div class="acct"><button type="button" class="avatar" data-act="menu" aria-expanded="${S.menu}" aria-label="${esc(userName())}"><b>${esc(initials())}</b>${m ? '' : `<span>${esc(userName())}</span>`}</button>
         ${S.menu ? `<div class="panel menu"><span class="cap faint">${esc(S.user.email || '')}</span>${m ? `<button type="button" class="btn btn-s full" data-href="#/plots">${T('My plots')}</button>` : ''}<button type="button" class="btn btn-s full" data-act="signout">${T('Sign out')}</button></div>` : ''}</div>`
      : `<button type="button" class="btn ${m ? 'btn-g' : 'btn-s'}" data-href="#/login" style="${m ? 'padding:0 6px' : ''}">${T('Sign in')}</button>`}
  </header>`;
}
function footer() {
  return `<footer class="footer"><p>${T('This report is for reference only and does not replace a legal review. Data comes from OpenStreetMap and published akimat decrees and may be incomplete.')}</p>
  <nav><a href="#/">${T('How it works')}</a><a href="#/privacy">${T('Privacy')}</a><span>© 2026 Garant · © OpenStreetMap contributors</span></nav></footer>`;
}
const crumbs = (items) => `<nav class="crumbs">${items.map((x, i) => (i ? '<span>/</span>' : '') + (i === items.length - 1 ? `<b>${esc(x)}</b>` : `<span>${esc(x)}</span>`)).join('')}</nav>`;
const loadingBox = (title, sub) => `<div class="panel loading"><span class="spin"></span><div class="col"><b style="font-weight:600">${T(title)}</b>${sub ? `<span class="small mute">${T(sub)}</span>` : ''}</div></div>`;
const KIND = { building: 'Building', street: 'Street', place: 'Locality', area: 'Area', poi: 'Place', point: 'Selected point', registry: 'On a seizure list' };
function identity(p) {
  const chips = [];
  if (p.cadastral_no) chips.push(`<span class="chip mono">${esc(p.cadastral_no)}</span>`);
  chips.push(`<span class="chip mono">${Number(p.lat).toFixed(5)}, ${Number(p.lon).toFixed(5)}</span>`);
  if (p.area_m2) chips.push(`<span class="chip">${fmtArea(p.area_m2)}</span>`);
  if (p.kind && KIND[p.kind]) chips.push(`<span class="chip">${T(KIND[p.kind])}</span>`);
  if (p.approx) chips.push(`<span class="chip">${T('approximate location')}</span>`);
  return `<div class="col" style="gap:10px;min-width:0"><span class="eyebrow">${T('Land plot')}${p.city || p.region ? ' · ' + esc(p.city || p.region) : ''}</span><h1 class="h1">${esc(p.title)}</h1><div class="chips">${chips.join('')}</div></div>`;
}

/* ================= map ================= */
const MAPS = {};       // spec id -> spec, filled while rendering
let liveMaps = [];
// Base maps are vector styles (OpenFreeMap, built from OpenStreetMap): sharp on any screen and at any zoom.
const OFM = 'https://tiles.openfreemap.org/styles/';
const BASEMAPS = [
  { id: 'detail', label: 'Map', style: OFM + 'liberty' },
  { id: 'light', label: 'Light', style: OFM + 'positron' },
  { id: 'dark', label: 'Dark', style: OFM + 'dark' },
];
// used only if the vector styles cannot be loaded
const OSM_RASTER = { version: 8, sources: { osm: { type: 'raster', tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'], tileSize: 256, maxzoom: 19, attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors' } },
  layers: [{ id: 'osm', type: 'raster', source: 'osm' }] };
const baseById = (id) => BASEMAPS.find((b) => b.id === id) || null;
// an explicit choice wins; otherwise the map follows the site theme
const curBase = () => (baseById(store.get('garant.basemap2', '')) || baseById(S.theme === 'dark' ? 'dark' : 'detail')).id;
let is3d = store.get('garant.3d', false) === true;
const hiddenKinds = new Set();
const KZ_VIEW = { center: [67.3, 48.2], zoom: 3.4 };
const RISK_KIND = { water: 'Water', construction: 'Construction', planned_road: 'Planned road', power_line: 'Power line', major_road: 'Major road', railway: 'Railway', industrial: 'Industrial area', cemetery: 'Cemetery', landfill: 'Landfill' };
Object.assign(RU, {
  'Map': 'Схема', 'Light': 'Светлая', 'Dark': 'Тёмная', 'Planned road': 'Планируемая дорога', 'Major road': 'Крупная дорога', 'Railway': 'Железная дорога', 'Industrial area': 'Промзона', 'Cemetery': 'Кладбище', 'Landfill': 'Свалка',
  'My location': 'Моё местоположение', 'Full screen': 'Во весь экран', 'Exit full screen': 'Выйти из полноэкранного режима', 'Map style': 'Стиль карты',
  '3D view': 'Объёмный вид', 'Back to the plot': 'Вернуться к участку', 'Show or hide on the map': 'Показать или скрыть на карте',
  'Looking up the address…': 'Ищем адрес…', 'Check this plot': 'Проверить этот участок', 'Garant checks plots in Kazakhstan only.': 'Garant проверяет участки только в Казахстане.',
  'Your location could not be determined.': 'Не удалось определить ваше местоположение.', 'You are here': 'Вы здесь', 'from the plot': 'от участка',
  'Click any place on the map to see its address': 'Кликните в любое место карты, чтобы увидеть адрес', 'Copy coordinates': 'Скопировать координаты', 'Copied': 'Скопировано',
  'Dark theme': 'Тёмная тема', 'Light theme': 'Светлая тема',
});
const MICO = {
  locate: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/><circle cx="12" cy="12" r="7"/>',
  full: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
  exit: '<path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/>',
  cube: '<path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z"/><path d="m4 7.5 8 4.5 8-4.5M12 12v9"/>',
  plot: '<path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11Z"/><circle cx="12" cy="10" r="2.4"/>',
};
const mico = (k) => `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${MICO[k]}</svg>`;
function mapBox(id, spec, legend) {
  MAPS[id] = spec;
  const leg = (legend || []).map(([style, label, kind]) => kind && kind !== 'plot'
    ? `<button type="button" data-kind="${kind}" aria-pressed="${!hiddenKinds.has(kind)}" title="${T('Show or hide on the map')}"><i style="${style}"></i>${T(label)}</button>`
    : `<span><i style="${style}"></i>${T(label)}</span>`).join('');
  const base = curBase();
  const btn = (act, label, extra = '') => `<button type="button" data-act-map="${act}" aria-label="${T(label)}" title="${T(label)}" ${extra}>${mico(act === 'tilt' ? 'cube' : act)}</button>`;
  return `<div class="mapbox" data-map="${id}"><div class="map"></div>
    <div class="map-layers" role="group" aria-label="${T('Map style')}">${BASEMAPS.map((b) => `<button type="button" data-base="${b.id}" class="${b.id === base ? 'on' : ''}" aria-pressed="${b.id === base}">${T(b.label)}</button>`).join('')}</div>
    ${spec.hint ? `<div class="map-hint">${T(spec.hint)}</div>` : ''}
    <div class="map-zoom"><button type="button" data-zoom="in" aria-label="Zoom in" title="Zoom in">+</button><button type="button" data-zoom="out" aria-label="Zoom out" title="Zoom out">−</button>
      ${btn('locate', 'My location')}${btn('tilt', '3D view', `aria-pressed="${is3d}" class="${is3d ? 'on' : ''}"`)}${spec.plot ? btn('plot', 'Back to the plot') : ''}${btn('full', 'Full screen')}</div>
    ${leg ? `<div class="map-legend">${leg}</div>` : ''}</div>`;
}
function plotLegend(features) {
  const kinds = new Set(((features && features.features) || []).map((f) => f.properties.kind));
  const leg = [['background:rgba(14,159,78,.25);border:1.5px solid #0e9f4e', 'Your plot', 'plot']];
  if (kinds.has('water')) leg.push(['background:rgba(47,123,234,.45)', 'Water', 'water']);
  if (kinds.has('construction')) leg.push(['background:rgba(209,138,9,.5)', 'Construction', 'construction']);
  if (kinds.has('planned_road')) leg.push(['background:#d63a3e', 'Planned road', 'planned_road']);
  if (kinds.has('power_line')) leg.push(['background:#7a5cd6', 'Power line', 'power_line']);
  for (const k of ['major_road', 'railway', 'industrial', 'cemetery', 'landfill']) if (kinds.has(k)) leg.push(['background:#8a9a90', RISK_KIND[k], k]);
  return leg;
}
function destroyMaps() {
  for (const m of liveMaps) { try { m.remove(); } catch (e) { /* already gone */ } }
  liveMaps = [];
  document.querySelectorAll('.mapbox.full').forEach((b) => b.classList.remove('full'));
  document.documentElement.classList.remove('map-full');
}
// a small circle polygon (metres) for the location accuracy
function circleGeo(lon, lat, r) {
  const pts = [];
  for (let i = 0; i <= 48; i++) { const a = i / 48 * 2 * Math.PI; pts.push([lon + r * Math.cos(a) / (111320 * Math.cos(lat * Math.PI / 180)), lat + r * Math.sin(a) / 111320]); }
  return { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [pts] } };
}
// switch every open map to the current base map (used by the theme switch)
function restyleMaps() { for (const m of liveMaps) if (m._gSetBase) m._gSetBase(curBase()); }
function mountMaps() {
  destroyMaps();
  document.querySelectorAll('.mapbox[data-map]').forEach((box) => {
    const spec = MAPS[box.dataset.map], el = box.querySelector('.map');
    if (!spec || !el) return;
    const gl = window.maplibregl;
    if (!gl || !gl.Map) { el.innerHTML = `<div class="map-empty">${T('The map could not be loaded. Everything else works.')}</div>`; return; }
    let map, base = curBase();
    try {
      map = new gl.Map({ container: el, style: baseById(base).style, center: spec.center || KZ_VIEW.center, zoom: spec.zoom == null ? KZ_VIEW.zoom : spec.zoom, maxZoom: 19,
        pitch: is3d ? 55 : 0, attributionControl: { compact: true }, dragRotate: is3d, pitchWithRotate: is3d, touchPitch: is3d, cooperativeGestures: S.m, fadeDuration: 150 });
    } catch (e) { el.innerHTML = `<div class="map-empty">${T('The map could not be loaded. Everything else works.')}</div>`; return; }
    liveMaps.push(map);
    if (!is3d) map.touchZoomRotate.disableRotation();
    map.addControl(new gl.ScaleControl({ unit: 'metric', maxWidth: 90 }), 'bottom-right');
    box.querySelector('[data-zoom="in"]').onclick = () => map.zoomIn();
    box.querySelector('[data-zoom="out"]').onclick = () => map.zoomOut();
    let me = null;

    // --- base map; our layers are re-added after every style change ---
    let styleOk = false, fellBack = false;
    map.on('error', (ev) => {
      if (styleOk || fellBack || (ev && (ev.sourceId || ev.tile))) return;
      fellBack = true; try { map.setStyle(OSM_RASTER, { diff: false }); } catch (e) { /* keep empty map */ }
    });
    const setBase = (id) => {
      const b = baseById(id); if (!b) return;
      box.querySelectorAll('[data-base]').forEach((x) => { const on = x.dataset.base === b.id; x.classList.toggle('on', on); x.setAttribute('aria-pressed', on); });
      if (b.id === base && !fellBack) return;
      base = b.id; styleOk = false; fellBack = false;
      map.setStyle(b.style, { diff: false });
    };
    map._gSetBase = setBase;
    box.querySelectorAll('[data-base]').forEach((btn) => btn.addEventListener('click', () => { store.set('garant.basemap2', btn.dataset.base); for (const m of liveMaps) if (m._gSetBase) m._gSetBase(btn.dataset.base); }));
    map.on('style.load', () => { styleOk = true; draw(); apply3d(); });

    // --- risk layers, one filter per layer plus the legend switches ---
    const BASEF = {};
    const kindF = () => ['!', ['in', ['get', 'kind'], ['literal', [...hiddenKinds]]]];
    const applyKinds = () => { for (const id of Object.keys(BASEF)) if (map.getLayer(id)) map.setFilter(id, ['all', BASEF[id], kindF()]); };
    const draw = () => {
      if (map.getSource('plot')) return;
      const plot = spec.plot;
      if (spec.features && spec.features.features && spec.features.features.length) {
        map.addSource('risk', { type: 'geojson', data: spec.features });
        const poly = ['==', ['geometry-type'], 'Polygon'], line = ['==', ['geometry-type'], 'LineString'], kind = (k) => ['==', ['get', 'kind'], k];
        const color = ['match', ['get', 'kind'], 'water', '#2f7bea', 'construction', '#d18a09', '#8a9a90'];
        const add = (id, type, f, paint) => { BASEF[id] = f; map.addLayer({ id, type, source: 'risk', filter: ['all', f, kindF()], paint }); };
        add('risk-fill', 'fill', poly, { 'fill-color': color, 'fill-opacity': 0.25 });
        add('risk-outline', 'line', poly, { 'line-color': color, 'line-width': 1.8 });
        add('risk-line', 'line', ['all', line, ['!', kind('planned_road')], ['!', kind('power_line')]], { 'line-color': ['match', ['get', 'kind'], 'water', '#2f7bea', '#8a9a90'], 'line-width': ['interpolate', ['linear'], ['zoom'], 12, 2, 18, 5] });
        add('risk-road', 'line', ['all', line, kind('planned_road')], { 'line-color': '#d63a3e', 'line-width': ['interpolate', ['linear'], ['zoom'], 12, 2.5, 18, 6], 'line-dasharray': [2, 1.5] });
        add('risk-power', 'line', ['all', line, kind('power_line')], { 'line-color': '#7a5cd6', 'line-width': ['interpolate', ['linear'], ['zoom'], 12, 2, 18, 4], 'line-dasharray': [1, 2] });
        // wide invisible lines make thin objects easy to click
        add('risk-hit', 'line', ['has', 'kind'], { 'line-color': '#000', 'line-opacity': 0, 'line-width': 16 });
      }
      map.addSource('plot', { type: 'geojson', data: plot && plot.geom ? { type: 'Feature', properties: {}, geometry: plot.geom } : { type: 'FeatureCollection', features: [] } });
      map.addLayer({ id: 'plot-fill', type: 'fill', source: 'plot', paint: { 'fill-color': '#0e9f4e', 'fill-opacity': 0.22 } });
      map.addLayer({ id: 'plot-line', type: 'line', source: 'plot', paint: { 'line-color': '#0e9f4e', 'line-width': 3 } });
      map.addSource('me', { type: 'geojson', data: me ? circleGeo(me.lon, me.lat, me.acc) : { type: 'FeatureCollection', features: [] } });
      map.addLayer({ id: 'me-acc', type: 'fill', source: 'me', paint: { 'fill-color': '#2f7bea', 'fill-opacity': 0.12 } });
      map.addLayer({ id: 'me-acc-line', type: 'line', source: 'me', paint: { 'line-color': '#2f7bea', 'line-width': 1.2, 'line-opacity': 0.6 } });
    };
    box.querySelectorAll('.map-legend [data-kind]').forEach((b) => b.addEventListener('click', () => {
      const k = b.dataset.kind, hide = !hiddenKinds.has(k);
      if (hide) hiddenKinds.add(k); else hiddenKinds.delete(k);
      b.setAttribute('aria-pressed', String(!hide)); applyKinds();
    }));

    // --- 3D: tilted camera with extruded buildings ---
    const tiltBtn = box.querySelector('[data-act-map="tilt"]');
    function apply3d() {
      if (!map.isStyleLoaded()) return;
      const layers = map.getStyle().layers || [];
      const native = layers.some((l) => l.type === 'fill-extrusion' && l.id !== 'g-3d');
      if (is3d && !native && !map.getLayer('g-3d') && map.getSource('openmaptiles')) {
        const firstSymbol = (layers.find((l) => l.type === 'symbol') || {}).id;
        map.addLayer({ id: 'g-3d', type: 'fill-extrusion', source: 'openmaptiles', 'source-layer': 'building', minzoom: 14,
          paint: { 'fill-extrusion-color': base === 'dark' ? '#33453b' : '#dcd6cc', 'fill-extrusion-height': ['coalesce', ['get', 'render_height'], 8], 'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0], 'fill-extrusion-opacity': 0.85 } }, firstSymbol);
      }
      if (!is3d && map.getLayer('g-3d')) map.removeLayer('g-3d');
    }
    tiltBtn.onclick = () => {
      is3d = !is3d; store.set('garant.3d', is3d);
      tiltBtn.classList.toggle('on', is3d); tiltBtn.setAttribute('aria-pressed', is3d);
      if (is3d) { map.dragRotate.enable(); map.touchZoomRotate.enableRotation(); map.touchPitch.enable(); map.easeTo({ pitch: 55, zoom: Math.max(map.getZoom(), 15.5), duration: 700 }); }
      else { map.dragRotate.disable(); map.touchZoomRotate.disableRotation(); map.touchPitch.disable(); map.easeTo({ pitch: 0, bearing: 0, duration: 500 }); }
      apply3d();
    };

    if (spec.plot) { const d = document.createElement('div'); d.className = 'gdot'; new gl.Marker({ element: d }).setLngLat([spec.plot.lon, spec.plot.lat]).addTo(map); }
    (spec.pins || []).forEach((p, i) => {
      const d = document.createElement('button'); d.type = 'button'; d.className = 'gpin' + (p.sel ? ' sel' : ''); d.textContent = String(i + 1); d.setAttribute('aria-label', p.label || '');
      d.addEventListener('click', (ev) => { ev.stopPropagation(); if (spec.onPin) spec.onPin(i); });
      new gl.Marker({ element: d }).setLngLat([p.lon, p.lat]).addTo(map);
    });
    if (spec.pins && spec.pins.length > 1) {
      const b = new gl.LngLatBounds(); spec.pins.forEach((p) => b.extend([p.lon, p.lat]));
      map.fitBounds(b, { padding: 50, maxZoom: 15, duration: 0 });
    }
    const plotBtn = box.querySelector('[data-act-map="plot"]');
    if (plotBtn) plotBtn.onclick = () => map.flyTo({ center: [spec.plot.lon, spec.plot.lat], zoom: Math.max(spec.zoom || 15.5, 15.5), bearing: 0 });

    // --- the hint disappears once the visitor starts using the map ---
    const hint = box.querySelector('.map-hint');
    const hideHint = () => { if (hint) hint.classList.add('gone'); };
    map.on('dragstart', hideHint); map.on('click', hideHint); el.addEventListener('wheel', hideHint, { passive: true, once: true });

    // --- my location ---
    let meMarker = null;
    box.querySelector('[data-act-map="locate"]').onclick = (ev) => {
      const btn = ev.currentTarget;
      if (!navigator.geolocation) { toast('Your location could not be determined.'); return; }
      btn.classList.add('busy');
      navigator.geolocation.getCurrentPosition((pos) => {
        btn.classList.remove('busy');
        me = { lat: pos.coords.latitude, lon: pos.coords.longitude, acc: Math.min(2000, Math.max(5, pos.coords.accuracy || 30)) };
        if (!meMarker) { const d = document.createElement('div'); d.className = 'medot'; d.title = t('You are here'); meMarker = new gl.Marker({ element: d }); }
        meMarker.setLngLat([me.lon, me.lat]).addTo(map);
        const src = map.getSource('me'); if (src) src.setData(circleGeo(me.lon, me.lat, me.acc));
        map.flyTo({ center: [me.lon, me.lat], zoom: Math.max(map.getZoom(), 16) });
      }, () => { btn.classList.remove('busy'); toast('Your location could not be determined.'); }, { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 });
    };

    // --- full screen (a fixed overlay works on every phone, unlike the Fullscreen API) ---
    const fullBtn = box.querySelector('[data-act-map="full"]');
    const setFull = (on) => {
      box.classList.toggle('full', on); document.documentElement.classList.toggle('map-full', on);
      fullBtn.setAttribute('aria-label', t(on ? 'Exit full screen' : 'Full screen')); fullBtn.title = t(on ? 'Exit full screen' : 'Full screen');
      fullBtn.innerHTML = mico(on ? 'exit' : 'full');
      if (map.cooperativeGestures) { if (on) map.cooperativeGestures.disable(); else if (S.m) map.cooperativeGestures.enable(); }
      setTimeout(() => map.resize(), 30);
    };
    fullBtn.onclick = () => setFull(!box.classList.contains('full'));
    const onKey = (e) => { if (e.key === 'Escape' && box.classList.contains('full')) setFull(false); };
    document.addEventListener('keydown', onKey);
    map.on('remove', () => document.removeEventListener('keydown', onKey));

    // --- clicks: risk objects first, then the address of any place ---
    const popup = new gl.Popup({ closeButton: true, maxWidth: '290px', className: 'gpop', offset: 10 });
    const showPlace = (lat, lon) => {
      if (!inKZ(lat, lon)) { popup.setLngLat([lon, lat]).setHTML(`<p class="small mute">${T('Garant checks plots in Kazakhstan only.')}</p>`).addTo(map); return; }
      const seq = (showPlace.seq = (showPlace.seq || 0) + 1);
      popup.setLngLat([lon, lat]).setHTML(`<div class="loading" style="padding:0;gap:8px"><span class="spin"></span><span class="small mute">${T('Looking up the address…')}</span></div>`).addTo(map);
      geoReverse(lat, lon).then((c) => {
        if (seq !== showPlace.seq || !popup.isOpen()) return;
        const el2 = document.createElement('div'); el2.className = 'col'; el2.style.gap = '10px';
        const coords = `${lat.toFixed(6)}, ${lon.toFixed(6)}`;
        el2.innerHTML = `<div class="col" style="gap:2px"><b style="font-weight:600">${esc(c.title)}</b>${c.sub ? `<span class="cap faint">${esc(c.sub)}</span>` : ''}
            <button type="button" class="gcopy mono cap" title="${T('Copy coordinates')}">${esc(coords)}</button></div>
          <button type="button" class="btn btn-p" style="height:36px">${T('Check this plot')}</button>`;
        el2.querySelector('.btn').onclick = () => { popup.remove(); setFull(false); setCand(c); go('#/plot'); if (S.route.name === 'plot') render(); };
        el2.querySelector('.gcopy').onclick = (ev) => { const b = ev.currentTarget; try { navigator.clipboard.writeText(coords).then(() => { b.textContent = t('Copied'); setTimeout(() => { b.textContent = coords; }, 1400); }); } catch (e) { /* clipboard not allowed */ } };
        popup.setDOMContent(el2);
      });
    };
    const hitLayers = () => ['risk-hit', 'risk-fill'].filter((id) => map.getLayer(id));
    map.on('click', (e) => {
      const ls = hitLayers(), hit = ls.length ? map.queryRenderedFeatures(e.point, { layers: ls }) : [];
      if (hit.length) {
        const f = hit[0].properties || {};
        const name = (S.lang === 'ru' ? f.name : f.name_en) || f.name || '';
        popup.setLngLat(e.lngLat).setHTML(`<div class="col" style="gap:2px"><b style="font-weight:600">${T(RISK_KIND[f.kind] || 'Place')}</b>${name ? `<span class="small">${esc(name)}</span>` : ''}<span class="cap faint">${esc(fmtDist(Number(f.dist)))} ${f.dist > 0 ? T('from the plot') : ''} · OpenStreetMap</span></div>`).addTo(map);
        return;
      }
      if (spec.onClick) spec.onClick(e.lngLat.lat, e.lngLat.lng);
      else showPlace(e.lngLat.lat, e.lngLat.lng);
    });
    map.on('mousemove', (e) => {
      const ls = hitLayers(), over = ls.length && map.queryRenderedFeatures(e.point, { layers: ls }).length;
      map.getCanvas().style.cursor = over ? 'pointer' : (spec.onClick ? 'crosshair' : '');
    });
  });
}

/* ================= geocoding (OpenStreetMap Nominatim) ================= */
const NOMINATIM = 'https://nominatim.openstreetmap.org';
const CAD_RE = /^\d{2}-\d{3}-\d{3}-\d{2,5}$/;
const inKZ = (lat, lon) => lat >= 40.4 && lat <= 55.6 && lon >= 46.3 && lon <= 87.5;
function kindOf(r) {
  const c = r.category || r.class, ty = r.type;
  if (c === 'building' || ty === 'house' || r.addresstype === 'building') return 'building';
  if (c === 'highway') return 'street';
  if (c === 'place' || c === 'boundary') return (ty === 'house' ? 'building' : 'place');
  if (c === 'landuse' || c === 'leisure' || c === 'natural') return 'area';
  return 'poi';
}
function polygonArea(geom, lat0) {      // square metres of the outer ring, good enough for a chip
  const ring = geom && geom.coordinates && geom.coordinates[0];
  if (!Array.isArray(ring) || ring.length < 4) return null;
  const kx = Math.cos(lat0 * Math.PI / 180) * 111320, ky = 111320;
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) a += (ring[j][0] * kx + ring[i][0] * kx) * (ring[j][1] * ky - ring[i][1] * ky);
  a = Math.abs(a / 2);
  return a >= 20 && a <= 1000000 ? Math.round(a) : null;
}
function candFrom(r, kindOverride) {
  const a = r.address || {};
  const road = a.road || a.pedestrian || a.residential || '';
  const city = a.city || a.town || a.village || a.hamlet || a.municipality || a.county || '';
  const first = String(r.display_name || '').split(',')[0].trim();
  let title = r.name && r.name !== road ? r.name : '';
  if (road && a.house_number) title = `${road}, ${a.house_number}`;
  else if (!title) title = road || first || city;
  const kind = kindOverride || kindOf(r);
  const g = r.geojson;
  const lat = Number(r.lat), lon = Number(r.lon);
  let geom = null;
  if (g && (g.type === 'Polygon' || g.type === 'MultiPolygon') && (kind === 'building' || kind === 'area' || kind === 'poi') && r.boundingbox) {
    const bb = r.boundingbox.map(Number);
    if ((bb[1] - bb[0]) < 0.012 && (bb[3] - bb[2]) < 0.02) geom = g.type === 'Polygon' ? g : { type: 'Polygon', coordinates: g.coordinates[0] };
  }
  const sub = [a.suburb || a.city_district || a.neighbourhood, city, a.state].filter((x, i, arr) => x && arr.indexOf(x) === i && x !== title).join(', ');
  const area = geom ? polygonArea(geom, lat) : null;
  if (geom && !area) geom = null;
  return { title: String(title).slice(0, 200), sub, address: String(r.display_name || '').slice(0, 400), city: String(city).slice(0, 120), region: String(a.state || '').slice(0, 160), kind, lat, lon, geom, area_m2: area };
}
async function nominatim(path) {
  const res = await fetch(`${NOMINATIM}${path}&accept-language=${S.lang}`, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error('nominatim ' + res.status);
  return res.json();
}
// Map data for the report is loaded here, in the browser: OpenStreetMap servers block requests
// from cloud servers, so the server function receives what the visitor's browser got.
// public Overpass servers; the main one is tried first, the others join in if it is slow
const OVERPASS_URLS = ['https://overpass-api.de/api/interpreter', 'https://maps.mail.ru/osm/tools/overpass/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];
// one bounding box for all filters: much cheaper for the server than a dozen "around" searches
function bboxAround(lat, lon, r) {
  const dLat = r / 111320, dLon = r / (111320 * Math.cos(lat * Math.PI / 180));
  return [lat - dLat, lon - dLon, lat + dLat, lon + dLon].map((x) => x.toFixed(5));
}
function overpassQuery(lat, lon, r) {
  const [s, w, n, e] = bboxAround(lat, lon, r);
  return `[out:json][timeout:40][bbox:${s},${w},${n},${e}];(way[natural=water];relation[natural=water];way[waterway~"^(river|stream|canal)$"];way[landuse=construction];relation[landuse=construction];way[building=construction];way[highway~"^(construction|proposed)$"];way["proposed:highway"];way[railway~"^(rail|construction|proposed)$"];way[highway~"^(motorway|trunk|primary)$"];way[power=line];way[landuse~"^(industrial|landfill|cemetery)$"];);out geom 300;`;
}
const r6 = (x) => Math.round(x * 1e6) / 1e6;
const slimGeom = (g) => (Array.isArray(g) ? g.filter((c) => c && typeof c.lat === 'number').map((c) => ({ lat: r6(c.lat), lon: r6(c.lon) })) : undefined);
// long rivers and power lines: keep only the runs of points near the plot (as separate pieces, so no false shortcut appears)
function nearRuns(g, box) {
  if (!g || g.length <= 400) return [g];
  const [s, w, n, e] = box.map(Number), inside = (c) => c.lat >= s && c.lat <= n && c.lon >= w && c.lon <= e;
  const runs = []; let cur = [];
  for (let i = 0; i < g.length; i++) {
    const keep = inside(g[i]) || (i > 0 && inside(g[i - 1])) || (i < g.length - 1 && inside(g[i + 1]));
    if (keep) cur.push(g[i]); else if (cur.length) { runs.push(cur); cur = []; }
  }
  if (cur.length) runs.push(cur);
  return runs;
}
function slimElement(el, box) {
  const out = { type: el.type, id: el.id, tags: el.tags || {} };
  const g = slimGeom(el.geometry);
  if (g) { const runs = nearRuns(g, box); if (runs.length === 1) out.geometry = runs[0]; else out.members = runs.map((r) => ({ role: 'outer', geometry: r })); }
  if (Array.isArray(el.members)) out.members = (out.members || []).concat(el.members.flatMap((m) => nearRuns(slimGeom(m.geometry) || [], box).map((r) => ({ role: m.role || '', geometry: r }))));
  return out;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function fetchTimed(url, opts, ms) {
  const ctl = new AbortController(); const tm = setTimeout(() => ctl.abort(), ms);
  try { return await fetch(url, { ...opts, signal: ctl.signal }); } finally { clearTimeout(tm); }
}
// Several public servers, started a few seconds apart; a busy server (429/502/504) is retried with a growing pause,
// as Overpass asks. The first good answer wins and the other requests are cancelled.
function browserOverpass(lat, lon, r) {
  const body = 'data=' + encodeURIComponent(overpassQuery(lat, lon, r));
  const box = bboxAround(lat, lon, r * 3);
  const deadline = Date.now() + 55000, ctls = [];
  let done = false, finished = 0;
  return new Promise((resolve) => {
    const finish = (v) => { if (done) return; done = true; ctls.forEach((c) => c.abort()); resolve(v); };
    const worker = async (url, delay) => {
      await sleep(delay);
      let pause = 2000;
      while (!done && Date.now() < deadline - 3000) {
        const ctl = new AbortController(); ctls.push(ctl);
        const tm = setTimeout(() => ctl.abort(), Math.min(45000, deadline - Date.now()));
        let retry = false;
        try {
          const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body, signal: ctl.signal });
          if (res.status === 429 || res.status === 502 || res.status === 503 || res.status === 504) retry = true;
          else if (res.ok) {
            const j = await res.json();
            if (j && Array.isArray(j.elements) && !(j.remark && /runtime error|timed out|out of memory/i.test(j.remark))) {
              return finish({ elements: j.elements.slice(0, 600).map((el) => slimElement(el, box)), stamp: (j.osm3s && j.osm3s.timestamp_osm_base) || null });
            }
            retry = true;
          }
        } catch (e) { retry = !done && e.name !== 'AbortError'; } finally { clearTimeout(tm); }
        if (!retry) break;
        await sleep(pause); pause = Math.min(pause * 2, 16000);
      }
      if (++finished === OVERPASS_URLS.length) finish(null);
    };
    OVERPASS_URLS.forEach((url, i) => worker(url, i * 3000));
    setTimeout(() => finish(null), deadline - Date.now());
  });
}
async function browserReverse(lat, lon) {
  try {
    const res = await fetchTimed(`${NOMINATIM}/reverse?format=jsonv2&lat=${lat}&lon=${lon}&zoom=18&addressdetails=1&accept-language=ru`, { headers: { Accept: 'application/json' } }, 9000);
    if (!res.ok) return null;
    const j = await res.json();
    return j && j.address ? { display_name: j.display_name || '', address: j.address } : null;
  } catch (e) { return null; }
}
function plotRadius(p) {
  const g = p && p.geom, ring = g && g.type === 'Polygon' && g.coordinates && g.coordinates[0];
  if (!Array.isArray(ring)) return 0;
  let m = 0; for (const c of ring) m = Math.max(m, Math.hypot((c[1] - p.lat) * 111320, (c[0] - p.lon) * 111320 * Math.cos(p.lat * Math.PI / 180)));
  return Math.min(400, m);
}
async function mapDataFor(p) {
  if (!p || typeof p.lat !== 'number' || typeof p.lon !== 'number') return {};
  const [osm, rev] = await Promise.all([browserOverpass(p.lat, p.lon, Math.round(500 + plotRadius(p))), browserReverse(p.lat, p.lon)]);
  return { ...(osm ? { osm } : {}), ...(rev ? { rev } : {}) };
}
async function geoSearch(query) {
  const rows = await nominatim(`/search?format=jsonv2&q=${encodeURIComponent(query)}&countrycodes=kz&limit=8&addressdetails=1&polygon_geojson=1&polygon_threshold=0.00003`);
  return (Array.isArray(rows) ? rows : []).map((r) => candFrom(r)).filter((c) => inKZ(c.lat, c.lon));
}
async function geoReverse(lat, lon) {
  const base = { title: `${lat.toFixed(5)}, ${lon.toFixed(5)}`, sub: '', address: '', city: '', region: '', kind: 'point', lat: +lat.toFixed(6), lon: +lon.toFixed(6), geom: null };
  try {
    const r = await nominatim(`/reverse?format=jsonv2&lat=${lat}&lon=${lon}&zoom=18&addressdetails=1`);
    if (r && r.address) { const c = candFrom(r, 'point'); return { ...c, lat: base.lat, lon: base.lon, geom: null }; }
  } catch (e) { /* the point itself is enough */ }
  return base;
}
// a registry row found by cadastral number: put it on the map as well as we can
async function candFromNotice(n) {
  const cityRu = n.city_code === 'almaty' ? 'Алматы' : 'Астана';
  const base = { title: n.raw_address, sub: `${n.cadastral_no} · ${L(n.project, 'title')}`, address: `${cityRu}, ${n.raw_address}`, city: cityRu, region: '', kind: 'registry', cadastral_no: n.cadastral_no, geom: null };
  const tries = [];
  if (n.street && n.house) tries.push(`${cityRu}, ${n.street} ${n.house}`);
  if (n.locality) tries.push(`${cityRu}, ${n.locality.split(';')[0].replace(/["«»]/g, '')}`);
  for (const qy of tries) {
    try { const rows = await geoSearch(qy); if (rows.length) return { ...base, lat: rows[0].lat, lon: rows[0].lon, approx: qy !== tries[0] || !(n.street && n.house) }; } catch (e) { /* next */ }
  }
  const c = n.city_code === 'almaty' ? [43.2389, 76.8897] : [51.1694, 71.4491];
  return { ...base, lat: c[0], lon: c[1], approx: true };
}

/* ================= screens ================= */
function sHome() {
  const m = S.m;
  const steps = [['1', 'Enter an address or cadastral number', 'We find the place on the map of Kazakhstan. You can also click the map.'], ['2', 'Get a risk report', 'Seizure lists, water, construction and planned roads nearby, each with a source and date.'], ['3', 'Watch for changes', 'Save the plot: we re-check it and show what changed.']];
  return `${header()}<div class="wrap">
  <section class="hero">
    <div class="col grow" style="gap:${m ? 14 : 20}px;position:relative;z-index:1">
      <span class="badge" style="align-self:flex-start">${T('Kazakhstan · free beta')}</span>
      <h1 class="h-display">${T('Check a plot before you buy')}</h1>
      <p class="mute" style="font-size:${m ? 15 : 17}px;max-width:560px">${T('Garant checks a plot against published seizure decrees and live map data: water, construction, planned roads and power lines nearby. Every risk lists its source and date.')}</p>
      <form class="${m ? 'col' : 'row'}" style="gap:10px" data-form="search">
        <label class="input grow" style="color:var(--faint)">${I.search}<input type="search" name="q" id="homeQ" placeholder="${T('Address or cadastral number')}" aria-label="${T('Address or cadastral number')}" autocomplete="off"></label>
        <button type="submit" class="btn btn-w">${T('Check plot')}</button>
      </form>
      <p class="faint small">${T('For example: 21-318-067-2166 or Kenesary 21, Astana')}</p>
    </div>
    <div class="hero-map">${mapBox('home', { hint: 'Click any place on the map to see its address' })}</div>
  </section>
  <section class="col" style="gap:16px"><span class="eyebrow">${T('How it works')}</span>
    <div class="row" style="gap:16px">${steps.map(([n, h, d]) => `<div class="panel pad step-card"><span class="step-n">${n}</span><h3 class="h3">${T(h)}</h3><p class="mute small">${T(d)}</p></div>`).join('')}</div>
  </section>
  <section class="col" style="gap:12px"><span class="eyebrow">${T('Where the data comes from')}</span>
    <div class="chips">${['OpenStreetMap, live', 'Akimat seizure decrees: Astana', 'Akimat seizure decrees: Almaty', 'Land Code of Kazakhstan'].map((x) => `<span class="chip">${I.doc}${T(x)}</span>`).join('')}</div>
  </section>${footer()}</div>`;
}

const FILTERS = [['all', 'All'], ['addr', 'Addresses and buildings'], ['area', 'Streets and areas']];
const inFilter = (c) => S.filter === 'all' || (S.filter === 'addr' ? ['building', 'poi', 'registry', 'point'].includes(c.kind) : ['street', 'place', 'area'].includes(c.kind));
function sSearch() {
  const m = S.m, all = S.results || [], res = all.filter(inFilter);
  const sel = Math.min(S.sel, Math.max(0, res.length - 1));
  let body;
  if (S.results === null && !S.searchErr) body = loadingBox('Searching…');
  else if (S.searchErr) body = `<div class="panel empty"><p class="mute">${T(S.searchErr)}</p></div>`;
  else if (!res.length) body = `<div class="panel empty"><p class="mute">${T('Nothing found. Check the spelling or add the city name.')}</p></div>`;
  else body = res.map((r, i) => `<button type="button" class="panel result ${i === sel ? 'sel' : ''}" data-result="${i}"><span class="pin">${I.pin}</span><span class="col grow" style="min-width:0"><b style="font-weight:600">${esc(r.title)}</b><span class="small faint">${esc([T(KIND[r.kind] || 'Place'), r.sub].filter(Boolean).join(' · '))}</span></span><span class="faint">${I.chev}</span></button>`).join('');
  const list = `<div class="col" style="gap:10px;${m ? '' : 'width:440px;flex:none'}">
    <form class="input" style="color:var(--fg)" data-form="search">${I.search}<input type="search" name="q" value="${esc(S.q)}" aria-label="${T('Search')}" style="border:0;outline:0;background:transparent;flex:1;min-width:0"></form>
    <div class="chips">${FILTERS.map(([k, l]) => `<button type="button" class="chip ${S.filter === k ? 'on' : ''}" data-filter="${k}">${T(l)}</button>`).join('')}</div>
    ${body}</div>`;
  const pins = res.map((r, i) => ({ lat: r.lat, lon: r.lon, sel: i === sel, label: r.title }));
  const spec = { pins, onPin: (i) => chooseResult(i), hint: 'Click any place on the map to see its address' };
  if (pins.length === 1) { spec.center = [pins[0].lon, pins[0].lat]; spec.zoom = 15; }
  const map = mapBox('search', spec);
  const count = S.results ? (ru() ? `Найдено: ${res.length} по запросу «${S.q}»` : `${res.length} found for “${S.q}”`) : '';
  return `${header()}<div class="wrap">
  <div class="col" style="gap:6px"><h1 class="h1">${T('Search results')}</h1><p class="mute small">${esc(count)}&nbsp;</p></div>
  <div class="row">${m ? map + list : list + `<div class="grow">${map}</div>`}</div>${footer()}</div>`;
}

function sPreview() {
  const m = S.m, c = S.cand;
  if (!c) return `${header()}<div class="wrap"><div class="panel empty"><p class="mute">${T('Type an address, a place or a cadastral number.')}</p><a class="btn btn-p" href="#/">${T('Find a plot')}</a></div>${footer()}</div>`;
  const signed = !!S.user;
  const card = S.checking
    ? `<div class="panel lockcard grow"><div class="loading" style="padding:0"><span class="spin"></span><div class="col"><b style="font-weight:600">${T('Checking the plot…')}</b><span class="small mute">${T('We are reading live map data and the seizure registry. This takes up to a minute when the map servers are busy.')}</span></div></div></div>`
    : `<div class="panel lockcard grow">
      <span style="width:48px;height:48px;display:grid;place-items:center;border-radius:14px;background:var(--accent-tint);color:var(--accent-text)">${I.lock}</span>
      <h2 class="h2">${T('Your risk report is ready')}</h2>
      <p class="mute">${T(signed ? 'Open the report to see the risks for this plot.' : 'Sign in or create an account to see the risks for this plot. It’s free.')}</p>
      <div class="col" style="gap:8px">${[['var(--high-tint)', 190], ['var(--mid-tint)', 150], ['var(--low-tint)', 170]].map(([cl, w]) => `<div class="skel"><i style="width:46px;background:${cl}"></i><i style="width:${w}px;max-width:60%;background:var(--line)"></i></div>`).join('')}</div>
      <div class="col" style="gap:8px">${['Seizure lists for Astana and Almaty', 'Water, construction and roads within 500 m', 'Source and date for every risk'].map((x) => `<span class="check"><span style="color:var(--accent)">${I.check}</span>${T(x)}</span>`).join('')}</div>
      ${S.reportErr ? `<p class="err">${T(S.reportErr)}</p>` : ''}
      <div class="${m ? 'col' : 'row'}" style="gap:10px">${signed
        ? `<button type="button" class="btn btn-p ${m ? 'full' : ''}" data-act="open-report">${T('Open report')}</button>`
        : `<button type="button" class="btn btn-p ${m ? 'full' : ''}" data-act="open-report">${T('Sign in to open report')}</button><button type="button" class="btn btn-s ${m ? 'full' : ''}" data-act="open-report" data-signtab="up">${T('Create account')}</button>`}</div>
    </div>`;
  const map = mapBox('preview', { center: [c.lon, c.lat], zoom: c.kind === 'place' ? 12 : 16, plot: c, onClick: pickPoint, hint: 'Click the map to move the point' }, plotLegend(null));
  return `${header()}<div class="wrap">${crumbs([t('Search'), c.city || t('Kazakhstan'), c.title])}${identity(c)}
  <div class="row"><div class="grow" style="${m ? '' : 'flex:1.25'}">${map}</div>${card}</div>${footer()}</div>`;
}

function sSignin() {
  const m = S.m, up = S.signTab === 'up', sfx = m ? 'm' : 'd';
  const busy = S.authBusy ? '<span class="spin"></span>' : '';
  if (S.recovery) return `${header()}<div class="wrap" style="${m ? '' : 'padding-top:64px'}">
  <form class="panel signin" data-form="newpass" novalidate>
    <div class="col" style="gap:6px"><h2 class="h2">${T('Set a new password')}</h2><p class="mute small">${T('Enter a new password for your account.')}</p></div>
    <div class="field"><label for="f-new-${sfx}">${T('New password')}</label><div class="input"><input id="f-new-${sfx}" name="password" type="password" autocomplete="new-password" placeholder="${T('At least 8 characters')}" required minlength="8"></div></div>
    ${S.authErr ? `<p class="err" role="alert">${T(S.authErr)}</p>` : ''}
    <button type="submit" class="btn btn-p full" ${S.authBusy ? 'disabled' : ''}>${busy}${T('Save password')}</button>
  </form>${footer()}</div>`;
  return `${header()}<div class="wrap" style="${m ? '' : 'padding-top:64px'}">
  <form class="panel signin" data-form="sign" novalidate>
    ${S.cand ? `<span class="chip" style="align-self:flex-start;max-width:100%">${I.pin}<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${T('Report')}: ${esc(S.cand.title)}</span></span>` : ''}
    <div class="col" style="gap:6px"><h2 class="h2">${T('Sign in to Garant')}</h2><p class="mute small">${T(up ? 'Create a free account to open reports and watch plots.' : 'Sign in to open the plot report and watch for changes.')}</p></div>
    <div class="segtab"><button type="button" data-signtab="in" class="${up ? '' : 'on'}">${T('Sign in')}</button><button type="button" data-signtab="up" class="${up ? 'on' : ''}">${T('Sign up')}</button></div>
    ${up ? `<div class="field"><label for="f-name-${sfx}">${T('Full name')}</label><div class="input"><input id="f-name-${sfx}" name="name" type="text" autocomplete="name" maxlength="120" placeholder="Example User"></div></div>` : ''}
    <div class="field"><label for="f-mail-${sfx}">${T('Email')}</label><div class="input"><input id="f-mail-${sfx}" name="email" type="email" autocomplete="email" inputmode="email" placeholder="example@email.com" required></div></div>
    <div class="field"><label for="f-pass-${sfx}">${T('Password')}</label><div class="input"><input id="f-pass-${sfx}" name="password" type="password" autocomplete="${up ? 'new-password' : 'current-password'}" placeholder="${up ? T('At least 8 characters') : ''}" required minlength="8"></div></div>
    ${up ? '' : `<button type="button" class="cap" data-act="forgot" style="align-self:flex-end;color:var(--accent-text);font-weight:600">${T('Forgot password?')}</button>`}
    ${S.authErr ? `<p class="err" role="alert">${T(S.authErr)}</p>` : ''}
    <button type="submit" class="btn btn-p full" ${S.authBusy ? 'disabled' : ''}>${busy}${T(up ? 'Create account' : 'Sign in')}</button>
    <div class="info" style="padding:12px 14px"><span style="color:var(--accent)">${I.shield}</span><span class="mute cap">${T('Your password is stored encrypted. Your plots and reports are visible only to you.')}</span></div>
  </form>${footer()}</div>`;
}

function riskCard(it) {
  const [lvl, label] = LEVEL[it.level] || LEVEL.low, [title, desc] = itemText(it);
  const src = it.source && it.source.url ? `<a class="linkish" href="${esc(safeUrl(it.source.url))}" target="_blank" rel="noopener noreferrer">${esc(srcName(it.source))}</a>` : esc(srcName(it.source));
  return `<article class="panel risk"><i style="background:var(--${lvl})"></i><div class="risk-body">
    <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap"><span class="badge b-${lvl}">${T(label)}</span><h3 class="h3">${esc(title)}</h3></div>
    <p class="mute small">${esc(desc)}</p>
    <dl class="meta" style="margin:0"><div><dt>${T('Confidence')}</dt><dd class="conf">${[0, 1, 2].map((i) => `<b class="${i < it.conf ? '' : 'off'}"></b>`).join('')}</dd></div><div><dt>${T('Source')}</dt><dd>${src}</dd></div><div><dt>${T('Data as of')}</dt><dd class="num">${fmtDate(it.date)}</dd></div></dl>
  </div></article>`;
}
function projectRow(p) {
  if (p.kind === 'seizure') {
    const per = p.period_from && p.period_to ? `${fmtDate(p.period_from)} – ${fmtDate(p.period_to)}` : (p.period_to ? `→ ${fmtDate(p.period_to)}` : '—');
    return `<tr><td><b style="font-weight:600">${esc(L(p, 'title'))}</b><div class="cap faint" style="max-width:420px">${esc(L(p, 'purpose'))}</div></td><td class="mute">${T(p.matched ? 'this address' : 'in this city')}</td><td class="cap mute"><a href="${esc(safeUrl(p.source_url))}" target="_blank" rel="noopener noreferrer">${esc(L(p, 'doc'))}</a></td><td><span class="badge ${p.matched ? 'b-high' : 'b-mid'}">${T('Seizure')}</span></td><td class="mute num" style="white-space:nowrap">${per}</td></tr>`;
  }
  const road = p.kind === 'planned_road', built = p.status === 'construction';
  const name = nm(p) || t(road ? (built ? 'Road under construction' : 'Planned road') : 'Construction site');
  return `<tr><td><b style="font-weight:600">${esc(name)}</b></td><td class="mute">${fmtDist(p.distance)}</td><td class="cap mute"><a href="${esc(safeUrl(p.source_url))}" target="_blank" rel="noopener noreferrer">OpenStreetMap</a></td><td><span class="badge ${built || !road ? 'b-acc' : 'b-mid'}">${T(built || !road ? 'Under construction' : 'Planned')}</span></td><td class="faint mono">—</td></tr>`;
}
function historyRows() {
  const h = S.history || [], rows = [];
  for (let i = h.length - 1; i >= 0; i--) {
    const cur = h[i], prev = h[i - 1];
    if (!prev) rows.push([cur.created_at, t('First check'), `${t('Risk level')}: ${t(LEVEL[cur.level][1]).toLowerCase()}`]);
    else if (prev.level !== cur.level) rows.push([cur.created_at, t('Risk level changed'), `${t(LEVEL[prev.level][1]).toLowerCase()} → ${t(LEVEL[cur.level][1]).toLowerCase()}`]);
    else rows.push([cur.created_at, t('Re-checked: no changes'), `${t('Risk level')}: ${t(LEVEL[cur.level][1]).toLowerCase()}`]);
  }
  return rows.slice(0, 12);
}
function reportTab() {
  const d = S.report.data;
  if (S.tab === 'projects') return d.projects.length ? `<div class="panel scroll-x"><table class="tbl" style="min-width:${S.m ? '640px' : '0'}"><thead><tr><th>${T('Project')}</th><th>${T('Distance')}</th><th>${T('Document')}</th><th>${T('Status')}</th><th>${T('Period')}</th></tr></thead><tbody>${d.projects.map(projectRow).join('')}</tbody></table></div>` : `<div class="panel empty"><p class="mute">${T('No projects found near this plot.')}</p></div>`;
  if (S.tab === 'docs') return d.documents.length ? `<div class="col" style="gap:10px">${d.documents.map((x) => `<a class="panel doc" href="${esc(safeUrl(x.url))}" target="_blank" rel="noopener noreferrer"><span class="pin">${I.doc}</span><span class="col grow" style="min-width:0"><b style="font-weight:600">${esc(L(x, 'title'))}</b><span class="cap faint">${esc([L(x, 'note'), x.source_name].filter(Boolean).join(' · '))}${x.date ? ' · ' + fmtDate(x.date) : ''}</span></span><span class="faint">${I.chev}</span></a>`).join('')}</div>` : `<div class="panel empty"><p class="mute">${T('No documents for this plot.')}</p></div>`;
  if (S.tab === 'changes') return `<div class="panel pad col" style="gap:18px">${historyRows().map((c) => `<div class="col" style="gap:2px;padding-left:16px;border-left:3px solid var(--accent)"><span class="cap faint num">${fmtDate(c[0])}</span><b style="font-weight:600">${esc(c[1])}</b><span class="small mute">${esc(c[2])}</span></div>`).join('')}</div>`;
  return `<div class="col" style="gap:12px">${d.items.map(riskCard).join('')}
    ${d.ok.map((o) => { const [h, s] = okText(o); return `<div class="okline ${o.warn ? 'warn' : ''}"><span style="color:var(--${o.warn ? 'mid' : 'low'})">${o.warn ? I.warn : I.check}</span><div class="col grow"><b style="font-weight:600">${esc(h)}</b><span class="small mute">${esc(s)}</span></div>${o.code === 'osm_unavailable' || o.code === 'address_unknown' ? `<button type="button" class="btn btn-s" data-act="recheck">${T('Check again')}</button>` : ''}</div>`; }).join('')}</div>`;
}
function watchBtn(extra, after) {
  return `<button type="button" class="btn ${S.saved ? 'on' : 'btn-p'} ${extra}" data-act="watch" ${after ? 'data-after="plots"' : ''}>${S.saved ? I.check : I.eye}${T(S.saved ? 'Watching' : 'Watch this plot')}</button>`;
}
function stateScreen(active) {       // loading / error states shared by report and AI screens
  if (S.reportErr) return `${header(active)}<div class="wrap"><div class="panel empty"><p class="mute">${T(S.reportErr)}</p><a class="btn btn-p" href="#/">${T('Find a plot')}</a></div>${footer()}</div>`;
  return `${header(active)}<div class="wrap">${loadingBox('Loading…')}${footer()}</div>`;
}
function sReport() {
  if (!S.report || S.report.id !== S.route.id) return stateScreen();
  const m = S.m, r = S.report, d = r.data, p = S.plot, [lvl, , lvlLabel] = LEVEL[d.level];
  const tabs = [['risks', 'Risks', String(d.items.length + d.ok.length)], ['projects', m ? 'Projects' : 'Projects & permits', String(d.projects.length)], ['docs', 'Documents', String(d.documents.length)], ['changes', 'Changes', '']];
  const seg = (k) => (k === d.level ? `var(--${LEVEL[k][0]})` : `var(--${LEVEL[k][0]}-tint)`);
  const lab = (k, align) => `<span style="text-align:${align};${k === d.level ? `color:var(--${lvl});font-weight:600` : ''}" class="${k === d.level ? '' : 'faint'}">${T(LEVEL[k][1])}</span>`;
  const map = mapBox('report', { center: [p.lon, p.lat], zoom: 15.5, plot: p, features: d.features }, plotLegend(d.features));
  return `${header()}<div class="wrap">
  <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:center">${crumbs([t('Search'), p.city || t('Kazakhstan'), p.title])}<span class="badge ${d.osm && d.osm.ok ? 'b-acc' : 'b-mid'}">${T('Live data')}</span></div>
  <div class="row" style="align-items:${m ? 'stretch' : 'flex-end'};justify-content:space-between">${identity(p)}
    <div style="display:flex;gap:8px;flex:none">${watchBtn(m ? 'grow' : '')}
      <button type="button" class="btn btn-s" data-act="pdf">${I.down}${m ? 'PDF' : T('Download PDF')}</button>
    </div></div>
  <div class="row"><div style="${m ? '' : 'flex:1.3;min-width:0'}">${map}</div>
    <div class="col grow" style="gap:16px">
      <div class="panel pad verdict">
        <div style="display:flex;justify-content:space-between;gap:12px"><div class="col" style="gap:8px"><span class="eyebrow">${T('Check result')}</span><span style="display:flex;align-items:center;gap:10px"><span style="width:12px;height:12px;border-radius:50%;background:var(--${lvl});box-shadow:0 0 0 5px var(--${lvl}-tint)"></span><span class="h1" style="color:var(--${lvl})">${T(lvlLabel)}</span></span></div>
        <div class="col" style="align-items:flex-end;gap:4px"><span class="eyebrow">${T('Checked')}</span><span class="small mute num">${fmtDate(r.created_at)}</span></div></div>
        <div><div class="gauge"><i style="background:${seg('low')}"></i><i style="background:${seg('mid')}"></i><i style="background:${seg('high')}"></i></div>
        <div style="display:grid;grid-template-columns:repeat(3,1fr);margin-top:6px" class="cap">${lab('low', 'left')}${lab('mid', 'center')}${lab('high', 'right')}</div></div>
        <p>${esc(headline(d))}</p>
        <div class="counts"><div><b style="color:var(--high)">${d.counts.high}</b><span class="cap faint">${T('high')}</span></div><div><b style="color:var(--mid)">${d.counts.mid}</b><span class="cap faint">${T('medium')}</span></div><div><b style="color:var(--low)">${d.counts.low}</b><span class="cap faint">${T('low')}</span></div></div>
      </div>
      <button type="button" class="ai-cta" data-href="#/ai/${r.id}"><span class="spark">${I.spark}</span><span class="col grow" style="gap:2px"><b style="font-size:15px">${T('Ask Garant AI about this plot')}</b><p>${T('Plain-language answers based on this report and the published decrees.')}</p></span>${I.chev}</button>
    </div></div>
  <div class="col" style="gap:18px;padding-top:6px">
    <div class="tabs" role="tablist">${tabs.map(([k, l, n]) => `<button type="button" role="tab" aria-selected="${S.tab === k}" class="${S.tab === k ? 'on' : ''}" data-tab="${k}">${T(l)}${n ? `<em>${n}</em>` : (S.history.length > 1 ? '<span style="width:6px;height:6px;border-radius:50%;background:var(--accent)"></span>' : '')}</button>`).join('')}</div>
    <div id="tabBody">${reportTab()}</div>
  </div>${footer()}</div>`;
}

function suggestions() {
  const seized = S.report && S.report.data.items.some((i) => i.code.indexOf('seizure') === 0);
  return ['Is it safe to buy this plot?', 'What should I check before signing?', seized ? 'Will I get compensation if the plot is seized?' : 'What do these risks mean if I want to build a house?'];
}
const aiTag = () => `<div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;color:var(--accent-text);font-weight:600;font-size:12px">${I.spark.replace('width="22" height="22"', 'width="14" height="14"')}${T('Garant AI')}</div>`;
function chatHTML() {
  const msgs = S.chat.map((c) => (c.role === 'user' ? `<div class="msg user">${esc(c.content)}</div>` : `<div class="msg ai">${aiTag()}${esc(c.content)}${c.sources && c.sources.length ? `<div class="src">${c.sources.map((s) => `<span>${esc(s === 'Land Code of Kazakhstan' ? t(s) : s)}</span>`).join('')}</div>` : ''}</div>`)).join('');
  const asked = new Set(S.chat.filter((c) => c.role === 'user').map((c) => c.content));
  return `<div class="chat" id="chatLog" aria-live="polite">${msgs}${S.chatBusy ? `<div class="msg ai typing">${aiTag()}${T('Garant AI is thinking…')}</div>` : ''}</div>
    <div class="col" style="gap:8px"><span class="cap faint">${T('Try a question')}</span><div class="sugg">${suggestions().map((s) => `<button type="button" data-ask="${esc(t(s))}" ${S.chatBusy || asked.has(t(s)) ? 'disabled' : ''}>${T(s)}</button>`).join('')}</div></div>
    <form class="composer" data-form="ai"><input name="q" type="text" maxlength="500" autocomplete="off" placeholder="${T('Ask about this plot…')}" aria-label="${T('Ask a question')}" ${S.chatBusy ? 'disabled' : ''}><button type="submit" class="btn btn-p" style="height:40px;padding:0 14px" aria-label="${T('Send')}" ${S.chatBusy ? 'disabled' : ''}>${I.send}</button></form>
    <p class="cap faint">${T('AI answers can be wrong. Check the cited documents before you make a decision.')}</p>`;
}
function sAI() {
  if (!S.report || S.report.id !== S.route.id) return stateScreen();
  const m = S.m, p = S.plot, bullets = (S.summary && S.summary[S.lang]) || null;
  const summary = `<div class="panel pad ai-sum"><div style="display:flex;gap:8px;align-items:center;justify-content:space-between"><span class="eyebrow">${T('AI summary of this plot')}</span><span class="badge b-ai">${T('Beta')}</span></div>
    ${bullets ? `<ul class="small">${bullets.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : `<div class="loading" style="padding:14px 0 0"><span class="spin"></span><span class="small mute">${T('Loading…')}</span></div>`}</div>`;
  const uses = `<div class="panel pad col" style="gap:10px"><span class="eyebrow">${T('What the AI uses')}</span>${['This plot’s risk report', 'Published akimat seizure decrees', 'Land Code of Kazakhstan'].map((x) => `<span class="check"><span style="color:var(--accent)">${I.doc}</span>${T(x)}</span>`).join('')}</div>`;
  const chatCol = `<div class="col grow" style="gap:16px;min-width:0" id="chatCol">${chatHTML()}</div>`;
  return `${header()}<div class="wrap">
  <button type="button" class="btn btn-g" data-href="#/report/${S.report.id}" style="align-self:flex-start;padding:0;height:auto">${I.back}${T('Back to report')}</button>
  <div style="display:flex;gap:14px;align-items:center"><span class="spark" style="width:48px;height:48px;flex:none;border-radius:14px;display:grid;place-items:center;background:linear-gradient(135deg,#0e9f4e,#19c160);color:#fff">${I.spark}</span>
    <div class="col" style="min-width:0"><h1 class="h1">${T('Garant AI')}</h1><span class="small mute">${esc(p.title)}${p.cadastral_no ? ' · ' + esc(p.cadastral_no) : ''}</span></div></div>
  <div class="row" style="align-items:flex-start">${m ? summary + chatCol + uses : chatCol + `<div class="col" style="gap:16px;width:400px;flex:none">${summary}${uses}${watchBtn('full', true)}</div>`}</div>
  ${m ? watchBtn('full', true) : ''}
  ${footer()}</div>`;
}

function sPlots() {
  const m = S.m;
  if (S.plots === null) return `${header('plots')}<div class="wrap"><div class="col" style="gap:6px"><h1 class="h1">${T('My plots')}</h1></div>${loadingBox('Loading…')}${footer()}</div>`;
  const all = S.plots, changed = all.filter((p) => p.has_changes), high = all.filter((p) => p.level === 'high');
  const list = S.pfilter === 'changes' ? changed : S.pfilter === 'high' ? high : all;
  const sub = ru() ? `Под наблюдением участков: ${all.length}. Мы перепроверяем их, когда вы открываете эту страницу, не чаще раза в сутки.` : `You’re watching ${all.length} ${all.length === 1 ? 'plot' : 'plots'}. We re-check them when you open this page, at most once a day.`;
  const cards = list.map((p) => {
    const lv = p.level ? LEVEL[p.level] : null;
    const meta = [p.area_m2 ? fmtArea(p.area_m2) : '', p.city].filter(Boolean).join(' · ');
    return `<button type="button" class="panel plot" style="${m ? '' : 'flex:0 1 calc((100% - 32px) / 3)'}" ${p.report_id ? `data-href="#/report/${p.report_id}"` : ''} data-plot="${esc(p.plot_id)}">
    <span style="display:flex;justify-content:space-between;align-items:center;gap:8px">${lv ? `<span class="badge b-${lv[0]}">${T(lv[2])}</span>` : `<span class="badge b-acc">${T('Not checked yet')}</span>`}${p.has_changes ? `<span class="newdot">${T('New changes')}</span>` : ''}</span>
    <span class="col" style="gap:4px;min-width:0"><b class="h3">${esc(p.title)}</b>${p.cadastral_no ? `<span class="mono small mute">${esc(p.cadastral_no)}</span>` : ''}<span class="small faint">${esc(meta)}</span></span>
    <span class="hr"></span><span style="display:flex;justify-content:space-between;align-items:center" class="cap faint">${p.checked_at ? `${T('Updated')} ${fmtDate(p.checked_at)}` : T('Not checked yet')}${I.chev}</span></button>`;
  }).join('');
  return `${header('plots')}<div class="wrap">
  <div class="row" style="align-items:${m ? 'stretch' : 'flex-end'};justify-content:space-between"><div class="col" style="gap:6px"><h1 class="h1">${T('My plots')}</h1><p class="small mute">${esc(sub)}</p></div>
  <a class="btn btn-s" href="#/">${I.plus}${T('Add plot')}</a></div>
  ${all.length ? `<div class="chips">${[['all', 'All', all.length], ['changes', 'With changes', changed.length], ['high', 'High risk', high.length]].map(([k, l, n]) => `<button type="button" class="chip ${S.pfilter === k ? 'on' : ''}" data-pfilter="${k}">${T(l)} · ${n}</button>`).join('')}</div>
  <div class="row" style="gap:16px;flex-wrap:wrap">${cards}</div>` : `<div class="panel empty"><b class="h3">${T('You are not watching any plots yet.')}</b><p class="mute small">${T('Find a plot, open its report and press “Watch this plot”.')}</p><a class="btn btn-p" href="#/">${T('Find a plot')}</a></div>`}
  <div class="info"><span style="width:8px;height:8px;border-radius:50%;background:var(--accent);margin-top:6px;flex:none"></span><span>${T('When a re-check finds a new risk or the risk level changes, the plot is marked “New changes” and a notification appears.')}</span></div>
  ${footer()}</div>`;
}

function notifText(n) {
  const p = n.params || {}, plot = p.plot_title || '';
  const lv = (k) => t((LEVEL[k] || LEVEL.low)[1]).toLowerCase();
  if (n.kind === 'level_changed') return [t('Risk level changed'), `${plot} · ${t('Risk level').toLowerCase()}: ${lv(p.from)} → ${lv(p.to)}`];
  const title = itemText({ code: p.code, params: { project: { title_ru: p.title_ru, title_en: p.title_en }, hits: [] } })[0];
  return [`${t(n.kind === 'new_risk' ? 'New risk found' : 'A risk is no longer found')}: ${title.toLowerCase()}`, [plot, ru() ? p.title_ru : p.title_en].filter(Boolean).join(' · ')];
}
function notifList() {
  const all = S.notifs || [], list = all.filter((n) => S.nfilter === 'all' || !n.read_at);
  if (!list.length) return `<div class="empty"><b class="h3">${T('No notifications yet.')}</b><p class="mute small">${T('They appear when a re-check of a watched plot finds changes.')}</p></div>`;
  return list.map((n) => { const [h, s] = notifText(n); return `<button type="button" class="nitem ${n.read_at ? '' : 'unread'}" data-notif="${n.id}"><span class="ndot"></span><span class="col grow" style="gap:3px;min-width:0"><b style="font-weight:600">${esc(h)}</b><span class="small mute">${esc(s)}</span><span class="cap" style="display:flex;gap:16px;padding-top:4px"><span class="faint num">${fmtDate(n.created_at)}</span>${n.report_id ? `<span style="color:var(--accent-text);font-weight:600">${T('Open report')}</span>` : ''}</span></span></button>`; }).join('');
}
function sNotif() {
  const m = S.m;
  if (S.notifs === null) return `${header()}<div class="wrap"><div class="col" style="gap:6px"><h1 class="h1">${T('Notifications')}</h1></div>${loadingBox('Loading…')}${footer()}</div>`;
  const unread = S.notifs.filter((n) => !n.read_at).length, pr = S.profile || {};
  const sets = [['notify_risk', 'Risk level changes', 'When a re-check gives a new level'], ['notify_docs', 'New risks', 'A new seizure decree, construction site or planned road'], ['notify_digest', 'Risks that disappeared', 'When a risk is no longer found']];
  const settings = `<div class="panel" style="padding:20px 20px 6px;${m ? '' : 'width:400px;flex:none'}"><h3 class="h3">${T('Notification settings')}</h3><p class="small mute" style="margin:4px 0 12px;overflow-wrap:anywhere">${T('Shown here for')} ${esc((S.user && S.user.email) || '')}</p>
    ${sets.map((s) => `<div class="setrow"><div class="col grow"><b style="font-weight:600;font-size:14px">${T(s[1])}</b><span class="cap faint">${T(s[2])}</span></div><button type="button" class="toggle" role="switch" aria-checked="${pr[s[0]] !== false}" aria-label="${T(s[1])}" data-tg="${s[0]}"></button></div>`).join('')}</div>`;
  return `${header()}<div class="wrap">
  <div class="col" style="gap:6px"><h1 class="h1">${T('Notifications')}</h1><p class="small mute">${unread} ${T('unread')}</p></div>
  <div class="row" style="align-items:flex-start"><div class="panel grow" style="overflow:hidden;${m ? 'width:100%' : ''}">
    <div class="tabs" style="padding:14px 20px 0"><button type="button" class="${S.nfilter === 'all' ? 'on' : ''}" data-nf="all">${T('All')}</button><button type="button" class="${S.nfilter === 'unread' ? 'on' : ''}" data-nf="unread">${T('Unread')} · ${unread}</button></div>
    <div id="notifBody">${notifList()}</div>
  </div>${settings}</div>${footer()}</div>`;
}
function sPrivacy() {
  const R = ru();
  const ps = R ? ['Garant хранит только то, что нужно для работы: ваш e-mail, имя (если вы его указали), сохранённые участки, отчёты и вопросы ИИ-помощнику.', 'Пароль хранится в виде хеша в сервисе Supabase Auth; мы его не видим. Ваши участки и отчёты защищены на уровне базы данных и доступны только вашему аккаунту.', 'Чтобы найти адрес, запрос отправляется в OpenStreetMap Nominatim. Чтобы ответить на вопрос, ИИ-провайдеру (Groq) отправляется текст отчёта и ваш вопрос, без e-mail и имени.', 'Мы не продаём данные и не показываем рекламу. Чтобы удалить аккаунт и все данные, напишите владельцу сайта.']
    : ['Garant stores only what it needs to work: your email, your name (if you gave one), saved plots, reports and your questions to the AI assistant.', 'Your password is stored as a hash by Supabase Auth; we never see it. Your plots and reports are protected at the database level and are available only to your account.', 'To find an address, the query is sent to OpenStreetMap Nominatim. To answer a question, the report text and your question are sent to the AI provider (Groq), without your email or name.', 'We do not sell data or show ads. To delete your account and all data, contact the site owner.'];
  return `${header()}<div class="wrap"><div class="panel pad col setup" style="gap:14px"><h1 class="h2">${T('Privacy policy')}</h1>${ps.map((x) => `<p class="mute">${esc(x)}</p>`).join('')}</div>${footer()}</div>`;
}
function sSetup() {
  return `<div class="scr ${S.m ? 'm' : 'd'}"><header class="hdr"><span class="logo">${LOGO}<span>Garant</span></span></header><div class="wrap"><div class="panel pad col setup" style="gap:12px"><h1 class="h2">${T('Garant is not set up yet')}</h1><p class="mute">${T('The site owner has to add the Supabase project address and key to config.js.')}</p></div></div></div>`;
}
const SCREEN = { home: sHome, search: sSearch, plot: sPreview, login: sSignin, report: sReport, ai: sAI, plots: sPlots, notifications: sNotif, privacy: sPrivacy };

/* ================= rendering ================= */
const app = document.getElementById('app');
function render() {
  for (const k of Object.keys(MAPS)) delete MAPS[k];
  const fn = SCREEN[S.route.name] || sHome;
  app.innerHTML = `<div class="scr ${S.m ? 'm' : 'd'}" data-screen="${S.route.name}">${fn()}</div>`;
  document.documentElement.lang = S.lang;
  mountMaps();
}
const patch = (id, html) => { const el = document.getElementById(id); if (el) el.innerHTML = html; else render(); };
function patchChat() { patch('chatCol', chatHTML()); const log = document.getElementById('chatLog'); if (log && log.lastElementChild) log.lastElementChild.scrollIntoView({ block: 'nearest' }); }
let tt;
function toast(msg) { const el = document.getElementById('toast'); el.textContent = t(msg); el.classList.add('show'); clearTimeout(tt); tt = setTimeout(() => el.classList.remove('show'), 3800); }

/* ================= actions ================= */
const AUTH_ERR = { invalid: 'Wrong email or password.', exists: 'This email is already registered. Sign in instead.', rate: 'Too many attempts. Wait a minute and try again.', unconfirmed: 'Confirm your email first: open the link we sent you.', weak: 'This password is too weak. Choose a longer one.', network: 'No connection to the server. Check the internet and try again.', other: 'Something went wrong. Try again.' };
const AI_ERR = { ai_limit: 'You have used today’s 20 questions. Come back tomorrow.', ai_busy: 'The AI is busy right now. Try again in a minute.', ai_not_configured: 'The AI assistant is not connected yet. The report itself works.', ai_bad_key: 'The AI assistant is not connected yet. The report itself works.', network: 'No connection to the server. Check the internet and try again.' };
const go = (hash) => { if (location.hash === hash) route(); else location.hash = hash; };
function setCand(c) { S.cand = c; S.reportErr = ''; store.set('garant.cand', c); }

async function pickPoint(lat, lon) {
  if (!inKZ(lat, lon)) return;
  setCand(await geoReverse(lat, lon));
  go('#/plot'); if (S.route.name === 'plot') render();
}
function chooseResult(i) {
  const res = (S.results || []).filter(inFilter);
  if (!res[i]) return;
  const c = res[i];
  if (c.notice) { S.results = null; S.searchErr = ''; render(); candFromNotice(c.notice).then((cc) => { setCand(cc); go('#/plot'); }); return; }
  setCand(c); go('#/plot');
}
let searchSeq = 0;
async function runSearch(query) {
  const seq = ++searchSeq;
  S.q = query; S.results = null; S.searchErr = ''; S.sel = 0; S.filter = 'all';
  render();
  if (query.length < 2) { S.results = []; S.searchErr = 'Type an address, a place or a cadastral number.'; render(); return; }
  try {
    if (CAD_RE.test(query)) {
      const rows = await API.cadastral(query);
      if (seq !== searchSeq) return;
      S.results = rows.map((n) => ({ title: n.raw_address, sub: `${n.cadastral_no} · ${L(n.project, 'title')}`, kind: 'registry', lat: 0, lon: 0, notice: n }));
      if (!rows.length) S.searchErr = 'This cadastral number is not in the seizure registry. To check map risks, search by address or click the map.';
      else { const cc = await Promise.all(rows.slice(0, 3).map(candFromNotice)); if (seq !== searchSeq) return; S.results = cc.map((c, i) => ({ ...c, notice: null, sub: `${rows[i].cadastral_no} · ${L(rows[i].project, 'title')}` })); }
    } else {
      const rows = await geoSearch(query);
      if (seq !== searchSeq) return;
      S.results = rows;
    }
  } catch (e) { if (seq !== searchSeq) return; S.results = []; S.searchErr = 'Search is temporarily unavailable. Try again in a minute.'; }
  if (S.route.name === 'search') render();
}
async function openReport() {
  if (!S.cand) return go('#/');
  if (!S.user) { S.afterLogin = 'report'; return go('#/login'); }
  S.checking = true; S.reportErr = ''; render();
  const res = await API.check({ plot: S.cand });
  S.checking = false;
  if (!res || !res.ok) {
    if (res && res.error === 'not_signed_in') { S.user = null; S.afterLogin = 'report'; return go('#/login'); }
    S.reportErr = res && res.error === 'network' ? AUTH_ERR.network : 'The report could not be loaded.';
    return render();
  }
  S.report = res.report; S.plot = res.plot; S.tab = 'risks'; S.history = []; S.saved = false; S.chat = []; S.summary = res.report.ai_summary || null;
  go('#/report/' + res.report.id);
}
async function loadReport(id, forAi) {
  S.reportErr = '';
  if (!S.report || S.report.id !== id) {
    S.report = null; render();
    const row = await API.getReport(id);
    if (S.route.id !== id) return;
    if (!row) { S.reportErr = 'Report not found. It may belong to another account.'; return render(); }
    S.report = row; S.plot = row.plot; S.tab = 'risks'; S.chat = []; S.summary = row.ai_summary || null; S.history = [];
  }
  render();
  const plotId = S.plot.id;
  const [saved, history] = await Promise.all([API.isSaved(plotId), API.history(plotId)]);
  if (S.route.id !== id) return;
  S.saved = !!saved; S.history = history || [];
  if (saved && saved.has_changes) API.clearChanges(plotId);
  if (forAi) {
    const chat = await API.chat(id);
    if (S.route.id !== id) return;
    S.chat = chat || [];
    render();
    loadSummary(id);
  } else render();
}
async function loadSummary(id) {
  if (S.summary && S.summary[S.lang]) return;
  const lang = S.lang, res = await API.summary(id, lang);
  if (!S.report || S.report.id !== id) return;
  S.summary = { ...(S.summary || {}), [lang]: res && res.ok && res.bullets && res.bullets.length ? res.bullets : fallbackSummary(S.report.data) };
  if (S.route.name === 'ai' && S.route.id === id) render();
}
async function ask(question) {
  question = String(question || '').trim();
  if (question.length < 2 || S.chatBusy || !S.report) return;
  const id = S.report.id;
  S.chat.push({ role: 'user', content: question }); S.chatBusy = true; patchChat();
  const res = await API.ask(id, question, S.lang);
  S.chatBusy = false;
  if (!S.report || S.report.id !== id) return;
  if (res && res.ok) S.chat.push({ role: 'assistant', content: res.answer, sources: res.sources || [] });
  else { S.chat.pop(); toast(AI_ERR[res && res.error] || 'The AI could not answer. Try again.'); }
  if (S.route.name === 'ai') patchChat();
}
async function toggleWatch(after) {
  if (!S.plot) return;
  const want = !S.saved;
  const ok = want ? await API.save(S.plot.id) : await API.unsave(S.plot.id);
  if (!ok) return toast('Something went wrong. Try again.');
  S.saved = want; S.plots = null;
  toast(want ? 'Added to My plots. Changes will appear in Notifications.' : 'Removed from My plots.');
  if (want && after) go('#/plots'); else render();
}
async function recheck() {
  if (!S.plot || S.checking) return;
  S.checking = true; toast('Checking the plot…');
  const res = await API.check({ plot_id: S.plot.id, force: true });
  S.checking = false;
  if (!res || !res.ok) return toast('The report could not be loaded.');
  S.report = res.report; S.plot = res.plot; S.summary = null; S.chat = [];
  go('#/report/' + res.report.id);
}
async function loadPlots() {
  S.plots = await API.myPlots(); if (S.route.name === 'plots') render();
  // re-check plots whose last report is older than a day (a few per visit, one after another)
  const stale = (S.plots || []).filter((p) => !p.checked_at || Date.now() - Date.parse(p.checked_at) > 24 * 3600 * 1000).slice(0, 3);
  if (!stale.length) return;
  for (const p of stale) await API.check({ plot_id: p.plot_id, force: true });
  if (S.route.name !== 'plots') { S.plots = null; return; }
  S.plots = await API.myPlots(); refreshUnread(); if (S.route.name === 'plots') render();
}
async function loadNotifs() { S.notifs = await API.notifications(); S.unread = (S.notifs || []).filter((n) => !n.read_at).length; if (S.route.name === 'notifications') render(); }
async function refreshUnread() { if (!S.user) { S.unread = 0; return; } const n = await API.unread(); if (n !== S.unread) { S.unread = n; render(); } }
async function submitSign(form) {
  const f = new FormData(form), up = S.signTab === 'up';
  const email = String(f.get('email') || '').trim(), password = String(f.get('password') || ''), name = String(f.get('name') || '').trim();
  S.authErr = '';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) S.authErr = 'Enter a valid email address.';
  else if (password.length < 8) S.authErr = 'The password must be at least 8 characters long.';
  else if (up && !name) S.authErr = 'Enter your name.';
  if (S.authErr) { render(); refill(form, { email, name }); return; }
  S.authBusy = true; render(); refill(null, { email, name });
  const res = up ? await API.signUp(name, email, password) : await API.signIn(email, password);
  S.authBusy = false;
  if (res.error) { S.authErr = AUTH_ERR[res.error] || AUTH_ERR.other; render(); refill(null, { email, name }); return; }
  if (res.needsConfirm) { S.signTab = 'in'; render(); refill(null, { email }); toast('We sent a confirmation link to your email. Open it to finish sign-up.'); return; }
  await onSignedIn(res.user);
}
function refill(_f, vals) { for (const k of Object.keys(vals)) { const el = app.querySelector(`[data-form="sign"] [name="${k}"]`); if (el && vals[k]) el.value = vals[k]; } }
async function onSignedIn(user) {
  S.user = user; S.authErr = '';
  S.profile = await API.profile();
  if (S.profile && S.profile.lang !== S.lang) API.updateProfile({ lang: S.lang });
  S.unread = await API.unread();
  const next = S.afterLogin, back = S.back; S.afterLogin = null; S.back = null;
  if (next === 'report' && S.cand) return openReport();
  if (back && location.hash === back) return route();        // came from a private page: open it now
  if (S.route.name === 'login') go(S.cand ? '#/plot' : '#/plots'); else route();
}
async function signOut() {
  await API.signOut();
  S.user = null; S.profile = null; S.unread = 0; S.menu = false; S.report = null; S.plot = null; S.plots = null; S.notifs = null; S.chat = [];
  toast('Signed out.'); go('#/');
}

/* ================= router ================= */
const PRIVATE = { report: 1, ai: 1, plots: 1, notifications: 1 };
function parseHash() {
  const h = location.hash.indexOf('#/') === 0 ? location.hash.slice(2) : '';
  const [path, qs] = h.split('?'), seg = path.split('/').filter(Boolean);
  const name = seg[0] || 'home';
  return { name: SCREEN[name] ? name : 'home', id: seg[1] || null, q: new URLSearchParams(qs || '').get('q') || '', up: /(^|&)up=1/.test(qs || '') };
}
function route() {
  if (!S.ready) return;
  const r = parseHash(), prev = S.route;
  S.route = r; S.menu = false;
  if (PRIVATE[r.name] && !S.user) { S.afterLogin = null; S.back = location.hash; S.route = { name: 'login', id: null, q: '' }; S.signTab = 'in'; render(); return; }
  if (r.name !== prev.name || r.id !== prev.id) window.scrollTo(0, 0);
  if (r.name === 'login') { if (r.up) S.signTab = 'up'; if (S.user && !S.recovery) return go(S.cand ? '#/plot' : '#/plots'); S.authErr = ''; return render(); }
  if (r.name === 'search') { if (r.q !== S.q || S.results === null) return void runSearch(r.q); return render(); }
  if (r.name === 'report' || r.name === 'ai') { if (!r.id) return go('#/plots'); return void loadReport(r.id, r.name === 'ai'); }
  if (r.name === 'plots') { render(); return void loadPlots(); }
  if (r.name === 'notifications') { render(); return void loadNotifs(); }
  render();
}

/* ================= events ================= */
document.addEventListener('click', (e) => {
  const el = e.target.closest('button, [data-href]');
  if (!el) { if (S.menu && !e.target.closest('.menu')) { S.menu = false; render(); } return; }
  const d = el.dataset;
  if (d.zoom) return;
  if (d.lang) { if (S.lang !== d.lang) { S.lang = d.lang; store.set('garant.lang', S.lang); if (S.user) API.updateProfile({ lang: S.lang }); render(); if (S.route.name === 'ai' && S.report) loadSummary(S.report.id); } return; }
  if (d.act === 'theme') return setTheme(S.theme === 'dark' ? 'light' : 'dark', true);
  if (d.act === 'menu') { S.menu = !S.menu; return render(); }
  if (d.act === 'signout') return void signOut();
  if (d.act === 'open-report') { if (d.signtab) S.signTab = d.signtab; else S.signTab = 'in'; return void openReport(); }
  if (d.signtab) { S.signTab = d.signtab; S.authErr = ''; const keep = {}; app.querySelectorAll('[data-form="sign"] input').forEach((i) => { if (i.name !== 'password') keep[i.name] = i.value; }); render(); return refill(null, keep); }
  if (d.act === 'forgot') {
    const mail = (app.querySelector('[data-form="sign"] [name="email"]') || {}).value || '';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(mail.trim())) return toast('Enter your email above, then press “Forgot password?”.');
    if (!(window.GARANT_CONFIG || {}).EMAIL_ENABLED) return toast('Password reset by email is not switched on yet. Write to the site owner.');
    API.resetPassword(mail.trim()); return toast('If this email is registered, we sent a link to reset the password.');
  }
  if (d.result) return chooseResult(+d.result);
  if (d.filter) { S.filter = d.filter; S.sel = 0; return render(); }
  if (d.tab) { S.tab = d.tab; app.querySelectorAll('[data-tab]').forEach((b) => { const on = b.dataset.tab === S.tab; b.classList.toggle('on', on); b.setAttribute('aria-selected', on); }); return patch('tabBody', reportTab()); }
  if (d.act === 'watch') return void toggleWatch(d.after === 'plots');
  if (d.act === 'pdf') { toast('In the print window choose “Save as PDF”.'); return void setTimeout(() => window.print(), 350); }
  if (d.act === 'recheck') return void recheck();
  if (d.ask) return void ask(d.ask);
  if (d.pfilter) { S.pfilter = d.pfilter; return render(); }
  if (d.nf) { S.nfilter = d.nf; return render(); }
  if (d.tg) { const cur = !S.profile || S.profile[d.tg] !== false; S.profile = { ...(S.profile || {}), [d.tg]: !cur }; el.setAttribute('aria-checked', String(!cur)); return void API.updateProfile({ [d.tg]: !cur }); }
  if (d.notif) {
    const n = (S.notifs || []).find((x) => String(x.id) === d.notif);
    if (!n) return;
    if (!n.read_at) { n.read_at = new Date().toISOString(); S.unread = Math.max(0, S.unread - 1); API.markRead(n.id); }
    if (n.report_id) return go('#/report/' + n.report_id);
    return render();
  }
  if (d.href) { e.preventDefault(); return go(d.href); }
});
document.addEventListener('submit', (e) => {
  const form = e.target, kind = form.dataset && form.dataset.form;
  if (!kind) return;
  e.preventDefault();
  if (kind === 'search') { const query = String(new FormData(form).get('q') || '').trim(); if (!query) return; S.results = null; return go('#/search?q=' + encodeURIComponent(query)); }
  if (kind === 'sign') return void submitSign(form);
  if (kind === 'ai') { const query = new FormData(form).get('q'); return void ask(query); }
  if (kind === 'newpass') {
    const pw = String(new FormData(form).get('password') || '');
    if (pw.length < 8) { S.authErr = 'The password must be at least 8 characters long.'; return render(); }
    S.authBusy = true; render();
    API.setPassword(pw).then((res) => { S.authBusy = false; if (res.error) { S.authErr = AUTH_ERR[res.error] || AUTH_ERR.other; return render(); } S.recovery = false; toast('Password saved.'); go('#/plots'); });
  }
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && S.menu) { S.menu = false; render(); } });
window.addEventListener('hashchange', route);
let rz; window.addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => { const m = window.innerWidth < 860; if (m !== S.m) { S.m = m; render(); } }, 150); });

/* ================= backend (Supabase) ================= */
function authCode(error) {
  if (!error) return null;
  const msg = String(error.message || '').toLowerCase(), code = String(error.code || '');
  if (code === 'invalid_credentials' || msg.includes('invalid login')) return 'invalid';
  if (code === 'user_already_exists' || msg.includes('already registered')) return 'exists';
  if (code === 'email_not_confirmed' || msg.includes('not confirmed')) return 'unconfirmed';
  if (code === 'weak_password' || msg.includes('weak') || msg.includes('at least')) return 'weak';
  if (error.status === 429 || code.includes('rate_limit') || msg.includes('rate limit')) return 'rate';
  if (msg.includes('fetch') || msg.includes('network')) return 'network';
  return 'other';
}
function realApi(sb) {
  const base = location.origin + location.pathname;
  const rows = async (query) => { try { const { data, error } = await query; return error ? null : data; } catch (e) { return null; } };
  const fn = async (body) => {
    try {
      const { data, error } = await sb.functions.invoke('garant', { body });
      if (error) { try { const j = await error.context.json(); if (j && j.error) return j; } catch (e) { /* not json */ } return { ok: false, error: 'network' }; }
      return data && typeof data === 'object' ? data : { ok: false, error: 'network' };
    } catch (e) { return { ok: false, error: 'network' }; }
  };
  const uid = () => (S.user ? S.user.id : null);
  return {
    async session() { try { const { data } = await sb.auth.getSession(); return data && data.session ? data.session.user : null; } catch (e) { return null; } },
    onAuth(cb) { sb.auth.onAuthStateChange((event, session) => setTimeout(() => cb(event, session ? session.user : null), 0)); },
    async signIn(email, password) { try { const { data, error } = await sb.auth.signInWithPassword({ email, password }); return { error: authCode(error), user: data && data.user }; } catch (e) { return { error: 'network' }; } },
    async signUp(name, email, password) {
      try {
        const { data, error } = await sb.auth.signUp({ email, password, options: { data: { full_name: name }, emailRedirectTo: base } });
        if (error) return { error: authCode(error) };
        // Supabase answers "ok" for an address that already exists (to hide who is registered): no identities means that case
        if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) return { error: 'exists' };
        return { error: null, user: data.user, needsConfirm: !data.session };
      } catch (e) { return { error: 'network' }; }
    },
    async signOut() { try { await sb.auth.signOut(); } catch (e) { /* local state is cleared anyway */ } },
    async resetPassword(email) { try { await sb.auth.resetPasswordForEmail(email, { redirectTo: base }); } catch (e) { /* same message either way */ } },
    async setPassword(password) { try { const { error } = await sb.auth.updateUser({ password }); return { error: authCode(error) }; } catch (e) { return { error: 'network' }; } },
    async profile() { const r = await rows(sb.from('profiles').select('*').eq('id', uid()).maybeSingle()); return r || null; },
    async updateProfile(p) { await rows(sb.from('profiles').update(p).eq('id', uid())); },
    async cadastral(no) { return (await rows(sb.from('seizure_notices').select('*, project:seizure_projects(*)').eq('cadastral_no', no).limit(5))) || []; },
    async check(body) {
      let p = body.plot;
      if (!p && body.plot_id) p = (S.plot && S.plot.id === body.plot_id) ? S.plot : await rows(sb.from('plots').select('lat, lon, geom').eq('id', body.plot_id).maybeSingle());
      const extra = await mapDataFor(p);
      return fn({ action: 'check', ...body, ...extra });
    },
    ask: (report_id, question, lang) => fn({ action: 'ask', report_id, question, lang }),
    summary: (report_id, lang) => fn({ action: 'summary', report_id, lang }),
    async getReport(id) { return rows(sb.from('reports').select('*, plot:plots(*)').eq('id', id).maybeSingle()); },
    async history(plotId) { return (await rows(sb.from('reports').select('id, level, created_at').eq('plot_id', plotId).order('created_at', { ascending: true }).limit(50))) || []; },
    async isSaved(plotId) { return rows(sb.from('saved_plots').select('plot_id, has_changes').eq('plot_id', plotId).maybeSingle()); },
    async save(plotId) { const { error } = await sb.from('saved_plots').upsert({ plot_id: plotId, user_id: uid() }, { onConflict: 'user_id,plot_id', ignoreDuplicates: true }); return !error; },
    async unsave(plotId) { const { error } = await sb.from('saved_plots').delete().eq('plot_id', plotId); return !error; },
    async clearChanges(plotId) { await rows(sb.from('saved_plots').update({ has_changes: false }).eq('plot_id', plotId)); },
    async myPlots() { return (await rows(sb.rpc('my_plots'))) || []; },
    async notifications() { return (await rows(sb.from('notifications').select('*').order('created_at', { ascending: false }).limit(50))) || []; },
    async unread() { try { const { count } = await sb.from('notifications').select('id', { count: 'exact', head: true }).is('read_at', null); return count || 0; } catch (e) { return 0; } },
    async markRead(id) { await rows(sb.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', id)); },
    async chat(reportId) { return (await rows(sb.from('ai_messages').select('role, content, sources').eq('report_id', reportId).order('id', { ascending: true }).limit(100))) || []; }
  };
}

/* ================= start ================= */
async function start() {
  const cfg = window.GARANT_CONFIG || {};
  if (window.GARANT_API) API = window.GARANT_API;                       // used by the automated tests
  else if (cfg.SUPABASE_URL && cfg.SUPABASE_KEY && window.supabase && window.supabase.createClient) {
    API = realApi(window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' } }));
  }
  if (!API) { app.innerHTML = sSetup(); return; }
  S.user = await API.session();
  if (S.user) { S.profile = await API.profile(); S.unread = await API.unread(); }
  API.onAuth((event, user) => {
    if (event === 'PASSWORD_RECOVERY') { S.user = user; S.recovery = true; S.route = { name: 'login', id: null, q: '' }; return render(); }
    if (event === 'SIGNED_OUT' && S.user) { S.user = null; S.profile = null; S.unread = 0; route(); }
    if (event === 'SIGNED_IN' && user && !S.user) { S.user = user; API.profile().then((p) => { S.profile = p; route(); }); }
  });
  S.ready = true;
  route();
}
start();
})();
