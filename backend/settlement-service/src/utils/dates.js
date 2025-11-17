export const startOfDayUtc = (value = new Date()) => {
  const date = new Date(value);
  date.setUTCHours(0, 0, 0, 0);
  return date;
};

export const endOfDayUtc = (value = new Date()) => {
  const end = startOfDayUtc(value);
  end.setUTCDate(end.getUTCDate() + 1);
  end.setUTCMilliseconds(end.getUTCMilliseconds() - 1);
  return end;
};

export const startOfWeekUtc = (value = new Date()) => {
  const date = new Date(value);
  const day = date.getUTCDay();
  const diff = (day + 6) % 7; // Monday as start of week
  date.setUTCDate(date.getUTCDate() - diff);
  date.setUTCHours(0, 0, 0, 0);
  return date;
};

export const endOfWeekUtc = (value = new Date()) => {
  const start = startOfWeekUtc(value);
  start.setUTCDate(start.getUTCDate() + 7);
  start.setUTCMilliseconds(start.getUTCMilliseconds() - 1);
  return start;
};

export const resolvePeriodRange = (value = new Date(), mode = "day") => {
  if (mode === "week") {
    return {
      periodStart: startOfWeekUtc(value),
      periodEnd: endOfWeekUtc(value)
    };
  }
  return {
    periodStart: startOfDayUtc(value),
    periodEnd: endOfDayUtc(value)
  };
};
