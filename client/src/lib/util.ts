export const TimezoneOffset = new Date().getTimezoneOffset()*60*1000;
export const DayMS = 3600*24*1000

export function timeString(ms: number) {
  let hrs = Math.floor(ms/(3600*1000));
  let mm = Math.floor((ms%(1000*3600))/(60*1000)).toString();
  while (mm.length<2) mm=`0${mm}`;
  return `${(hrs%12 == 0) ? 12 : hrs%12}:${mm} ${hrs>=12 ? "pm" : "am"}`;
}

export function toLocal(ms: number) {
  return (ms-TimezoneOffset)%DayMS; //works 99% of the time :)
}