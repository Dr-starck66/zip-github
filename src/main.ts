import './styles.css';

type Vehicle = 'sedan' | 'suv' | 'truck';
type Offer = {
  id: string;
  brand: string;
  model: string;
  trim: string;
  vehicle: Vehicle;
  monthly: number;
  due: number;
  term: number;
  miles: number;
  expires: string;
  source: string;
  manufacturer: string;
};

const source =
  'https://www.jdpower.com/cars/shopping-guides/best-car-lease-deals-in-october-2026';
const offers: Offer[] = [
  {
    id: 'corolla',
    brand: 'Toyota',
    model: '2026 Corolla',
    trim: 'LE · Sedan',
    vehicle: 'sedan',
    monthly: 239,
    due: 2999,
    term: 36,
    miles: 10000,
    expires: '2026-11-02',
    source,
    manufacturer: 'https://www.toyota.com/deals-incentives/',
  },
  {
    id: 'kona',
    brand: 'Hyundai',
    model: '2027 Kona',
    trim: 'SE FWD · Compact SUV',
    vehicle: 'suv',
    monthly: 239,
    due: 3999,
    term: 36,
    miles: 10000,
    expires: '2026-11-02',
    source,
    manufacturer: 'https://www.hyundaiusa.com/us/en/offers',
  },
  {
    id: 'civic',
    brand: 'Honda',
    model: '2026 Civic Hybrid',
    trim: 'Sedan Sport Hybrid',
    vehicle: 'sedan',
    monthly: 259,
    due: 3999,
    term: 39,
    miles: 10000,
    expires: '2026-11-02',
    source,
    manufacturer: 'https://automobiles.honda.com/tools/current-offers',
  },
  {
    id: 'colorado',
    brand: 'Chevrolet',
    model: '2026 Colorado',
    trim: 'Trail Boss Crew Cab 4WD',
    vehicle: 'truck',
    monthly: 249,
    due: 4999,
    term: 24,
    miles: 10000,
    expires: '2026-11-04',
    source,
    manufacturer: 'https://www.chevrolet.com/current-deals',
  },
  {
    id: 'wrangler',
    brand: 'Jeep',
    model: '2026 Wrangler',
    trim: '4-Door Sport S',
    vehicle: 'suv',
    monthly: 329,
    due: 3729,
    term: 42,
    miles: 10000,
    expires: '2026-11-02',
    source,
    manufacturer: 'https://www.jeep.com/incentives/offers-model.html',
  },
  {
    id: 'telluride',
    brand: 'Kia',
    model: '2027 Telluride',
    trim: 'S FWD · SUV',
    vehicle: 'suv',
    monthly: 429,
    due: 3999,
    term: 36,
    miles: 10000,
    expires: '2026-11-02',
    source,
    manufacturer: 'https://www.kia.com/us/en/offers',
  },
  {
    id: 'gv80',
    brand: 'Genesis',
    model: '2026 GV80',
    trim: '2.5T Select AWD · Luxury SUV',
    vehicle: 'suv',
    monthly: 469,
    due: 5999,
    term: 24,
    miles: 10000,
    expires: '2026-11-02',
    source,
    manufacturer: 'https://www.genesis.com/us/en/offers',
  },
  {
    id: 'f150',
    brand: 'Ford',
    model: '2026 F-150',
    trim: 'STX · Pickup Truck',
    vehicle: 'truck',
    monthly: 499,
    due: 1498,
    term: 36,
    miles: 10500,
    expires: '2026-11-02',
    source,
    manufacturer: 'https://www.ford.com/trucks/f150/pricing-and-incentives/',
  },
];

const dollar = (amount: number): string =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(amount);
const isExpired = (offer: Offer): boolean =>
  Date.now() > Date.parse(offer.expires + 'T23:59:59Z');
const effective = (offer: Offer): number =>
  (offer.monthly * (offer.term - 1) + offer.due) / offer.term;

function vehicleArt(kind: Vehicle): string {
  const bed =
    kind === 'truck'
      ? '<path d="M183 88h75v38H160V102h23z" fill="#a2b9ad"/>'
      : '';
  const roof =
    kind === 'truck'
      ? '<path d="M63 126l39-43h80l28 43z" fill="#68877c"/><path d="M100 88h72l25 36H71z" fill="#194c48"/>'
      : kind === 'suv'
        ? '<path d="M64 126l35-53h111l56 53z" fill="#638a80"/><path d="M100 80h101l46 44H68z" fill="#174b46"/>'
        : '<path d="M62 132l51-45h94l55 45z" fill="#688e83"/><path d="M115 91h90l48 41H68z" fill="#174b46"/>';
  return (
    '<svg viewBox="0 0 340 180" role="img" aria-label="Stylized ' +
    kind +
    ' illustration, not vehicle product photography">' +
    '<ellipse cx="169" cy="150" rx="132" ry="13" fill="#3a6353" opacity=".13"/>' +
    bed +
    roof +
    '<path d="M45 128L70 117H264L296 133L299 150H37L36 139z" fill="#a0bbb0" stroke="#6b9485" stroke-width="2"/>' +
    '<path d="M39 137h260" stroke="#deebe2" stroke-width="3"/><circle cx="95" cy="149" r="23" fill="#203833"/><circle cx="95" cy="149" r="11" fill="#adcdc0"/><circle cx="249" cy="149" r="23" fill="#203833"/><circle cx="249" cy="149" r="11" fill="#adcdc0"/>' +
    '<path d="M286 130h13v11h-13z" fill="#eefbb6"/><path d="M39 133h20v10H39z" fill="#ffe1a6"/></svg>'
  );
}
const safeDate = (iso: string): string =>
  new Date(iso + 'T12:00:00Z').toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
const grid = document.querySelector<HTMLElement>('#offers-grid');
const typeFilter = document.querySelector<HTMLSelectElement>('#type-filter');
const budgetFilter =
  document.querySelector<HTMLSelectElement>('#budget-filter');
const sortFilter = document.querySelector<HTMLSelectElement>('#sort-filter');
const expiredFilter =
  document.querySelector<HTMLInputElement>('#expired-filter');
const countLabel = document.querySelector<HTMLElement>('#result-count');

function renderOffers(): void {
  if (
    !grid ||
    !typeFilter ||
    !budgetFilter ||
    !sortFilter ||
    !expiredFilter ||
    !countLabel
  )
    return;
  const selection = offers.filter(
    offer =>
      (typeFilter.value === 'all' || offer.vehicle === typeFilter.value) &&
      offer.monthly <= Number(budgetFilter.value) &&
      (expiredFilter.checked || !isExpired(offer))
  );
  const metric = sortFilter.value;
  selection.sort((a, b) =>
    metric === 'upfront'
      ? a.due - b.due
      : metric === 'monthly'
        ? a.monthly - b.monthly
        : effective(a) - effective(b)
  );
  countLabel.textContent =
    selection.length +
    (selection.length === 1 ? ' matching offer' : ' matching offers');
  grid.innerHTML =
    selection.length === 0
      ? '<div class="empty-results"><h3>No matching current offers</h3><p>Try a higher budget, another vehicle type, or select Include expired to review historical examples. We never relabel expired offers as active.</p></div>'
      : selection
          .map(offer => {
            const expired = isExpired(offer);
            const kind =
              offer.vehicle === 'suv'
                ? 'SUV / CROSSOVER'
                : offer.vehicle === 'truck'
                  ? 'PICKUP'
                  : 'SEDAN';
            return (
              '<article class="offer-card">' +
              '<div class="offer-illustration ' +
              offer.vehicle +
              '"><span class="offer-category">' +
              kind +
              '</span>' +
              vehicleArt(offer.vehicle) +
              '</div>' +
              '<div class="offer-body"><div class="offer-brand">' +
              offer.brand +
              '</div><h3>' +
              offer.model +
              '</h3><p class="offer-trim">' +
              offer.trim +
              '</p>' +
              '<div class="offer-price"><strong>' +
              dollar(offer.monthly) +
              '</strong><span>/ month advertised</span></div>' +
              '<div class="offer-details"><div><span>Due at signing</span><strong>' +
              dollar(offer.due) +
              '</strong></div><div><span>Lease length</span><strong>' +
              offer.term +
              ' months</strong></div><div><span>Miles per year</span><strong>' +
              offer.miles.toLocaleString('en-US') +
              '</strong></div><div><span>Published end date</span><strong>' +
              safeDate(offer.expires) +
              '</strong></div></div>' +
              '<div class="offer-effective"><span>Estimated effective monthly†</span><strong>' +
              dollar(Math.round(effective(offer))) +
              '</strong></div>' +
              '<div class="offer-status ' +
              (expired ? 'expired' : '') +
              '">' +
              (expired
                ? '● Expired — historical example'
                : '● Reported offer — verify locally') +
              '</div>' +
              '<div class="offer-links"><a href="' +
              offer.source +
              '" target="_blank" rel="noopener noreferrer">Published source ↗</a>' +
              '<a href="' +
              offer.manufacturer +
              '" target="_blank" rel="noopener noreferrer">Official offers ↗</a></div></div></article>'
            );
          })
          .join('');
}

function calculate(): void {
  const num = (id: string): number =>
    Number(
      (document.querySelector<HTMLInputElement>('#' + id)?.value ?? '').trim()
    );
  const first = document.querySelector<HTMLSelectElement>('#calc-first')?.value;
  const monthly = num('calc-monthly');
  const due = num('calc-due');
  const term = num('calc-term');
  const fees = num('calc-fees');
  const err = document.querySelector<HTMLElement>('#calc-error');
  const out = document.querySelector<HTMLElement>('#calc-result');
  const totalEl = document.querySelector<HTMLElement>('#calc-total');
  const explanation = document.querySelector<HTMLElement>('#calc-explain');
  if (!err || !out || !totalEl || !explanation) return;
  if (
    ![monthly, due, term, fees].every(Number.isFinite) ||
    monthly < 0 ||
    due < 0 ||
    fees < 0 ||
    term < 1 ||
    term > 120 ||
    !Number.isInteger(term)
  ) {
    err.textContent =
      'Enter non-negative amounts and a whole-number term between 1 and 120 months.';
    out.textContent = '—';
    totalEl.textContent = '—';
    explanation.textContent = 'Adjust your inputs to calculate.';
    return;
  }
  err.textContent = '';
  const paymentCount = first === 'yes' ? term - 1 : term;
  const total = monthly * paymentCount + due + fees;
  const perMonth = total / term;
  out.textContent = dollar(Math.round(perMonth));
  totalEl.textContent = dollar(Math.round(total));
  explanation.textContent =
    paymentCount +
    ' remaining monthly payments + ' +
    dollar(due) +
    ' due at signing + ' +
    dollar(fees) +
    ' additional known fees, spread over ' +
    term +
    ' months. Assumes ' +
    (first === 'yes'
      ? 'first payment is part of upfront cash.'
      : 'first payment is additional to upfront cash.');
}
for (const select of [typeFilter, budgetFilter, sortFilter, expiredFilter])
  select?.addEventListener('change', renderOffers);
for (const id of [
  'calc-monthly',
  'calc-due',
  'calc-term',
  'calc-fees',
  'calc-first',
]) {
  document.getElementById(id)?.addEventListener('input', calculate);
  document.getElementById(id)?.addEventListener('change', calculate);
}
renderOffers();
calculate();
