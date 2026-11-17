const get = id => document.getElementById(id);
const apiRoot = '/api/v1';
const statusLabels = {
  Reporting: 'เปิดบันทึกยอดปล่อย',
  Trading: 'เปิดซื้อขาย',
  Closed: 'ปิดรอบแล้ว',
  Pending: 'รอแอดมินตรวจสอบ',
  Rejected: 'ไม่อนุมัติ',
  Approved: 'อนุมัติยอดปล่อยแล้ว',
  Open: 'อนุมัติ · เปิดขาย',
  Completed: 'ขายครบแล้ว',
  Cancelled: 'ยกเลิกแล้ว'
};
const activities = {
  ELECTRICITY: ['การใช้ไฟฟ้า', 'kWh'],
  DIESEL: ['น้ำมันดีเซล', 'ลิตร'],
  GASOLINE: ['น้ำมันเบนซิน', 'ลิตร'],
  WATER: ['การใช้น้ำ', 'ลบ.ม.']
};
const navLinks = [...document.querySelectorAll('.section-nav a')];
const appPages = {
  rounds: { panel: 'roundsPage', nav: 'roundsNavLink', title: 'จัดการรอบ' },
  companies: { panel: 'companiesPage', nav: 'companiesNavLink', title: 'จัดการบริษัท' },
  home: { panel: 'dashboardPage', nav: 'dashboardNavLink', title: 'หน้าหลัก' },
  market: { panel: 'marketPage', nav: 'marketNavLink', title: 'ตลาดคาร์บอนเครดิต' },
  history: { panel: 'historyPage', nav: 'historyNavLink', title: 'ประวัติการซื้อขาย' },
  profile: { panel: 'accountProfilePage', title: 'ปรับโปรไฟล์' }
};
const roleLabels = { Admin: 'ผู้ดูแลระบบ', Company: 'บริษัท' };
const number = new Intl.NumberFormat('th-TH', { maximumFractionDigits: 4 });
const price = new Intl.NumberFormat('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

let token = localStorage.getItem('demo_token');
let user;
let round;
let marketListings = [];
let emissionRecords = [];
let refreshSequence = 0;
let publicRound;
let publicRefreshSequence = 0;
let requestDetails;
let detailSequence = 0;
let creditAdjustments = [];
let emissionRequests = [];
let emissionDetails;
let emissionDetailSequence = 0;

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);
}

function pageFromUrl(url) {
  const page = url.searchParams.get('page');
  if ((page === 'rounds' || url.hash === '#adminRound') && user?.role === 'Admin') return appPages.rounds;
  if (page === 'companies' && user?.role === 'Admin') return appPages.companies;
  if (page === 'profile') return appPages.profile;
  if (page === 'history' || url.hash === '#historySection') return appPages.history;
  if (page === 'market' || url.hash === '#marketSection') return appPages.market;
  return appPages.home;
}

function renderAppView(scroll = false) {
  if (!user) return;
  const page = pageFromUrl(new URL(location.href));
  for (const view of Object.values(appPages)) get(view.panel).hidden = view !== page;
  const panel = get(page.panel);
  get('dashboardTitle').textContent = page.title;
  get('roundPicker').hidden = page === appPages.profile;

  for (const link of navLinks) {
    link.hidden = (link.hasAttribute('data-admin-only') && user.role !== 'Admin')
      || Boolean(link.dataset.section && get(link.dataset.section).hidden);
    link.removeAttribute('aria-current');
  }
  const target = get(location.hash.slice(1));
  const anchor = target && panel.contains(target) && !target.hidden ? target : null;
  const anchorLink = anchor && navLinks.find(link => !link.hidden && link.hash === location.hash);
  const current = anchorLink || (page.nav && get(page.nav));
  if (current) current.setAttribute('aria-current', anchorLink ? 'location' : 'page');
  if (!scroll) return;
  if (anchor) anchor.scrollIntoView();
  else window.scrollTo(0, 0);
}

function navigateApp(event) {
  const link = event.target.closest('a[data-app-link]');
  if (!link || event.defaultPrevented || event.button !== 0
      || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  if (get('listingDialog').open) get('listingDialog').close();
  const changedPage = pageFromUrl(new URL(location.href)) !== pageFromUrl(new URL(link.href));
  if (link.href !== location.href) history.pushState(null, '', link.href);
  if (!user) {
    showGuestPage();
    if (!get('loginPage').hidden) get('email').focus({ preventScroll: true });
    return;
  }
  renderAppView(true);
  if (changedPage && !location.hash) get('dashboardTitle').focus({ preventScroll: true });
}

function showPage(page) {
  const signedIn = page === 'appPage';
  const login = page === 'loginPage';
  get('loginPage').hidden = !login;
  get('publicPage').hidden = page !== 'publicPage';
  get('appPage').hidden = !signedIn;
  get('accountNav').hidden = !signedIn;
  get('guestNav').hidden = signedIn;
  get('guestLogin').hidden = login;
  get('guestHome').hidden = !login;
  document.body.dataset.view = signedIn ? 'app' : login ? 'login' : 'public';
  if (signedIn) renderAppView(true);
  else window.scrollTo(0, 0);
}

function showGuestPage() {
  const url = new URL(location.href);
  const wantsLogin = url.searchParams.get('page') === 'login' || pageFromUrl(url) !== appPages.home;
  showPage(wantsLogin ? 'loginPage' : 'publicPage');
  if (!wantsLogin) refreshPublicEmissions(true);
}

async function api(path, method = 'GET', body) {
  const headers = token ? { Authorization: 'Bearer ' + token } : {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const response = await fetch(apiRoot + path, { method, headers, body: JSON.stringify(body) });
  if (response.status === 204) return undefined;
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || result.message || 'ทำรายการไม่สำเร็จ');
  return result;
}

function notice(message, type = 'success', id = 'notice') {
  const box = get(id);
  box.className = message ? 'alert alert-' + type : '';
  box.setAttribute('role', type === 'danger' ? 'alert' : 'status');
  box.textContent = message;
}

function emissionNotice(message, type) {
  notice(message, type, 'emissionNotice');
}

function marketNotice(message, type) {
  notice(message, type, 'marketNotice');
}

function listingNotice(message, type) {
  if (get('listingDialog').open) {
    notice(message, type, 'listingDialogNotice');
  } else {
    notice(message, type, get('marketPage').hidden ? 'homeListingNotice' : 'marketNotice');
  }
}

function table(headers, rows, empty) {
  if (!rows.length) return '<p class="empty-state">' + empty + '</p>';
  const cells = rows.map(row => '<tr>' + row.map(cell => '<td>' + cell + '</td>').join('') + '</tr>');
  return '<div class="table-responsive"><table class="table ets-table align-middle"><thead><tr>'
    + headers.map(label => '<th scope="col">' + label + '</th>').join('')
    + '</tr></thead><tbody>' + cells.join('') + '</tbody></table></div>';
}

function selectOptions(id, options, preferred = get(id).value) {
  const select = get(id);
  select.replaceChildren(...options.map(([value, label]) => new Option(label, value)));
  if (options.some(([value]) => String(value) === String(preferred))) select.value = preferred;
}

function companyMarketBalance() {
  return user?.company_id ? round?.balances[0] : undefined;
}

function canBuyListing(listing) {
  return listing && round?.status === 'Trading' && companyMarketBalance()
    && listing.seller_company_id !== user.company_id;
}

function renderMarketTable() {
  const query = get('marketSearch').value.trim().toLocaleLowerCase('th-TH');
  const industry = get('marketIndustry').value;
  const deficit = Number(companyMarketBalance()?.deficit_tco2e || 0);
  const requireCoverage = get('marketCoverage').value === 'enough';
  const sort = get('marketSort').value;
  const rows = marketListings.filter(item => {
    const company = (item.seller_company_name + ' ' + item.industry_type).toLocaleLowerCase('th-TH');
    return company.includes(query) && (!industry || item.industry_type === industry)
      && (!requireCoverage || Number(item.amount_tco2e) >= deficit);
  });
  if (sort === 'price-low') rows.sort((a, b) => Number(a.price_per_ton) - Number(b.price_per_ton));
  if (sort === 'quantity-high') rows.sort((a, b) => Number(b.amount_tco2e) - Number(a.amount_tco2e));

  get('marketCount').textContent = 'แสดง ' + number.format(rows.length) + ' จาก ' + number.format(marketListings.length) + ' ประกาศ';
  let empty = 'ไม่พบประกาศที่ตรงกับตัวกรอง';
  if (!marketListings.length) empty = 'ยังไม่มีบริษัทเปิดขายสิทธิในรอบนี้';
  if (round.status === 'Reporting') empty = 'ตลาดจะเปิดเมื่อ Admin รับรองยอดปล่อยของรอบนี้';
  if (round.status === 'Closed') empty = 'รอบนี้ปิดซื้อขายแล้ว ดูรายการที่ผ่านมาได้ที่เมนูประวัติ';

  get('market').innerHTML = table(
    ['บริษัทผู้ขาย', 'อุตสาหกรรม', 'คงเหลือ (ตัน CO₂e)', 'ราคา (บาท/ตัน)', 'การจัดการ'],
    rows.map(item => {
      const own = item.seller_company_id === user.company_id;
      const company = escapeHtml(item.seller_company_name);
      const selected = get('buyListing').value === item.id;
      const action = canBuyListing(item)
        ? '<button type="button" class="btn btn-outline-primary btn-sm" data-buy-listing="' + escapeHtml(item.id)
          + '" aria-controls="buyForm" aria-pressed="' + selected + '" aria-label="เลือกซื้อจาก ' + company + '">เลือกซื้อ</button>'
        : (own ? '<span class="market-own">ประกาศของคุณ</span>' : '—');
      return ['<strong>' + company + '</strong>', escapeHtml(item.industry_type),
        number.format(item.amount_tco2e), price.format(item.price_per_ton), action];
    }), empty
  );
}

function selectedListing() {
  return marketListings.find(item => item.id === get('buyListing').value);
}

function showBuyTotal() {
  const listing = selectedListing();
  const amount = get('buyAmount');
  get('buyTotal').textContent = listing && amount.value && amount.validity.valid
    ? price.format(Number(amount.value) * Number(listing.price_per_ton)) + ' บาท' : '—';
}

function renderBuyForm(suggestAmount = false) {
  const listing = selectedListing();
  const form = get('buyForm');
  if (!canBuyListing(listing)) {
    form.reset();
    get('buyListing').value = '';
    form.hidden = true;
    return;
  }
  form.hidden = false;
  get('buySeller').textContent = listing.seller_company_name;
  get('buyDetails').textContent = listing.industry_type + ' · คงเหลือ ' + number.format(listing.amount_tco2e)
    + ' ตัน CO₂e · ' + price.format(listing.price_per_ton) + ' บาท/ตัน';
  const amount = get('buyAmount');
  amount.max = listing.amount_tco2e;
  if (suggestAmount || Number(amount.value) > Number(amount.max)) {
    const deficit = Number(companyMarketBalance().deficit_tco2e);
    amount.value = deficit > 0 ? Math.min(deficit, Number(amount.max)).toFixed(4) : '';
  }
  showBuyTotal();
}

function renderListingControls() {
  const balance = companyMarketBalance();
  const canRequest = user?.role === 'Company' && ['Reporting', 'Trading'].includes(round.status) && Boolean(balance);
  get('homeListingActions').hidden = user?.role !== 'Company';
  get('sellFromHome').disabled = !canRequest;
  get('sellFromHome').textContent = round.status === 'Closed' ? 'รอบนี้ปิดรับคำขอแล้ว' : 'ยื่นคำขอขาย';
  get('listingForm').hidden = !canRequest;
  get('listingHistoryLink').hidden = true;
  get('listingAmount').max = '99999999.9999';
  get('listingLimit').textContent = 'สิทธิที่พร้อมขาย ' + number.format(balance?.available_tco2e || 0)
    + ' ตัน CO₂e · ส่งคำขอแล้วรอแอดมินตรวจสอบสิทธิก่อนขึ้นตลาด';
}

function renderReviewQueue() {
  get('listingReviewSection').hidden = user.role !== 'Admin';
  if (user.role !== 'Admin') return;
  const pending = round.listings.filter(item => item.status === 'Pending');
  get('listingReviewQueue').innerHTML = table(
    ['บริษัท', 'จำนวน (ตัน)', 'ราคา/ตัน', 'รายละเอียด', 'ตรวจสอบ'],
    pending.map(item => [
      escapeHtml(round.companies.find(company => company.id === item.seller_company_id)?.name),
      number.format(item.amount_tco2e), price.format(item.price_per_ton),
      '<span class="review-description">' + escapeHtml(item.description) + '</span>',
      '<button type="button" class="btn btn-outline-primary btn-sm" data-request-details="' + escapeHtml(item.id) + '">ดูรายละเอียด</button>'
    ]),
    'ไม่มีคำขอขายรอตรวจสอบ'
  );
}

function openListingDialog() {
  if (user?.role !== 'Company' || !['Reporting', 'Trading'].includes(round?.status) || !companyMarketBalance()) return;
  get('listingForm').reset();
  get('listingContactName').value = user.name;
  get('listingContactEmail').value = user.email;
  notice('', 'success', 'listingDialogNotice');
  renderListingControls();
  get('listingDialog').showModal();
  if (!get('listingForm').hidden) get('listingAmount').focus();
}

function renderMarket() {
  const trading = round.status === 'Trading';
  const balance = companyMarketBalance();
  const available = Number(balance?.available_tco2e || 0);
  const deficit = Number(balance?.deficit_tco2e || 0);
  get('marketSection').hidden = false;
  get('marketYear').textContent = 'ค.ศ. ' + round.year;

  renderListingControls();

  get('marketFilters').hidden = !trading;
  get('marketCoverageFilter').hidden = deficit <= 0;
  if (deficit <= 0) get('marketCoverage').value = 'all';
  const industries = [...new Set(marketListings.map(item => item.industry_type).filter(Boolean))];
  industries.sort((a, b) => a.localeCompare(b, 'th'));
  selectOptions('marketIndustry', [['', 'ทุกอุตสาหกรรม'], ...industries.map(industry => [industry, industry])]);
  renderBuyForm();
  renderMarketTable();
}

function renderOverview() {
  const isAdmin = user.role === 'Admin';
  const company = round.companies.find(item => item.id === user.company_id);
  const balance = round.balances[0];
  const deficitCount = round.balances.filter(item => Number(item.deficit_tco2e) > 0).length;
  const hasDeficit = isAdmin ? deficitCount > 0 : Number(balance?.deficit_tco2e) > 0;
  const rightLabel = isAdmin ? 'บริษัทที่ยังขาดสิทธิ' : (hasDeficit ? 'สิทธิที่ยังขาด' : 'สิทธิคงเหลือ');
  const rightValue = isAdmin ? deficitCount : (hasDeficit ? balance?.deficit_tco2e : balance?.balance_tco2e);
  const rightUnit = isAdmin ? 'บริษัท' : 'ตัน CO₂e';
  const overview = get('overviewCards');
  const companyName = company?.name || user.name;
  const identity = isAdmin
    ? '<h2>บริษัทที่ได้รับจัดสรรสิทธิ</h2><p><strong>' + number.format(round.balances.length) + ' บริษัท</strong></p>'
    : '<h2>ข้อมูลบริษัท</h2><p><strong>' + escapeHtml(companyName) + '</strong>'
      + (company?.industry_type ? '<small>' + escapeHtml(company.industry_type) + '</small>' : '') + '</p>';
  const profileLink = '<a href="./?page=profile" data-app-link class="btn btn-outline-primary btn-sm">ปรับโปรไฟล์</a>';
  const status = rightValue === undefined ? '<p>รอการจัดสรรสิทธิ</p>'
    : '<p class="overview-value' + (hasDeficit ? ' is-deficit' : '') + '"><strong>'
      + number.format(rightValue) + '</strong> <small>' + rightUnit + '</small></p>';
  overview.innerHTML = '<div>' + identity + profileLink + '</div><div><h2>' + rightLabel + '</h2>'
    + status + '</div>';
  overview.hidden = false;
}

function renderBalances() {
  renderOverview();
  get('roundState').dataset.status = round.status;
  const status = statusLabels[round.status];
  get('roundState').textContent = status + ' · หน่วย ตัน CO₂e' + (round.status === 'Reporting' ? ' · ยอดปล่อยรอการรับรอง' : '');
  const displayMetric = (row, field) => {
    if (field === 'available_tco2e' && round.status !== 'Trading') return '—';
    return number.format(field === 'balance_tco2e' ? Math.max(0, row[field]) : row[field]);
  };
  const metrics = [
    ['สิทธิที่ได้รับ', 'amount_tco2e'], ['ยอดปล่อย', 'emitted_tco2e'], ['ซื้อแล้ว', 'bought_tco2e'],
    ['ขายแล้ว', 'sold_tco2e'], ['กันไว้ในประกาศ', 'reserved_tco2e'], ['เหลือ', 'balance_tco2e'],
    ['ขายเพิ่มได้', 'available_tco2e'], ['ขาดสิทธิ', 'deficit_tco2e']
  ];
  if (user.role === 'Admin') {
    get('balances').innerHTML = table(
      ['บริษัท', ...metrics.map(([label]) => label), ...(round.status === 'Closed' ? ['ผลสิ้นรอบ'] : [])],
      round.balances.map(row => [
        escapeHtml(row.company_name),
        ...metrics.map(([, field]) => displayMetric(row, field)),
        ...(round.status === 'Closed' ? [row.deficit_tco2e > 0 ? 'สิทธิไม่ครอบคลุม' : 'สิทธิครอบคลุม'] : [])
      ]),
      'ยังไม่ได้จัดสรรสิทธิในรอบนี้'
    );
  } else {
    const balance = round.balances[0];
    get('balances').innerHTML = balance ? '<dl class="balance-metrics">'
      + metrics.map(([label, field]) => '<div class="metric"><dt>' + label + '</dt><dd>'
        + displayMetric(balance, field)
        + ' <small class="fw-normal">ตัน CO₂e</small></dd></div>').join('') + '</dl>'
      + (round.status === 'Closed' ? '<p class="mt-3 mb-0">' + (balance.deficit_tco2e > 0
        ? 'ผลสิ้นรอบ · สิทธิไม่ครอบคลุมยอดปล่อย' : 'ผลสิ้นรอบ · สิทธิครอบคลุมยอดปล่อย') + '</p>' : '')
      : '<p class="mb-0">บริษัทยังไม่ได้รับการจัดสรรสิทธิในรอบนี้</p>';
  }
}

function populateCompanyForm() {
  const form = get('companyForm');
  const company = round.companies.find(item => item.id === get('profileCompany').value);
  if (!company) return;
  form.elements.name.value = company.name;
  form.elements.industry.value = company.industry_type;
  form.elements.email.value = company.contact_email;
  form.elements.target.value = company.reduction_target;
}

function populateAllocation() {
  const allocation = round.balances.find(item => item.company_id === get('allocationCompany').value);
  const amount = get('allocationForm').elements.amount;
  const set = get('allocationMode').value === 'set';
  amount.value = set ? allocation?.amount_tco2e ?? '0' : '';
  amount.min = set ? '0' : '0.0001';
  get('allocationCurrent').textContent = 'สิทธิที่ได้รับปัจจุบัน ' + number.format(allocation?.amount_tco2e || 0) + ' ตัน CO₂e';
}

function renderNewRoundAllocations() {
  const container = get('newRoundAllocations');
  const inputs = [...container.querySelectorAll('[data-allocation-company]')];
  const companies = user.role === 'Admin' ? round.companies : [];
  const sameCompanies = inputs.length === companies.length
    && inputs.every((input, index) => input.dataset.allocationCompany === companies[index].id);
  if (!sameCompanies) {
    const drafts = new Map(inputs.map(input => [input.dataset.allocationCompany, input.value]));
    container.innerHTML = table(
      ['บริษัท', 'สิทธิที่ได้รับ (ตัน CO₂e)'],
      companies.map(company => [
        escapeHtml(company.name),
        '<input type="number" class="form-control new-round-credit" min="0" max="99999999.9999" step="0.0001"'
          + ' data-allocation-company="' + escapeHtml(company.id) + '" aria-label="สิทธิของ '
          + escapeHtml(company.name) + '" value="' + escapeHtml(drafts.get(company.id) || '') + '" required>'
      ]),
      'ยังไม่มีบริษัทสำหรับจัดสรรสิทธิ'
    );
  }
  get('createRoundSubmit').disabled = !companies.length;
}

function renderRound() {
  const isAdmin = user.role === 'Admin';
  const reporting = round.status === 'Reporting';
  const companyOptions = round.companies.map(company => [company.id, company.name]);

  get('adminRound').hidden = !isAdmin;
  renderNewRoundAllocations();
  get('allocationForm').hidden = !isAdmin || !companyOptions.length;
  for (const input of get('allocationForm').elements) input.disabled = round.status === 'Closed';
  get('openTrading').hidden = !reporting || !round.balances.length;
  get('closeRound').hidden = round.status !== 'Trading';
  selectOptions('allocationCompany', companyOptions);
  populateAllocation();

  get('emissionsSection').hidden = !companyOptions.length;
  get('emissionCompanyPicker').hidden = !isAdmin;
  selectOptions('emissionCompany', companyOptions);
  const closed = round.status === 'Closed';
  const canRecord = !isAdmin && !closed && round.balances.length > 0;
  get('emissionForm').hidden = isAdmin || closed;
  get('emissionDateField').hidden = !canRecord;
  get('emissionSaveRow').hidden = !canRecord;
  get('saveEmission').disabled = !canRecord;
  const emissionStatus = get('emissionStatus');
  emissionStatus.hidden = !closed && isAdmin;
  if (closed) {
    emissionStatus.textContent = 'รอบนี้ปิดแล้ว ดูรายการที่บันทึกไว้ได้ด้านล่าง';
  } else if (canRecord) {
    emissionStatus.textContent = 'กรอกปริมาณของช่วงใช้งาน พร้อมเลขเอกสารและหลักฐาน ยอดจะรวมหลังแอดมินอนุมัติ';
  } else {
    emissionStatus.textContent = 'บริษัทต้องได้รับการจัดสรรสิทธิก่อนบันทึกยอดในรอบนี้';
  }
  updateEmissionEstimate();
  const recordDate = get('recordDate');
  recordDate.disabled = !canRecord;
  const periodStart = get('emissionPeriodStart');
  periodStart.disabled = !canRecord;
  recordDate.min = round.year + '-01-01';
  recordDate.max = round.year + '-12-31';
  periodStart.min = recordDate.min;
  periodStart.max = recordDate.max;
  if (!periodStart.value.startsWith(round.year + '-')) periodStart.value = recordDate.min;
  if (!recordDate.value.startsWith(round.year + '-')) {
    const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Bangkok' });
    recordDate.value = today.startsWith(round.year + '-') ? today : recordDate.min;
  }

  renderMarket();

  get('historySection').hidden = false;
  get('listings').innerHTML = table(
    ['ผู้ขาย', 'ลงขาย (ตัน)', 'ยังไม่ขาย (ตัน)', 'ราคา (บาท/ตัน)', 'รายละเอียด', 'สถานะ', 'จัดการ'],
    round.listings.map(item => {
      const seller = round.companies.find(company => company.id === item.seller_company_id);
      return [
        escapeHtml(seller?.name), number.format(item.amount_tco2e), number.format(item.remaining_tco2e),
        price.format(item.price_per_ton), '<span class="review-description">' + escapeHtml(item.description) + '</span>', statusLabels[item.status],
        '<button type="button" class="btn btn-outline-primary btn-sm" data-request-details="' + escapeHtml(item.id) + '">ดูรายละเอียด</button> '
          + (['Open', 'Pending'].includes(item.status) && item.seller_company_id === user.company_id
            ? '<button class="btn btn-outline-warning btn-sm" data-cancel="' + escapeHtml(item.id) + '">ยกเลิก</button>' : '')
      ];
    }), 'ยังไม่มีประกาศขายในรอบนี้'
  );
  get('trades').innerHTML = table(
    ['ผู้ขาย', 'ผู้ซื้อ', 'จำนวน (ตัน CO₂e)', 'ราคา (บาท/ตัน)'],
    round.trades.map(item => [
      escapeHtml(item.seller_name), escapeHtml(item.buyer_name), number.format(item.amount_tco2e), price.format(item.price_per_ton)
    ]), 'ยังไม่มีการโอนสิทธิในรอบนี้'
  );

  get('companySection').hidden = !['Admin', 'Company'].includes(user.role) || !companyOptions.length;
  selectOptions('profileCompany', companyOptions);
  populateCompanyForm();
  get('adminCompanies').innerHTML = isAdmin ? table(
    ['บริษัท', 'สิทธิที่ได้รับ (ตัน)', 'ยอดปล่อย (ตัน)', 'ขาดสิทธิ (ตัน)', 'จัดการ'],
    round.companies.map(company => {
      const balance = round.balances.find(item => item.company_id === company.id);
      return [escapeHtml(company.name), number.format(balance?.amount_tco2e || 0),
        number.format(balance?.emitted_tco2e || 0), number.format(balance?.deficit_tco2e || 0),
        round.status !== 'Closed' ? '<button type="button" class="btn btn-outline-primary btn-sm" data-edit-credit="'
          + escapeHtml(company.id) + '">แก้ไขเครดิต</button>' : 'ปิดรอบแล้ว'];
    }), 'ยังไม่มีบริษัท'
  ) : '';
  renderCreditHistory();
  renderBalances();
  renderReviewQueue();
  renderEmissionRequests();
  renderAppView();
}

function updateEmissionEstimate() {
  const activity = get('activity').value;
  const amount = get('emissionAmount');
  const unit = activities[activity][1];
  get('activityUnit').textContent = unit;
  if (!amount.value || !amount.validity.valid) {
    get('emissionEstimate').textContent = '—';
    return;
  }
  const estimate = carbonCalculator.calculateCarbonEquivalent(activity, amount.value);
  get('emissionEstimate').textContent = number.format(estimate) + ' ตัน CO₂e'
    + (estimate === 0 ? ' (ปัดเป็น 0 ที่ทศนิยม 4 ตำแหน่ง)' : ' ≈ ' + number.format(estimate * 1000) + ' กก. CO₂e');
}

function renderEmissionTotals(records) {
  const totals = new Map();
  for (const item of records) {
    if (!totals.has(item.activity_type)) totals.set(item.activity_type, { amount: 0, tco2e: 0 });
    const activity = totals.get(item.activity_type);
    activity.amount += Number(item.amount);
    activity.tco2e += Number(item.carbon_ton_equivalent);
  }
  get('emissionBreakdown').hidden = !totals.size;
  get('emissionTotals').innerHTML = totals.size ? table(
    ['กิจกรรม', 'ใช้สะสม', 'ปล่อยสะสม (ตัน CO₂e)'],
    [...totals].map(([type, item]) => [
      activities[type][0], number.format(item.amount) + ' ' + activities[type][1], number.format(item.tco2e)
    ]),
    'ยังไม่มียอดสะสม'
  ) : '';
}

function renderEmissionRecords() {
  const query = get('emissionSearch').value.trim().toLocaleLowerCase('th-TH');
  const records = emissionRecords.filter(item => {
    const label = activities[item.activity_type][0];
    return (label + ' ' + item.record_date).toLocaleLowerCase('th-TH').includes(query);
  });
  get('emissionRecordCount').textContent = '(' + number.format(records.length) + ' รายการ)';
  get('emissions').innerHTML = table(
    ['วันที่', 'กิจกรรม', 'ปริมาณ', 'ยอดปล่อย (ตัน CO₂e)', 'จัดการ'],
    records.map(item => [
      escapeHtml(item.record_date), activities[item.activity_type][0],
      number.format(item.amount) + ' ' + activities[item.activity_type][1], number.format(item.carbon_ton_equivalent),
      round.status === 'Reporting' && !item.reviewed_submission
        ? '<button class="btn btn-outline-danger btn-sm" data-delete="' + escapeHtml(item.id) + '">ลบ</button>' : '—'
    ]),
    query ? 'ไม่พบรายการที่ตรงกับคำค้น' : 'ยังไม่มีบันทึกการปล่อยในรอบนี้'
  );
}

async function loadEmissions() {
  const company = get('emissionCompany').value;
  if (!company) return;
  const selectedRound = round;
  emissionRecords = [];
  get('emissionBreakdown').hidden = true;
  get('emissionRecordCount').textContent = '';
  get('emissionSearch').disabled = true;
  get('emissions').textContent = 'กำลังโหลดบันทึกการปล่อย…';
  const data = (await api('/emissions?year=' + round.year + '&company_id=' + encodeURIComponent(company))).data;
  if (round !== selectedRound || company !== get('emissionCompany').value || !user) return;
  emissionRecords = data;
  get('emissionSearch').disabled = false;
  renderEmissionTotals(data);
  renderEmissionRecords();
}

function renderPublicEmissions() {
  if (!publicRound) return;
  const query = get('publicSearch').value.trim().toLocaleLowerCase('th-TH');
  const industry = get('publicIndustry').value;
  const companies = publicRound.companies.filter(company =>
    (!industry || company.industry_type === industry)
    && (company.company_name + ' ' + (company.industry_type || '')).toLocaleLowerCase('th-TH').includes(query)
  );
  get('publicCompanyCount').textContent = number.format(companies.length) + ' บริษัท';
  const note = publicRound.status === 'Reporting' ? ' · ยอดเบื้องต้นระหว่างรับข้อมูล' : '';
  get('publicRoundStatus').textContent = 'รอบ ค.ศ. ' + publicRound.year
    + ' · ' + statusLabels[publicRound.status] + note;
  get('publicEmissions').innerHTML = table(
    ['บริษัท', 'อุตสาหกรรม', 'ยอดปล่อย (ตัน CO₂e)'],
    companies.map(company => [
      escapeHtml(company.company_name), escapeHtml(company.industry_type),
      company.emitted_tco2e === null ? 'ยังไม่มีข้อมูล' : number.format(company.emitted_tco2e)
    ]),
    query || industry ? 'ไม่พบบริษัทที่ตรงกับคำค้นหรือตัวกรอง' : 'ยังไม่มีบริษัทในรอบปีนี้'
  );
}

async function refreshPublicEmissions(loadRounds = false) {
  const sequence = ++publicRefreshSequence;
  const year = get('publicYear');
  const industry = get('publicIndustry');
  publicRound = null;
  get('publicCompanyCount').textContent = '';
  get('publicRoundStatus').textContent = '';
  get('publicEmissions').textContent = 'กำลังโหลดข้อมูล…';
  industry.disabled = true;

  try {
    if (loadRounds) {
      year.disabled = true;
      const { data: rounds } = await api('/ets/public/rounds');
      if (sequence !== publicRefreshSequence) return;
      selectOptions('publicYear', rounds.map(item => [item.year, item.year]));
      year.disabled = !rounds.length;
    }

    if (!year.value) {
      get('publicEmissions').textContent = 'ยังไม่มีรอบรายงาน';
      return;
    }

    const { data } = await api('/ets/' + year.value + '/emissions');
    if (sequence !== publicRefreshSequence) return;
    publicRound = data;
    const industries = [...new Set(data.companies.map(company => company.industry_type).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, 'th'));
    selectOptions('publicIndustry', [['', 'ทุกอุตสาหกรรม'], ...industries.map(value => [value, value])]);
    industry.disabled = !industries.length;
    renderPublicEmissions();
  } catch {
    if (sequence !== publicRefreshSequence) return;
    get('publicEmissions').textContent = 'โหลดข้อมูลไม่ได้ กรุณารีเฟรชหน้าแล้วลองอีกครั้ง';
  }
}

async function refresh(year = get('roundSelect').value) {
  const sequence = ++refreshSequence;
  const rounds = (await api('/ets')).data;
  if (sequence !== refreshSequence || !user) return;
  selectOptions('roundSelect', rounds.map(item => [item.year, item.year]), year);
  const selected = get('roundSelect').value;
  const [details, market, adjustments, submissions] = await Promise.all([
    api('/ets/' + selected), api('/credits/market?year=' + selected),
    user.role === 'Admin' ? api('/ets/' + selected + '/adjustments') : Promise.resolve({ data: [] }),
    api('/emissions/submissions?year=' + selected)
  ]);
  if (sequence !== refreshSequence || !user) return;
  round = details.data;
  marketListings = market.data;
  creditAdjustments = adjustments.data;
  emissionRequests = submissions.data;
  renderRound();
  await loadEmissions();
}

function updateAccountDetails(account) {
  user = account;
  get('accountName').textContent = account.name;
  get('accountRole').textContent = roleLabels[account.role] || account.role;
  get('accountInitials').textContent = account.name.split('·').at(-1).trim().slice(0, 2).toUpperCase();
  get('accountDisplayName').value = account.name;
  get('accountEmail').value = account.email;
}

async function showApp(account) {
  if (account.role === 'Viewer') {
    token = null;
    localStorage.removeItem('demo_token');
    history.replaceState(null, '', new URL('./', location.href));
    showGuestPage();
    return;
  }
  updateAccountDetails(account);
  if (new URL(location.href).searchParams.get('page') === 'login') {
    history.replaceState(null, '', new URL('./', location.href));
  }
  notice('');
  showPage('appPage');
  try {
    await refresh();
    if (location.hash) renderAppView(true);
  } catch (error) {
    notice(error.message, 'danger');
  }
}

async function mutate(action, success, button, feedback = notice) {
  if (!round || get('roundSelect').value !== String(round.year)) {
    feedback('กรุณารอให้โหลดรอบปีเสร็จก่อนทำรายการ', 'warning');
    return;
  }
  if (button) button.disabled = true;
  try {
    const { year, message = success } = (await action()) || {};
    feedback(message);
    try {
      await refresh(year);
    } catch (error) {
      feedback(message + ' แต่โหลดข้อมูลล่าสุดไม่ได้ · ' + error.message, 'warning');
    }
  } catch (error) {
    feedback(error.message, 'danger');
  } finally {
    if (button) button.disabled = false;
  }
}

function bindForm(id, action, success, feedback = notice) {
  get(id).addEventListener('submit', event => {
    event.preventDefault();
    mutate(() => action(new FormData(event.currentTarget)), success, event.submitter, feedback);
  });
}

for (const id of ['brandHome', 'guestNav', 'accountNav', 'overviewCards', 'accountProfilePage', 'listingDialog']) {
  get(id).addEventListener('click', navigateApp);
}
window.addEventListener('popstate', () => {
  if (user) renderAppView(true);
  else showGuestPage();
});

get('logout').onclick = () => {
  token = null;
  user = null;
  round = null;
  refreshSequence++;
  detailSequence++;
  requestDetails = undefined;
  emissionDetailSequence++;
  emissionDetails = undefined;
  emissionRequests = [];
  if (get('emissionDetailsDialog').open) get('emissionDetailsDialog').close();
  get('emissionDetailsContent').replaceChildren();
  get('emissionDecisionForm').reset();
  if (get('requestDetailsDialog').open) get('requestDetailsDialog').close();
  get('requestDetailsContent').replaceChildren();
  get('requestReviewForm').reset();
  creditAdjustments = [];
  get('creditAdjustmentHistory').replaceChildren();
  localStorage.removeItem('demo_token');
  localStorage.removeItem('demo_user');
  get('loginForm').reset();
  get('accountDetailsForm').reset();
  get('accountPasswordForm').reset();
  get('accountEmail').value = '';
  notice('', 'success', 'accountDetailsNotice');
  notice('', 'success', 'accountPasswordNotice');
  get('loginError').textContent = '';
  setPasswordVisible(false);
  get('overviewCards').hidden = true;
  get('emissionForm').reset();
  get('createRound').reset();
  get('newRoundAllocations').replaceChildren();
  notice('', 'success', 'createRoundNotice');
  get('emissionSearch').value = '';
  emissionRecords = [];
  get('emissionBreakdown').hidden = true;
  emissionNotice('');
  marketListings = [];
  get('buyForm').reset();
  get('buyListing').value = '';
  if (get('listingDialog').open) get('listingDialog').close();
  get('listingForm').reset();
  get('homeListingActions').hidden = true;
  notice('', 'success', 'homeListingNotice');
  get('marketSearch').value = '';
  get('marketCoverage').value = 'all';
  get('marketSort').value = 'recent';
  marketNotice('');
  for (const id of ['balances', 'listings', 'trades', 'emissions', 'market']) get(id).replaceChildren();
  for (const id of ['emissionsSection', 'marketSection', 'historySection', 'companySection', 'adminRound']) get(id).hidden = true;
  history.replaceState(null, '', new URL('./', location.href));
  showGuestPage();
};

function setPasswordVisible(visible) {
  get('password').type = visible ? 'text' : 'password';
  get('togglePassword').textContent = visible ? 'ซ่อน' : 'แสดง';
  get('togglePassword').setAttribute('aria-pressed', String(visible));
}

get('togglePassword').onclick = () => setPasswordVisible(get('password').type === 'password');

const demoButtons = [...document.querySelectorAll('[data-demo]')];
demoButtons.forEach(button => {
  button.onclick = () => {
    const account = button.dataset.demo;
    const credentials = get('demo-' + account);
    for (const item of demoButtons) item.setAttribute('aria-pressed', String(item === button));
    get('email').value = credentials.querySelector('.demo-email').textContent;
    get('password').value = '';
    setPasswordVisible(false);
    get('password').focus();
  };
});

get('loginForm').onsubmit = async event => {
  event.preventDefault();
  const button = event.submitter;
  if (button) button.disabled = true;
  get('loginError').textContent = '';
  try {
    const result = await api('/auth/login', 'POST', { email: get('email').value, password: get('password').value });
    token = result.token;
    localStorage.setItem('demo_token', token);
    get('password').value = '';
    await showApp(result.user);
  } catch (error) {
    get('loginError').textContent = error.message;
  } finally {
    if (button) button.disabled = false;
  }
};

function bindAccountForm(formId, noticeId, submit, onSaved, success) {
  const form = get(formId);
  form.onsubmit = async event => {
    event.preventDefault();
    const currentUser = user;
    if (!currentUser) return;
    const values = new FormData(form);
    const buttons = get('accountProfilePage').querySelectorAll('button[type="submit"]');
    buttons.forEach(button => { button.disabled = true; });
    notice('', 'success', noticeId);
    try {
      const result = await submit(values);
      if (user !== currentUser) return;
      onSaved(result);
      notice(success, 'success', noticeId);
    } catch (error) {
      if (user === currentUser) notice(error.message, 'danger', noticeId);
    } finally {
      buttons.forEach(button => { button.disabled = false; });
    }
  };
}

bindAccountForm('accountDetailsForm', 'accountDetailsNotice', values =>
  api('/auth/me', 'PATCH', { name: values.get('name') }),
  result => updateAccountDetails(result.user), 'บันทึกชื่อที่แสดงแล้ว');

bindAccountForm('accountPasswordForm', 'accountPasswordNotice', values => {
  const password = values.get('new-password');
  if (password !== values.get('confirm')) throw new Error('รหัสผ่านใหม่และรหัสยืนยันไม่ตรงกัน');
  return api('/auth/me/password', 'PUT', {
    current_password: values.get('current'),
    new_password: password
  });
}, result => {
  token = result.token;
  localStorage.setItem('demo_token', token);
  get('accountPasswordForm').reset();
}, 'เปลี่ยนรหัสผ่านแล้ว เซสชันเดิมอื่น ๆ ถูกยกเลิก');

get('publicSearch').oninput = renderPublicEmissions;
get('publicIndustry').onchange = renderPublicEmissions;
get('publicYear').onchange = () => refreshPublicEmissions();
get('publicSearchForm').onsubmit = event => {
  event.preventDefault();
  renderPublicEmissions();
  const heading = get('publicResultsHeading');
  heading.scrollIntoView({ block: 'start' });
  heading.focus({ preventScroll: true });
};

get('roundSelect').onchange = async event => {
  get('emissionSearch').value = '';
  notice('');
  emissionNotice('');
  try {
    await refresh(event.target.value);
  } catch (error) {
    if (round) get('roundSelect').value = round.year;
    notice(error.message, 'danger');
  }
};
get('emissionCompany').onchange = () => {
  get('emissionSearch').value = '';
  loadEmissions().catch(error => notice(error.message, 'danger'));
};
get('emissionSearch').oninput = renderEmissionRecords;
get('allocationCompany').onchange = populateAllocation;
get('allocationMode').onchange = populateAllocation;
get('profileCompany').onchange = populateCompanyForm;
get('marketSearch').oninput = renderMarketTable;
for (const id of ['marketIndustry', 'marketCoverage', 'marketSort']) get(id).onchange = renderMarketTable;
get('buyAmount').oninput = showBuyTotal;

get('refreshMarket').onclick = async event => {
  const button = event.currentTarget;
  button.disabled = true;
  marketNotice('');
  try {
    await refresh();
    marketNotice('อัปเดตประกาศแล้ว');
  } catch (error) {
    marketNotice(error.message, 'danger');
  } finally {
    button.disabled = false;
  }
};

get('sellFromHome').onclick = openListingDialog;
get('closeListingDialog').onclick = () => get('listingDialog').close();

get('market').onclick = event => {
  const button = event.target.closest('[data-buy-listing]');
  if (!button) return;
  get('buyListing').value = button.dataset.buyListing;
  marketNotice('');
  renderBuyForm(true);
  renderMarketTable();
  if (!get('buyForm').hidden) get('buyAmount').focus();
};

get('cancelBuy').onclick = () => {
  const id = get('buyListing').value;
  get('buyListing').value = '';
  renderBuyForm();
  renderMarketTable();
  const selectedButton = [...get('market').querySelectorAll('[data-buy-listing]')].find(button => button.dataset.buyListing === id);
  (selectedButton || get('marketSearch')).focus();
};
get('activity').onchange = updateEmissionEstimate;
get('emissionAmount').oninput = updateEmissionEstimate;

bindForm('createRound', async values => {
  const year = values.get('year');
  const allocations = [...get('newRoundAllocations').querySelectorAll('[data-allocation-company]')]
    .map(input => ({ company_id: input.dataset.allocationCompany, amount_tco2e: input.value }));
  await api('/ets', 'POST', { year, allocations });
  get('createRound').reset();
  return { year };
}, 'สร้างรอบและจัดสรรสิทธิให้ทุกบริษัทแล้ว', (message, type) => notice(message, type, 'createRoundNotice'));
bindForm('allocationForm', async values => {
  const result = await api('/ets/' + round.year + '/allocations/' + values.get('company'), 'PUT', { amount_tco2e: values.get('amount'), mode: values.get('mode'), reason: values.get('reason') });
  get('allocationReason').value = '';
  return { message: 'บันทึกสิทธิของบริษัทแล้ว ยอดใหม่ ' + number.format(result.data.amount_tco2e) + ' ตัน CO₂e'  + (result.cancelled_listing_count
    ? ' ยกเลิกประกาศที่สิทธิไม่พอ ' + number.format(result.cancelled_listing_count) + ' รายการ' : '') };
}, 'บันทึกสิทธิของบริษัทแล้ว', (message, type) => notice(message, type, 'companyCreditNotice'));

get('adminCompanies').onclick = event => {
  const button = event.target.closest('[data-edit-credit]');
  if (!button) return;
  get('allocationCompany').value = button.dataset.editCredit;
  populateAllocation();
  get('allocationReason').value = '';
  get('allocationForm').elements.amount.focus();
};
bindForm('emissionForm', async values => {
  if (values.get('period_start') > values.get('period_end')) throw new Error('วันเริ่มต้นต้องไม่เกินวันสิ้นสุด');
  const attachments = await readEvidenceFiles('emissionEvidence');
  if (!attachments.length) throw new Error('กรุณาแนบหลักฐานอย่างน้อย 1 ไฟล์');
  const { data } = await api('/emissions', 'POST', {
    activity_type: values.get('activity'), amount: values.get('amount'),
    period_start: values.get('period_start'), period_end: values.get('period_end'),
    document_number: values.get('document_number'), notes: values.get('notes'), attachments
  });
  get('emissionAmount').value = '';
  get('emissionDocument').value = '';
  get('emissionNotes').value = '';
  get('emissionEvidence').value = '';
  updateEmissionEstimate();
  return { message: 'ส่งคำขอ ' + number.format(data.carbon_ton_equivalent)
    + ' ตัน CO₂e แล้ว รอแอดมินตรวจสอบก่อนรวมยอด' };
}, 'ส่งยอดให้แอดมินตรวจสอบแล้ว', emissionNotice);
bindForm('listingForm', async values => {
  const attachments = await readEvidenceFiles();
  await api('/credits/listings', 'POST', {
    year: round.year, amount_tco2e: values.get('amount'), price_per_ton: values.get('price'),
    description: values.get('description'), contact_name: values.get('contact_name'),
    contact_email: values.get('contact_email'), contact_phone: values.get('contact_phone'), attachments
  });
  get('listingForm').reset();
  get('listingDialog').close();
}, 'ส่งคำขอแล้ว รอแอดมินตรวจสอบ ดูสถานะได้ที่ประวัติ', listingNotice);
bindForm('buyForm', async values => {
  await api('/transactions', 'POST', { listing_id: values.get('listing'), amount_tco2e: values.get('amount') });
  get('buyListing').value = '';
  renderBuyForm();
}, 'ซื้อและโอนสิทธิแล้ว', marketNotice);
bindForm('companyForm', async values => {
  await api('/companies/' + values.get('company'), 'PUT', {
    name: values.get('name'), industry_type: values.get('industry'), contact_email: values.get('email'),
    reduction_target: values.get('target')
  });
}, 'บันทึกข้อมูลบริษัทแล้ว');

get('openTrading').onclick = event => {
  if (!confirm('รับรองยอดปล่อยของรอบ ' + round.year + '? เมื่อเปิดตลาดแล้ว บริษัทบันทึกยอดใช้จริงเพิ่มเติมได้ และ Admin อนุมัติคำขอขายได้')) return;
  mutate(() => api('/ets/' + round.year + '/open', 'POST').then(() => undefined), 'รับรองยอดปล่อยและเปิดตลาดแล้ว', event.target);
};
get('closeRound').onclick = event => {
  if (!confirm('ปิดรอบ ' + round.year + '? ระบบจะยกเลิกประกาศขายที่ยังเปิดอยู่และสรุปผลสิ้นรอบ')) return;
  mutate(() => api('/ets/' + round.year + '/close', 'POST').then(() => undefined), 'ปิดรอบปีแล้ว', event.target);
};
get('emissions').onclick = event => {
  const button = event.target.closest('[data-delete]');
  if (button && confirm('ลบบันทึกการปล่อยนี้?')) {
    mutate(() => api('/emissions/' + button.dataset.delete, 'DELETE'), 'ลบบันทึกแล้ว', button, emissionNotice);
  }
};
function formatTime(value) {
  return value ? new Date(value).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' }) : '—';
}

function renderCreditHistory() {
  const labels = { initial: 'จัดสรรเริ่มต้น', add: 'เพิ่ม', subtract: 'ลด', set: 'กำหนดยอดใหม่' };
  get('creditAdjustmentHistory').innerHTML = user.role === 'Admin' ? table(
    ['วันเวลา', 'บริษัท', 'การปรับ', 'ก่อน (ตัน)', 'หลัง (ตัน)', 'เหตุผล', 'ผู้แก้'],
    creditAdjustments.map(item => [
      escapeHtml(formatTime(item.created_at)), escapeHtml(item.company_name), labels[item.action],
      number.format(item.before_tco2e), number.format(item.after_tco2e), escapeHtml(item.reason),
      escapeHtml(item.actor_name) + '<br><small>' + escapeHtml(item.actor_email) + '</small>'
    ]),
    'ยังไม่มีประวัติการปรับเครดิต เริ่มเก็บตั้งแต่เปิดใช้ฟังก์ชันนี้'
  ) : '';
}

async function readEvidenceFiles(inputId = 'listingEvidence') {
  const files = [...get(inputId).files];
  if (files.length > 3) throw new Error('แนบหลักฐานได้สูงสุด 3 ไฟล์');
  for (const file of files) {
    if (!file.size || file.size > 2 * 1024 * 1024) throw new Error('ไฟล์หลักฐานต้องไม่เกิน 2 MB ต่อไฟล์');
  }
  return Promise.all(files.map(file => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve({ filename: file.name, data: reader.result.split(',')[1] });
    reader.onerror = () => reject(new Error('อ่านไฟล์หลักฐานไม่ได้ กรุณาเลือกไฟล์ใหม่'));
    reader.readAsDataURL(file);
  })));
}

function renderRequestDetails() {
  const item = requestDetails;
  const details = [
    ['บริษัท', item.seller_name], ['รอบ (ค.ศ.)', item.year], ['สถานะ', statusLabels[item.status]],
    ['จำนวนที่ขอขาย', number.format(item.amount_tco2e) + ' ตัน CO₂e'],
    ['ราคาต่อตัน', price.format(item.price_per_ton) + ' บาท'],
    ['วันที่ส่ง', formatTime(item.created_at)], ['ผู้ติดต่อ', item.contact_name || 'ยังไม่ได้ระบุ'],
    ['อีเมล', item.contact_email || '—'], ['โทรศัพท์', item.contact_phone || '—'],
    ['ผู้ตรวจ', item.reviewer_name || 'ยังไม่ตรวจ'], ['เวลาตรวจ', formatTime(item.reviewed_at)]
  ];
  get('requestDetailsContent').innerHTML = table(
    ['รายการ', 'ข้อมูล'], details.map(([label, value]) => [label, escapeHtml(value)]), ''
  ) + '<h3 class="h6 section-title mt-3">รายละเอียด</h3><p class="request-description">'
    + escapeHtml(item.description || '—') + '</p>'
    + '<h3 class="h6 section-title">ผลตรวจและเหตุผล</h3><p class="request-description">'
    + escapeHtml(item.review_reason || 'ยังไม่มีหมายเหตุ') + '</p>'
    + '<h3 class="h6 section-title">หลักฐานประกอบ</h3>'
    + (item.attachments.length ? item.attachments.map(file =>
      '<button type="button" class="btn btn-outline-primary btn-sm me-2 mb-2" data-evidence="'
      + escapeHtml(file.id) + '">' + escapeHtml(file.filename) + ' · '
      + number.format(file.size_bytes / 1024) + ' KB</button>').join('')
      : '<p class="text-body-secondary">ยังไม่มีไฟล์แนบ</p>');
  get('requestReviewForm').hidden = user.role !== 'Admin' || item.status !== 'Pending'
    || round.status !== 'Trading';
}

async function openRequestDetails(id) {
  const sequence = ++detailSequence;
  const account = user;
  requestDetails = undefined;
  notice('', 'success', 'requestDetailsNotice');
  get('requestDetailsContent').textContent = 'กำลังโหลดรายละเอียด…';
  get('requestReviewForm').hidden = true;
  get('requestReviewForm').reset();
  if (!get('requestDetailsDialog').open) get('requestDetailsDialog').showModal();
  try {
    const { data } = await api('/credits/listings/' + id);
    if (sequence !== detailSequence || user !== account) return;
    requestDetails = data;
    renderRequestDetails();
  } catch (error) {
    if (sequence === detailSequence && user === account) notice(error.message, 'danger', 'requestDetailsNotice');
  }
}

function requestDetailsClick(event) {
  const button = event.target.closest('[data-request-details]');
  if (!button) return false;
  openRequestDetails(button.dataset.requestDetails);
  return true;
}

get('closeRequestDetails').onclick = () => get('requestDetailsDialog').close();
get('requestDetailsDialog').addEventListener('close', () => { detailSequence++; });
get('requestDetailsContent').onclick = async event => {
  const button = event.target.closest('[data-evidence]');
  const item = requestDetails;
  if (!button || !item) return;
  const file = item.attachments.find(file => file.id === button.dataset.evidence);
  if (!file) return;
  const account = user;
  button.disabled = true;
  try {
    const response = await apiFetchEvidence(item.id, file.id);
    if (user !== account) return;
    const url = URL.createObjectURL(response);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = file.filename;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (error) {
    if (user === account) notice(error.message, 'danger', 'requestDetailsNotice');
  } finally {
    button.disabled = false;
  }
};

async function apiFetchEvidence(listingId, fileId, resource = 'credits/listings') {
  const response = await fetch(apiRoot + '/' + resource + '/' + listingId + '/evidence/' + fileId, {
    headers: { Authorization: 'Bearer ' + token }
  });
  if (!response.ok) throw new Error('ดาวน์โหลดหลักฐานไม่ได้ กรุณาลองอีกครั้ง');
  return response.blob();
}

get('requestReviewForm').onsubmit = async event => {
  event.preventDefault();
  const item = requestDetails;
  if (!item) return;
  const decision = event.submitter?.value;
  const reason = get('requestReviewReason').value.trim();
  if (decision === 'reject' && !reason) {
    notice('กรุณาระบุเหตุผลที่ไม่อนุมัติ', 'danger', 'requestDetailsNotice');
    get('requestReviewReason').focus();
    return;
  }
  const account = user;
  const buttons = get('requestReviewForm').querySelectorAll('button');
  buttons.forEach(button => { button.disabled = true; });
  try {
    await api('/credits/listings/' + item.id + '/review', 'PUT', { decision, reason });
    if (user !== account) return;
    await openRequestDetails(item.id);
    notice('บันทึกผลตรวจสอบแล้ว', 'success', 'requestDetailsNotice');
    await refresh();
  } catch (error) {
    if (user === account) notice(error.message, 'danger', 'requestDetailsNotice');
  } finally {
    buttons.forEach(button => { button.disabled = false; });
  }
};

function renderEmissionRequests() {
  const isAdmin = user.role === 'Admin';
  get('emissionReviewSection').hidden = !isAdmin;
  const headers = ['บริษัท', 'ช่วงใช้งาน', 'กิจกรรม', 'เลขเอกสาร', 'ตัน CO₂e', 'สถานะ', 'จัดการ'];
  const render = rows => table(headers, rows.map(item => [
    escapeHtml(item.company_name), escapeHtml(item.period_start) + ' ถึง ' + escapeHtml(item.period_end),
    activities[item.activity_type][0], escapeHtml(item.document_number),
    number.format(item.carbon_ton_equivalent), statusLabels[item.status],
    '<button type="button" class="btn btn-outline-primary btn-sm" data-emission-request="' + escapeHtml(item.id) + '">ดูรายละเอียด</button>'
  ]), 'ยังไม่มีคำขอยอดใช้จริง');
  get('emissionSubmissions').innerHTML = render(emissionRequests);
  get('emissionReviewQueue').innerHTML = isAdmin
    ? render(emissionRequests.filter(item => item.status === 'Pending')) : '';
}

function emissionDetailsClick(event) {
  const button = event.target.closest('[data-emission-request]');
  if (button) openEmissionDetails(button.dataset.emissionRequest);
}

async function openEmissionDetails(id) {
  const sequence = ++emissionDetailSequence;
  const account = user;
  emissionDetails = undefined;
  notice('', 'success', 'emissionDetailsNotice');
  get('emissionDetailsContent').textContent = 'กำลังโหลด…';
  get('emissionDecisionForm').hidden = true;
  get('cancelEmissionSubmission').hidden = true;
  get('emissionDecisionForm').reset();
  if (!get('emissionDetailsDialog').open) get('emissionDetailsDialog').showModal();
  try {
    const { data } = await api('/emissions/submissions/' + id);
    if (sequence !== emissionDetailSequence || user !== account) return;
    emissionDetails = data;
    const info = [
      ['บริษัท', data.company_name], ['สถานะ', statusLabels[data.status]],
      ['ช่วงใช้งาน', data.period_start + ' ถึง ' + data.period_end],
      ['เลขเอกสาร', data.document_number], ['กิจกรรม', activities[data.activity_type][0]],
      ['ปริมาณใช้', number.format(data.amount) + ' ' + activities[data.activity_type][1]],
      ['ยอดปล่อย', number.format(data.carbon_ton_equivalent) + ' ตัน CO₂e'],
      ['ยื่นเมื่อ', formatTime(data.created_at)], ['ผู้ตรวจ', data.reviewer_name || 'ยังไม่ตรวจ'],
      ['ตรวจเมื่อ', formatTime(data.reviewed_at)]
    ];
    get('emissionDetailsContent').innerHTML = table(['รายการ', 'ข้อมูล'], info.map(([label, value]) => [label, escapeHtml(value)]), '')
      + '<h3 class="h6 section-title mt-3">หมายเหตุ</h3><p class="request-description">' + escapeHtml(data.notes || '—')
      + '</p><h3 class="h6 section-title">ผลตรวจและเหตุผล</h3><p class="request-description">'
      + escapeHtml(data.review_reason || 'ยังไม่มีหมายเหตุ') + '</p><h3 class="h6 section-title">หลักฐาน</h3>'
      + data.attachments.map(file => '<button type="button" class="btn btn-outline-primary btn-sm mb-2 me-2" data-emission-evidence="'
        + escapeHtml(file.id) + '">' + escapeHtml(file.filename) + '</button>').join('');
    const actionable = data.status === 'Pending' && ['Reporting', 'Trading'].includes(round.status);
    get('emissionDecisionForm').hidden = !actionable || user.role !== 'Admin';
    get('cancelEmissionSubmission').hidden = !actionable || user.role !== 'Company';
  } catch (error) {
    if (sequence === emissionDetailSequence && user === account) notice(error.message, 'danger', 'emissionDetailsNotice');
  }
}

get('emissionSubmissions').onclick = emissionDetailsClick;
get('emissionReviewQueue').onclick = emissionDetailsClick;
get('closeEmissionDetails').onclick = () => get('emissionDetailsDialog').close();
get('emissionDetailsDialog').addEventListener('close', () => { emissionDetailSequence++; });
get('emissionDetailsContent').onclick = async event => {
  const button = event.target.closest('[data-emission-evidence]');
  const item = emissionDetails;
  if (!button || !item) return;
  const file = item.attachments.find(file => file.id === button.dataset.emissionEvidence);
  if (!file) return;
  const account = user;
  button.disabled = true;
  try {
    const blob = await apiFetchEvidence(item.id, file.id, 'emissions/submissions');
    if (user !== account) return;
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = file.filename;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (error) {
    if (user === account) notice(error.message, 'danger', 'emissionDetailsNotice');
  } finally {
    button.disabled = false;
  }
};

get('emissionDecisionForm').onsubmit = async event => {
  event.preventDefault();
  const item = emissionDetails;
  if (!item) return;
  const account = user;
  const decision = event.submitter?.value;
  const reason = get('emissionDecisionReason').value.trim();
  if (decision === 'reject' && !reason) {
    notice('กรุณาระบุเหตุผลที่ไม่อนุมัติ', 'danger', 'emissionDetailsNotice');
    return;
  }
  const buttons = get('emissionDecisionForm').querySelectorAll('button');
  buttons.forEach(button => { button.disabled = true; });
  try {
    const result = await api('/emissions/submissions/' + item.id + '/review', 'PUT', { decision, reason });
    if (user !== account) return;
    await openEmissionDetails(item.id);
    notice('บันทึกผลตรวจสอบแล้ว' + (result.cancelled_listing_count
      ? ' ยกเลิกประกาศที่สิทธิไม่พอ ' + number.format(result.cancelled_listing_count) + ' รายการ' : ''),
      'success', 'emissionDetailsNotice');
    await refresh();
  } catch (error) {
    if (user === account) notice(error.message, 'danger', 'emissionDetailsNotice');
  } finally {
    buttons.forEach(button => { button.disabled = false; });
  }
};

get('cancelEmissionSubmission').onclick = async event => {
  const item = emissionDetails;
  if (!item || !confirm('ยกเลิกคำขอยอดใช้จริงนี้?')) return;
  const account = user;
  const button = event.currentTarget;
  button.disabled = true;
  try {
    await api('/emissions/submissions/' + item.id, 'DELETE');
    if (user !== account) return;
    await openEmissionDetails(item.id);
    await refresh();
  } catch (error) {
    if (user === account) notice(error.message, 'danger', 'emissionDetailsNotice');
  } finally {
    button.disabled = false;
  }
};

get('listingReviewQueue').onclick = requestDetailsClick;

get('listings').onclick = event => {
  if (requestDetailsClick(event)) return;
  const button = event.target.closest('[data-cancel]');
  if (button && confirm('ยกเลิกประกาศและคืนสิทธิที่ยังขายไม่ออก?')) {
    mutate(async () => { await api('/credits/listings/' + button.dataset.cancel, 'DELETE'); }, 'ยกเลิกประกาศแล้ว', button);
  }
};

if (token) {
  api('/auth/me').then(result => showApp(result.user)).catch(() => {
    token = null;
    localStorage.removeItem('demo_token');
    showGuestPage();
  });
} else {
  showGuestPage();
}
