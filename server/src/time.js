/** Múi giờ Asia/Ho_Chi_Minh — tiện ích ngày/giờ/ca */

const TZ = 'Asia/Ho_Chi_Minh';

/** Trả về Date theo giờ Việt Nam (dùng Intl) */
export function nowVN() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(new Date());

  const get = (t) => parts.find((p) => p.type === t)?.value;
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`, // yyyy-mm-dd
    time: `${get('hour')}:${get('minute')}:${get('second')}`, // hh:mm:ss
    hour: Number(get('hour')),
    minute: Number(get('minute')),
    isoLocal: `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}:${get('second')}`,
  };
}

/** Ca: sáng 00:00–11:59, chiều 12:00–23:59 */
export function detectShift(hour) {
  return hour < 12 ? 'sang' : 'chieu';
}

export function shiftLabel(shift) {
  if (shift === 'sang') return 'Sáng';
  if (shift === 'chieu') return 'Chiều';
  if (shift === 'ca_ngay') return 'Cả ngày';
  return shift;
}

/** dd/mm/yyyy */
export function formatDateVN(yyyyMmDd) {
  if (!yyyyMmDd) return '';
  const [y, m, d] = yyyyMmDd.split('-');
  return `${d}/${m}/${y}`;
}

/** hh:mm từ ISO local hoặc hh:mm:ss */
export function formatTimeVN(isoOrTime) {
  if (!isoOrTime) return '';
  if (isoOrTime.includes('T')) {
    return isoOrTime.split('T')[1].slice(0, 5);
  }
  return isoOrTime.slice(0, 5);
}

/** Khoảng ngày nhanh */
export function rangeToday() {
  const { date } = nowVN();
  return { from: date, to: date };
}

export function rangeLast7Days() {
  const { date } = nowVN();
  const d = new Date(date + 'T12:00:00');
  d.setDate(d.getDate() - 6);
  const from = d.toISOString().slice(0, 10);
  return { from, to: date };
}

export function rangeThisMonth() {
  const { date } = nowVN();
  const from = date.slice(0, 7) + '-01';
  return { from, to: date };
}
