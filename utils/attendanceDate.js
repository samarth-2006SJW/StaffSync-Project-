const parseAttendanceDate = (value) => {
  if (typeof value !== "string" || value.trim() === "") return null;

  const isCalendarDate = (calendarDate) => {
    const day = new Date(`${calendarDate}T00:00:00.000Z`);

    return !Number.isNaN(day.getTime()) && day.toISOString().slice(0, 10) === calendarDate;
  };

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return isCalendarDate(value) ? new Date(`${value}T00:00:00.000Z`) : null;
  }

  const dateTimePattern =
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/i;

  if (!dateTimePattern.test(value) || !isCalendarDate(value.slice(0, 10))) return null;

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return null;

  date.setUTCHours(0, 0, 0, 0);
  return date;
};

module.exports = parseAttendanceDate;
