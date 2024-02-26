function formatFromNow(timestamp) {
  const now = new Date();
  // Stats timestamps always in UTC, so we need to append a "Z" to indicate
  // this when parsing into local timezone here.
  const sessionDate = new Date(timestamp.replace(" ", "T") + "Z");
  const diffInSeconds = Math.floor((now - sessionDate) / 1000);
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

  if (Math.abs(diffInSeconds) < 60) {
    return rtf.format(-diffInSeconds, "second");
  } else if (Math.abs(diffInSeconds) < 3600) {
    return rtf.format(-Math.floor(diffInSeconds / 60), "minute");
  } else if (Math.abs(diffInSeconds) < 86400) {
    return rtf.format(-Math.floor(diffInSeconds / 3600), "hour");
  } else {
    return rtf.format(-Math.floor(diffInSeconds / 86400), "day");
  }
}

function mapHourlyEventsToLocalTime(events) {
  // Get the current time in the user's local timezone
  const now = new Date();
  let startOfCustomDay = new Date(now);

  // Adjust the startOfCustomDay to 6 AM of the current or previous day
  if (now.getHours() < 6) {
    // If it's earlier than 6 AM, the custom day started the previous day
    startOfCustomDay.setDate(now.getDate() - 1);
  }
  startOfCustomDay.setHours(6, 0, 0, 0); // Set to 6 AM

  // Create an array to represent each hour of the custom 24-hour day
  let customDayHours = new Array(24).fill().map((_, index) => {
    const hourDate = new Date(startOfCustomDay.getTime() + index * 3600 * 1000);
    let hours = hourDate.getHours();
    const ampm = hours >= 12 ? "PM" : "AM";
    hours = hours % 12;
    hours = hours ? hours : 12; // the hour '0' should be '12'
    const formattedHour = hours + ampm;
    return {
      formattedHour: formattedHour,
      hour: hourDate.getHours(),
      date: hourDate.toISOString().slice(0, 10), // YYYY-MM-DD
      count: 0,
      isCurrent:
        now.getHours() === hourDate.getHours() &&
        now.getDate() === hourDate.getDate(),
    };
  });

  // Translate UTC event times to local timezone and assign counts
  events.forEach((event) => {
    // Assumes input is in ISO format and thus interprets as UTC
    const eventDateUTC = new Date(event.hour + "Z");

    // Convert eventDateUTC to local time
    const eventDateLocal = new Date(
      eventDateUTC.getTime() +
        eventDateUTC.getTimezoneOffset() * 60000 +
        now.getTimezoneOffset() * -60000
    );

    // Find the matching hour in customDayHours to update the count
    const matchingHourIndex = customDayHours.findIndex(
      (hour) =>
        hour.date === eventDateLocal.toISOString().slice(0, 10) &&
        hour.hour === eventDateLocal.getHours()
    );

    if (matchingHourIndex !== -1) {
      customDayHours[matchingHourIndex].count += event.count;
    }
  });

  return customDayHours;
}

async function renderHourlySummary() {
  const response = await fetch("/summary/hourly");
  const hourlyEvents = await response.json();
  const hourlyDiv = document.getElementById("hourly");
  const localEvents = mapHourlyEventsToLocalTime(hourlyEvents);
  const maxCount = Math.max(...localEvents.map((event) => event.count));
  const scaleFactor = 150 / maxCount;
  let pastCurrentHour = false;

  hourlyDiv.innerHTML = `
                  <div class="hourly">
                      ${localEvents
                        .map((hour) => {
                          const barHeight = hour.count * scaleFactor;

                          if (hour.isCurrent) {
                            pastCurrentHour = true;
                          }

                          return `<div class="col">
                                      <div class="bar ${
                                        pastCurrentHour && "future"
                                      }" style="height: 150px;">
                                          <div class="bar-fill" style="height: ${barHeight}px;"></div>
                                      </div>
                                      <div class="hour ${
                                        hour.isCurrent && "current"
                                      }">${hour.formattedHour}</div>
                                  </div>`;
                        })
                        .join("")}
                  </div>
              `;
}

async function renderUrls() {
  const response = await fetch("/summary/urls");
  const urls = await response.json();
  const urlsDiv = document.getElementById("urls");

  urlsDiv.innerHTML = `
                <div class="urls">
                <div class="top">Top paths</div>
                    ${urls
                      .map((url) => {
                        // parse url into host and path
                        let host, path;

                        try {
                          const urlObj = new URL(url.url);
                          host = urlObj.host;
                          path = urlObj.pathname + urlObj.search;
                        } catch (err) {
                          host = "";
                          path = url.url;
                        }

                        return `<div class="url">

                        <div class="left">
                        <div class="time">${url.count}</div>
                        </div>
                        <div class="right">
                            <div class="host">${host}</div>
                            <div class="path">${path}</div>
                        </div>
                      </div>
                              `;
                      })
                      .join("")}


                </div>
            `;
}

function prettyPrintTimeDifference(utcTimestamp1, utcTimestamp2) {
  try {
    // Parse the UTC timestamp strings to Date objects
    const date1 = new Date(utcTimestamp1);
    const date2 = new Date(utcTimestamp2);

    if (isNaN(date1.getTime()) || isNaN(date2.getTime())) {
      return ["00", "00", "00"];
    }

    // Calculate the difference in milliseconds
    const differenceInMilliseconds = Math.abs(date2 - date1);

    // Convert to total seconds
    const totalSeconds = Math.floor(differenceInMilliseconds / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    // Format as HH:MM:SS
    const formatted = [
      hours.toString().padStart(2, "0"),
      minutes.toString().padStart(2, "0"),
      seconds.toString().padStart(2, "0"),
    ];

    return formatted;
  } catch (error) {
    // Return default value in case of any errors
    return ["00", "00", "00"];
  }
}

async function renderSessions() {
  const response = await fetch("/sessions");
  const sessions = await response.json();
  const sessionsDiv = document.getElementById("sessions");

  sessionsDiv.innerHTML = `
    <div class="sessions">
      ${sessions
        .map((session) => {
          const duration = prettyPrintTimeDifference(
            session.events[0]?.timestamp,
            session.events[session.events.length - 1]?.timestamp
          );

          return `<div class="session">
              <div class="top">
                <div class="left">
                ${session.events?.length} event${
            session.events?.length !== 1 ? "s" : ""
          } → from ${session.collector.city}, ${session.collector.country}
                </div>
                <div class="right">
                  <div class="duration">
                    <div class="item">${duration[0]}<b>H</b></div>
                    <div class="item">${duration[1]}<b>M</b></div>
                    <div class="item">${duration[2]}<b>S</b></div>
                  </div>
                </div>
              </div>
           
        <div class="events">
            ${session.events
              // .reverse()
              .map((event) => {
                let host, path;

                try {
                  const urlObj = new URL(event.url);
                  host = urlObj.host;
                  path = urlObj.pathname + urlObj.search;
                } catch (err) {
                  host = "";
                  path = event.url;
                }

                return `
                <div class="event">
                  <div class="left">
                      <div class="name">${event.name}</div>
                      <div class="host">${host}</div>
                      <div class="path">${path}</div>
                  </div>
                  <div class="right">
                      <div class="time">${formatFromNow(event.timestamp)}</div>
                  </div>
                </div>
                `;
              })
              .join("")}
          </div>
      </div>
          `;
        })
        .join("")}


                </div>
            `;
}

async function renderSummary() {
  const summaryResponse = await fetch("/summary");
  const summary = await summaryResponse.json();
  Object.keys(summary).forEach((key) => {
    const element = document.getElementById(key);
    if (element) {
      element.innerText = summary[key];
    }
  });
}
async function renderHeader() {
  const sessionsDiv = document.getElementById("headerTime");
  const now = new Date();
  const options = {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
  };
  const localeDateTime = now.toLocaleDateString("en-US", options);
  sessionsDiv.innerText = localeDateTime;
}

async function fetchAndRenderAnalytics() {
  try {
    await Promise.all([
      renderHeader(),
      renderSessions(),
      renderSummary(),
      renderHourlySummary(),
      renderUrls(),
    ]);
  } catch (error) {
    console.error("Error fetching analytics:", error);
  }
}

// SETUP
fetchAndRenderAnalytics();

function refreshAnalytics() {
  if (!document.hidden) {
    fetchAndRenderAnalytics();

    // set a class on #live for 3 seconds
    const live = document.getElementById("live");
    live.style.backgroundColor = "red";
    setTimeout(() => {
      live.style.backgroundColor = "#e2e2e2";
      live.classList.remove("fresh");
    }, 1000);
  }
}

// Refresh analytics every 5 seconds and when user comes back to the page
setInterval(refreshAnalytics, 5000);
document.addEventListener("visibilitychange", refreshAnalytics);
