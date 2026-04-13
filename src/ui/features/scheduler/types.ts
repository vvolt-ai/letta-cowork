export interface ScheduledTask {
  id: string;
  organizationId: string;
  name: string;
  description: string | null;
  prompt: string;
  agentId: string;
  conversationId: string | null;
  scheduleType: "recurring" | "one_off";
  cronExpression: string;
  timezone: string;
  enabled: boolean;
  notifyChannelId: string | null;
  lastRunAt: string | null;
  nextRunAt: string | null;
  runCount?: number;
  lastRun?: ScheduleRun | null;
  createdAt: string;
  updatedAt: string;
}

export interface ScheduleRun {
  id: string;
  taskId: string;
  startedAt: string;
  completedAt: string | null;
  status: "running" | "completed" | "failed";
  output: string | null;
  error: string | null;
  conversationId: string | null;
  createdAt: string;
}

export interface CreateScheduledTaskForm {
  name: string;
  description: string;
  prompt: string;
  agentId: string;
  conversationId: string;
  scheduleType: "recurring" | "one_off";
  frequency: "hourly" | "daily" | "weekly" | "monthly" | "custom";
  time: string;           // HH:MM format for daily/weekly
  dayOfWeek: string;      // 0-6 for weekly
  cronExpression: string; // used when frequency === "custom"
  timezone: string;
  enabled: boolean;
  notifyChannelId: string;
  notifyTarget: string;   // provider-specific target (Discord channel ID, Slack #channel, etc.)
}

/** Convert form frequency + time fields into a cron expression */
export function buildCronExpression(form: CreateScheduledTaskForm): string {
  if (form.frequency === "custom") return form.cronExpression;

  const [hourStr, minStr] = form.time.split(":");
  const hour = parseInt(hourStr ?? "9", 10);
  const minute = parseInt(minStr ?? "0", 10);

  switch (form.frequency) {
    case "hourly":
      return `${minute} * * * *`;
    case "daily":
      return `${minute} ${hour} * * *`;
    case "weekly":
      return `${minute} ${hour} * * ${form.dayOfWeek}`;
    case "monthly":
      return `${minute} ${hour} 1 * *`;
    default:
      return `${minute} ${hour} * * *`;
  }
}

export function formatNextRun(cronExpr: string): string {
  // Simple human-readable summary (node-cron / cronstrue not available in renderer)
  const parts = cronExpr.split(" ");
  if (parts.length < 5) return cronExpr;
  return cronExpr;
}

export const TIMEZONES = [
  "UTC",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Toronto",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Moscow",
  "Asia/Dubai",
  "Asia/Karachi",
  "Asia/Kolkata",
  "Asia/Bangkok",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Australia/Sydney",
  "Pacific/Auckland",
];

export const FREQUENCIES = [
  { value: "hourly",  label: "Hourly" },
  { value: "daily",   label: "Daily" },
  { value: "weekly",  label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "custom",  label: "Custom (cron)" },
] as const;

export const DAYS_OF_WEEK = [
  { value: "0", label: "Sunday" },
  { value: "1", label: "Monday" },
  { value: "2", label: "Tuesday" },
  { value: "3", label: "Wednesday" },
  { value: "4", label: "Thursday" },
  { value: "5", label: "Friday" },
  { value: "6", label: "Saturday" },
];

export const TIME_OPTIONS = Array.from({ length: 48 }, (_, i) => {
  const hour = Math.floor(i / 2);
  const min = i % 2 === 0 ? "00" : "30";
  const h12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  const ampm = hour < 12 ? "AM" : "PM";
  return {
    value: `${String(hour).padStart(2, "0")}:${min}`,
    label: `${h12}:${min} ${ampm}`,
  };
});
