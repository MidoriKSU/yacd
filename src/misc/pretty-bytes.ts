// steal from https://github.com/sindresorhus/pretty-bytes/blob/master/index.js

const UNITS = ['B', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];

export default function prettyBytes(n: number) {
  if (!Number.isFinite(n) || n <= 0) {
    return '0 B';
  }
  if (n < 1000) {
    return n + ' B';
  }
  const exponent = Math.min(Math.floor(Math.log10(n) / 3), UNITS.length - 1);
  const formatted = Number((n / Math.pow(1000, exponent)).toPrecision(3));
  const unit = UNITS[exponent];
  return formatted + ' ' + unit;
}
