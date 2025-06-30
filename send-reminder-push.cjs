const admin = require('firebase-admin');
const { createClient } = require('@supabase/supabase-js');

// TODO: Replace with your actual paths and keys
const serviceAccount = require('./serviceAccountKey.json');
const SUPABASE_URL = 'https://kigszvelfstchvkimpms.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtpZ3N6dmVsZnN0Y2h2a2ltcG1zIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0OTk3NDIzNiwiZXhwIjoyMDY1NTUwMjM2fQ.4L4VgN2QJzlSJVsYMXlZZcw-u7EBMo2-3on_he58RLQ';

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

function parseReminderDateTime(reminder) {
  // Combine due_date and due_time into a JS Date object
  // due_date: 'YYYY-MM-DD', due_time: 'HH:mm' or null
  if (!reminder.due_date) return null;
  let dateTimeStr = reminder.due_date;
  if (reminder.due_time) dateTimeStr += 'T' + reminder.due_time;
  else dateTimeStr += 'T00:00';
  return new Date(dateTimeStr);
}

async function sendDueReminders() {
  const now = new Date();
  const { data: reminders, error } = await supabase
    .from('reminders')
    .select('*')
    .eq('is_completed', false)
    .or('notified.is.false,notified.is.null');

  if (error) {
    console.error('Error fetching reminders:', error);
    return;
  }

  for (const reminder of reminders.data || []) {
    const dueDateTime = new Date(reminder.due_date + (reminder.due_time ? 'T' + reminder.due_time : ''));
    console.log(`Checking reminder: ${reminder.title}, due: ${dueDateTime}, now: ${now}`);
    if (dueDateTime <= now) {
      const { data: tokenRow, error: tokenError } = await supabase
        .from('user_push_tokens')
        .select('token')
        .eq('user_id', reminder.user_id)
        .single();
      if (tokenError || !tokenRow) continue;
      try {
        const payload = {
          notification: {
            title: reminder.title,
            body: reminder.description || 'You have a new reminder!',
            icon: '/assets/images/icon-192.png',
            sound: 'default',
          },
          data: {
            reminder_id: reminder.id,
            pet_id: reminder.pet_id,
            is_recurring: reminder.is_recurring ? 'true' : 'false',
          },
        };
        await admin.messaging().send({
          token: tokenRow.token,
          ...payload,
        });
        if (reminder.is_recurring && reminder.recurrence_pattern) {
          let nextDate = new Date(dueDateTime);
          let custom = null;
          try {
            if (reminder.recurrence_pattern.startsWith('{')) {
              custom = JSON.parse(reminder.recurrence_pattern);
            }
          } catch {}
          if (custom) {
            const interval = custom.interval || 1;
            const unit = custom.unit || 'days';
            if (unit === 'days') {
              nextDate.setDate(nextDate.getDate() + interval);
            } else if (unit === 'weeks') {
              if (custom.weekdays && Array.isArray(custom.weekdays) && custom.weekdays.length > 0) {
                let currentDay = nextDate.getDay();
                let daysUntilNext = null;
                for (let i = 1; i <= 7; i++) {
                  const candidate = (currentDay + i) % 7;
                  if (custom.weekdays.includes(candidate.toString())) {
                    daysUntilNext = i;
                    break;
                  }
                }
                if (daysUntilNext !== null) {
                  nextDate.setDate(nextDate.getDate() + daysUntilNext);
                } else {
                  nextDate.setDate(nextDate.getDate() + 7 * interval);
                }
              } else {
                nextDate.setDate(nextDate.getDate() + 7 * interval);
              }
            } else if (unit === 'months') {
              const day = nextDate.getDate();
              nextDate.setMonth(nextDate.getMonth() + interval);
              if (nextDate.getDate() < day) {
                nextDate.setDate(0);
              }
            }
          } else if (reminder.recurrence_pattern === 'daily') {
            nextDate.setDate(nextDate.getDate() + 1);
          } else if (reminder.recurrence_pattern === 'weekly') {
            nextDate.setDate(nextDate.getDate() + 7);
          } else if (reminder.recurrence_pattern === 'monthly') {
            const day = nextDate.getDate();
            nextDate.setMonth(nextDate.getMonth() + 1);
            if (nextDate.getDate() < day) {
              nextDate.setDate(0);
            }
          }
          if (reminder.recurrence_end_date && nextDate > new Date(reminder.recurrence_end_date)) {
            await supabase
              .from('reminders')
              .update({ is_completed: true })
              .eq('id', reminder.id);
          } else {
            await supabase
              .from('reminders')
              .update({ due_date: nextDate.toISOString().split('T')[0], is_completed: false })
              .eq('id', reminder.id);
          }
        } else {
          await supabase
            .from('reminders')
            .update({ is_completed: true })
            .eq('id', reminder.id);
        }
        console.log(`Notification sent for reminder: ${reminder.title}`);
      } catch (err) {
        console.error('Error sending notification:', err);
      }
    }
  }
}

setInterval(sendDueReminders, 5000);
console.log('AniMedi reminder push service started. Checking every 5 seconds...'); 