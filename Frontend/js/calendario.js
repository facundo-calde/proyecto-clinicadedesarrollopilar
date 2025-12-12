document.addEventListener("DOMContentLoaded", () => {
  const frame = document.getElementById("gcalFrame");
  if (!frame) return;

  const CALENDAR_ID = "TU_CALENDAR_ID";
  const TZ = "America/Argentina/Buenos_Aires";
  frame.src = `https://calendar.google.com/calendar/embed?src=${encodeURIComponent(CALENDAR_ID)}&ctz=${encodeURIComponent(TZ)}`;
});

