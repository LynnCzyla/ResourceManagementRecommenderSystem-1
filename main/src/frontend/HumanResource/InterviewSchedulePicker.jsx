import React, { useState, useMemo, useEffect } from 'react';

// Convert various time formats (24h, 12h, HH:MM:SS) to minutes from midnight
export const parseTimeToMinutes = (timeStr) => {
  if (!timeStr) return null;
  const str = String(timeStr).trim().toUpperCase();
  const match = str.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?$/);
  if (match) {
    let hours = parseInt(match[1], 10);
    const minutes = parseInt(match[2], 10);
    const modifier = match[3];
    if (modifier === 'PM' && hours < 12) hours += 12;
    if (modifier === 'AM' && hours === 12) hours = 0;
    return hours * 60 + minutes;
  }
  return null;
};

// Format time string to clean 12-hour AM/PM format
export const formatTimeDisplay = (timeStr) => {
  if (!timeStr) return '';
  const mins = parseTimeToMinutes(timeStr);
  if (mins === null) return timeStr;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  const period = h >= 12 ? 'PM' : 'AM';
  const displayHours = h % 12 === 0 ? 12 : h % 12;
  return `${String(displayHours).padStart(2, '0')}:${String(m).padStart(2, '0')} ${period}`;
};

export const STANDARD_TIME_SLOTS = [
  { time: '08:30', label: '08:30 AM' },
  { time: '09:00', label: '09:00 AM' },
  { time: '09:30', label: '09:30 AM' },
  { time: '10:00', label: '10:00 AM' },
  { time: '10:30', label: '10:30 AM' },
  { time: '11:00', label: '11:00 AM' },
  { time: '11:30', label: '11:30 AM' },
  { time: '13:00', label: '01:00 PM' },
  { time: '13:30', label: '01:30 PM' },
  { time: '14:00', label: '02:00 PM' },
  { time: '14:30', label: '02:30 PM' },
  { time: '15:00', label: '03:00 PM' },
  { time: '15:30', label: '03:30 PM' },
  { time: '16:00', label: '04:00 PM' },
  { time: '16:30', label: '04:30 PM' },
  { time: '17:00', label: '05:00 PM' },
];

export default function InterviewSchedulePicker({
  selectedDate,
  selectedTime,
  onSelectDate,
  onSelectTime,
  interviews = [],
  excludeInterviewId = null,
}) {
  // Calendar current display month
  const [calendarDate, setCalendarDate] = useState(() => {
    if (selectedDate) {
      const d = new Date(selectedDate);
      if (!isNaN(d.getTime())) return new Date(d.getFullYear(), d.getMonth(), 1);
    }
    return new Date();
  });

  const getNowInManila = () => {
    try {
      const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Manila',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      });
      const parts = formatter.formatToParts(new Date());
      const map = {};
      parts.forEach(p => { map[p.type] = p.value; });
      const year = map.year;
      const month = map.month;
      const day = map.day;
      const hour = parseInt(map.hour, 10);
      const minute = parseInt(map.minute, 10);
      return {
        dateStr: `${year}-${month}-${day}`,
        minutes: hour * 60 + minute,
      };
    } catch (e) {
      const now = new Date();
      return {
        dateStr: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`,
        minutes: now.getHours() * 60 + now.getMinutes(),
      };
    }
  };

  const nowInfo = useMemo(() => getNowInManila(), []);
  const todayStr = nowInfo.dateStr;

  // Auto-clear selected time if it's already passed on today
  useEffect(() => {
    if (selectedDate === todayStr && selectedTime) {
      const selMins = parseTimeToMinutes(selectedTime);
      if (selMins !== null && selMins <= nowInfo.minutes) {
        onSelectTime('');
      }
    }
  }, [selectedDate, todayStr, nowInfo.minutes, selectedTime, onSelectTime]);

  const currentMonthStart = useMemo(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  }, []);

  // Map of date string -> array of scheduled interviews
  const interviewsByDate = useMemo(() => {
    const map = {};
    (interviews || []).forEach(int => {
      if (!int.interviewDate) return;
      // Only active upcoming 'Scheduled' interviews occupy the calendar / slots.
      // If an interview is marked as done (Completed, Hired, Rejected, Cancelled), it should NOT show.
      if (int.status !== 'Scheduled') return;
      if (excludeInterviewId && String(int.id) === String(excludeInterviewId)) return;

      if (!map[int.interviewDate]) map[int.interviewDate] = [];
      map[int.interviewDate].push(int);
    });

    Object.keys(map).forEach(d => {
      map[d].sort((a, b) => (parseTimeToMinutes(a.interviewTime) ?? 0) - (parseTimeToMinutes(b.interviewTime) ?? 0));
    });

    return map;
  }, [interviews, excludeInterviewId]);

  // Calendar cells for the current month
  const calendarCells = useMemo(() => {
    const year = calendarDate.getFullYear();
    const month = calendarDate.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstDayIndex = new Date(year, month, 1).getDay();
    const daysInPrevMonth = new Date(year, month, 0).getDate();

    const totalCells = Math.ceil((firstDayIndex + daysInMonth) / 7) * 7;
    const cells = [];

    for (let i = 0; i < totalCells; i++) {
      if (i < firstDayIndex) {
        const dayNum = daysInPrevMonth - firstDayIndex + 1 + i;
        const d = new Date(year, month - 1, dayNum);
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        cells.push({
          dayNum,
          dateStr: `${y}-${m}-${day}`,
          isCurrentMonth: false,
        });
      } else if (i < firstDayIndex + daysInMonth) {
        const dayNum = i - firstDayIndex + 1;
        const y = year;
        const m = String(month + 1).padStart(2, '0');
        const day = String(dayNum).padStart(2, '0');
        cells.push({
          dayNum,
          dateStr: `${y}-${m}-${day}`,
          isCurrentMonth: true,
        });
      } else {
        const dayNum = i - (firstDayIndex + daysInMonth) + 1;
        const d = new Date(year, month + 1, dayNum);
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        cells.push({
          dayNum,
          dateStr: `${y}-${m}-${day}`,
          isCurrentMonth: false,
        });
      }
    }
    return cells;
  }, [calendarDate]);

  // Interviews on the currently selected date
  const selectedDateInterviews = useMemo(() => {
    if (!selectedDate) return [];
    return interviewsByDate[selectedDate] || [];
  }, [selectedDate, interviewsByDate]);

  // Conflict check for a specific time on the selected date
  const checkTimeConflict = (timeToCheck) => {
    if (!selectedDate || !timeToCheck) return null;
    const targetMins = parseTimeToMinutes(timeToCheck);

    for (const int of selectedDateInterviews) {
      const intMins = parseTimeToMinutes(int.interviewTime);
      if (targetMins !== null && intMins !== null) {
        if (Math.abs(targetMins - intMins) < 30) {
          return int;
        }
      } else if (String(int.interviewTime).trim().toLowerCase() === String(timeToCheck).trim().toLowerCase()) {
        return int;
      }
    }
    return null;
  };

  // Currently selected time conflict
  const currentConflict = useMemo(() => {
    return checkTimeConflict(selectedTime);
  }, [selectedDate, selectedTime, selectedDateInterviews]);

  return (
    <div style={pickerStyles.container}>
      {/* 1. Mini-Calendar Header */}
      <div style={pickerStyles.calendarHeaderBar}>
        <div>
          <h4 style={pickerStyles.monthHeading}>
            {calendarDate.toLocaleString('default', { month: 'long', year: 'numeric' })}
          </h4>
          <span style={pickerStyles.hintText}>
            Click any date below to select it
          </span>
        </div>
        <div style={pickerStyles.navButtonsGroup}>
          <button
            type="button"
            disabled={calendarDate <= currentMonthStart}
            onClick={() => {
              if (calendarDate > currentMonthStart) {
                setCalendarDate(new Date(calendarDate.getFullYear(), calendarDate.getMonth() - 1, 1));
              }
            }}
            style={pickerStyles.navBtn}
            title="Previous Month"
          >
            ‹ Prev
          </button>
          <button
            type="button"
            onClick={() => {
              const now = new Date();
              setCalendarDate(new Date(now.getFullYear(), now.getMonth(), 1));
              onSelectDate(todayStr);
            }}
            style={pickerStyles.todayBtn}
          >
            Today
          </button>
          <button
            type="button"
            onClick={() => setCalendarDate(new Date(calendarDate.getFullYear(), calendarDate.getMonth() + 1, 1))}
            style={pickerStyles.navBtn}
            title="Next Month"
          >
            Next ›
          </button>
        </div>
      </div>

      {/* 2. Days of week */}
      <div style={pickerStyles.daysOfWeekHeader}>
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
          <div key={d} style={pickerStyles.dayColLabel}>{d}</div>
        ))}
      </div>

      {/* 3. Month Grid */}
      <div style={pickerStyles.monthGrid}>
        {calendarCells.map((cell, idx) => {
          const dayInterviews = interviewsByDate[cell.dateStr] || [];
          const isToday = cell.dateStr === todayStr;
          const isPast = cell.dateStr < todayStr;
          const isSelected = selectedDate === cell.dateStr;
          const hasBookings = dayInterviews.length > 0;

          // Tooltip content showing who is scheduled
          const tooltip = hasBookings
            ? `${dayInterviews.length} scheduled:\n` + dayInterviews.map(i => `• ${formatTimeDisplay(i.interviewTime)}: ${i.applicantName} (${i.position || 'Interview'})`).join('\n')
            : 'Open day (no interviews scheduled)';

          return (
            <div
              key={`${cell.dateStr}-${idx}`}
              onClick={() => {
                if (!isPast) onSelectDate(cell.dateStr);
              }}
              title={tooltip}
              style={{
                ...pickerStyles.cell,
                ...(cell.isCurrentMonth ? {} : pickerStyles.cellOtherMonth),
                ...(isPast ? pickerStyles.cellPast : {}),
                ...(isSelected ? pickerStyles.cellSelected : {}),
                ...(isToday ? pickerStyles.cellToday : {}),
              }}
            >
              <div style={pickerStyles.cellTop}>
                <span style={{
                  ...pickerStyles.cellNumber,
                  ...(isToday ? pickerStyles.cellNumberToday : {}),
                  ...(isSelected ? pickerStyles.cellNumberSelected : {}),
                }}>
                  {cell.dayNum}
                </span>

                {hasBookings ? (
                  <span style={pickerStyles.bookedBadge} title={tooltip}>
                    {dayInterviews.length}
                  </span>
                ) : cell.isCurrentMonth ? (
                  <span style={pickerStyles.openDot} title="Available day" />
                ) : null}
              </div>

              {/* Mini chip preview of who is scheduled */}
              {hasBookings && (
                <div style={pickerStyles.cellMiniChips}>
                  {dayInterviews.slice(0, 2).map((item) => (
                    <div key={item.id} style={pickerStyles.miniChip} title={`${item.applicantName} (${formatTimeDisplay(item.interviewTime)})`}>
                      <span style={pickerStyles.miniChipTime}>{formatTimeDisplay(item.interviewTime)}</span>
                      <span style={pickerStyles.miniChipName}>{item.applicantName}</span>
                    </div>
                  ))}
                  {dayInterviews.length > 2 && (
                    <span style={pickerStyles.miniMoreText}>+{dayInterviews.length - 2} more</span>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* 4. Selected Day Panel: Who is Scheduled & Available Times */}
      <div style={pickerStyles.dayDetailCard}>
        <div style={pickerStyles.dayDetailHeader}>
          <div style={pickerStyles.selectedDateInfo}>
            <span style={pickerStyles.selectedDateLabel}>Selected Interview Date</span>
            <span style={pickerStyles.selectedDateValue}>
              {selectedDate
                ? new Date(`${selectedDate}T00:00:00`).toLocaleDateString('en-US', {
                    weekday: 'long',
                    month: 'long',
                    day: 'numeric',
                    year: 'numeric'
                  })
                : 'Please select a date on the calendar above'}
            </span>
          </div>

          {selectedDate && (
            <div style={pickerStyles.dateStatusPill}>
              {selectedDateInterviews.length === 0 ? (
                <span style={pickerStyles.statusPillOpen}>Entire Day Open</span>
              ) : (
                <span style={pickerStyles.statusPillBusy}>
                  👥 {selectedDateInterviews.length} Scheduled {selectedDateInterviews.length === 1 ? 'Candidate' : 'Candidates'}
                </span>
              )}
            </div>
          )}
        </div>

        {/* List of who is already scheduled on this day */}
        {selectedDate && selectedDateInterviews.length > 0 && (
          <div style={pickerStyles.whoIsScheduledBox}>
            <div style={pickerStyles.whoIsScheduledTitle}>
              <span>Already Scheduled on this Date:</span>
            </div>
            <div style={pickerStyles.whoIsScheduledList}>
              {selectedDateInterviews.map((item) => (
                <div key={item.id} style={pickerStyles.whoRow}>
                  <span style={pickerStyles.whoTimeBadge}>{formatTimeDisplay(item.interviewTime)}</span>
                  <div style={pickerStyles.whoInfo}>
                    <strong style={pickerStyles.whoName}>{item.applicantName}</strong>
                    <span style={pickerStyles.whoMeta}>
                      {item.position && `Position: ${item.position}`}
                      {item.interviewer && ` • Interviewer: ${item.interviewer}`}
                      {item.location && ` • Location: ${item.location}`}
                    </span>
                  </div>
                  <span style={pickerStyles.whoStatusChip}>{item.status || 'Scheduled'}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Time slot picker */}
        {selectedDate && (
          <div style={pickerStyles.timeSlotsSection}>
            <div style={pickerStyles.timeSlotsHeaderRow}>
              <label style={pickerStyles.timeSlotsTitle}>
                Available Times to Pick (30-min intervals) *
              </label>
              <span style={pickerStyles.timeSlotsHint}>
                Green = Available • Red = Occupied • Gray = Passed
              </span>
            </div>

            <div style={pickerStyles.timeSlotsGrid}>
              {STANDARD_TIME_SLOTS.map(slot => {
                const slotMins = parseTimeToMinutes(slot.time);
                const isPastTime = selectedDate === todayStr && slotMins !== null && slotMins <= nowInfo.minutes;
                const isPastDate = selectedDate && selectedDate < todayStr;
                const isTimePassed = isPastDate || isPastTime;

                const conflict = checkTimeConflict(slot.time);
                const isSelected = selectedTime === slot.time;
                const isAvailable = !conflict && !isTimePassed;

                let titleText = `Pick ${slot.label} (Available)`;
                if (isTimePassed) {
                  titleText = `Passed: ${slot.label} has already passed today`;
                } else if (conflict) {
                  titleText = `Booked: ${conflict.applicantName} (${formatTimeDisplay(conflict.interviewTime)})`;
                }

                return (
                  <button
                    key={slot.time}
                    type="button"
                    disabled={!isAvailable}
                    onClick={() => {
                      if (isAvailable) {
                        onSelectTime(slot.time);
                      }
                    }}
                    title={titleText}
                    style={{
                      ...pickerStyles.timeSlotBtn,
                      ...(isTimePassed ? pickerStyles.timeSlotBtnPast : {}),
                      ...(conflict ? pickerStyles.timeSlotBtnDisabled : {}),
                      ...(isSelected ? pickerStyles.timeSlotBtnSelected : {}),
                    }}
                  >
                    <span style={pickerStyles.slotIndicator}>
                      {isSelected ? '✓' : isTimePassed ? '⏱️' : isAvailable ? '🟢' : '🔴'}
                    </span>
                    <span style={{
                      ...pickerStyles.slotLabel,
                      ...(isTimePassed ? { textDecoration: 'line-through', opacity: 0.6 } : {})
                    }}>
                      {slot.label}
                    </span>
                    {conflict && (
                      <span style={pickerStyles.slotBookedBy}>
                        {conflict.applicantName}
                      </span>
                    )}
                    {isTimePassed && (
                      <span style={pickerStyles.slotPassedText}>
                        Passed
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Real-time conflict warning banner */}
        {currentConflict && (
          <div style={pickerStyles.conflictWarningBanner}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0 }}>
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
              <line x1="12" y1="9" x2="12" y2="13"></line>
              <line x1="12" y1="17" x2="12.01" y2="17"></line>
            </svg>
            <div>
              <strong>Time Slot Conflict!</strong> An interview is already scheduled on {selectedDate} at {formatTimeDisplay(currentConflict.interviewTime)} with <strong>{currentConflict.applicantName}</strong> ({currentConflict.position || 'Candidate'}). Please select an open time slot.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const pickerStyles = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: '14px',
    padding: '16px',
    borderRadius: '12px',
    background: 'var(--color-bg-card-hover, rgba(255, 255, 255, 0.03))',
    border: '1px solid var(--color-border)',
  },
  calendarHeaderBar: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: '10px',
  },
  monthHeading: {
    margin: 0,
    fontSize: '17px',
    fontWeight: '700',
    color: 'var(--color-text-primary)',
    letterSpacing: '-0.3px',
  },
  hintText: {
    fontSize: '12px',
    color: 'var(--color-text-muted)',
  },
  navButtonsGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  navBtn: {
    padding: '5px 12px',
    borderRadius: '6px',
    border: '1px solid var(--color-border)',
    background: 'var(--color-bg-card)',
    color: 'var(--color-text-primary)',
    fontSize: '12px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },
  todayBtn: {
    padding: '5px 12px',
    borderRadius: '6px',
    border: '1px solid var(--color-primary)',
    background: 'var(--color-primary-light, rgba(79, 70, 229, 0.12))',
    color: 'var(--color-primary)',
    fontSize: '12px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },
  daysOfWeekHeader: {
    display: 'grid',
    gridTemplateColumns: 'repeat(7, 1fr)',
    gap: '6px',
    textAlign: 'center',
  },
  dayColLabel: {
    fontSize: '11px',
    fontWeight: '700',
    color: 'var(--color-text-secondary)',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    padding: '4px 0',
  },
  monthGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(7, 1fr)',
    gap: '6px',
  },
  cell: {
    minHeight: '68px',
    padding: '6px',
    borderRadius: '8px',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-border)',
    background: 'var(--color-bg-card)',
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
    overflow: 'hidden',
  },
  cellOtherMonth: {
    opacity: 0.35,
    background: 'transparent',
  },
  cellPast: {
    opacity: 0.35,
    cursor: 'not-allowed',
  },
  cellToday: {
    borderColor: 'var(--color-primary)',
  },
  cellSelected: {
    borderColor: 'var(--color-primary)',
    boxShadow: '0 0 0 2px var(--color-primary)',
    background: 'var(--color-primary-light, rgba(79, 70, 229, 0.15))',
  },
  cellTop: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cellNumber: {
    fontSize: '12px',
    fontWeight: '600',
    color: 'var(--color-text-primary)',
    width: '20px',
    height: '20px',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: '4px',
  },
  cellNumberToday: {
    background: 'var(--color-primary)',
    color: '#ffffff',
    fontWeight: '700',
  },
  cellNumberSelected: {
    color: 'var(--color-primary)',
    fontWeight: '700',
  },
  bookedBadge: {
    fontSize: '10px',
    fontWeight: '700',
    padding: '1px 5px',
    borderRadius: '8px',
    background: 'rgba(239, 68, 68, 0.18)',
    color: 'var(--color-danger, #ef4444)',
    border: '1px solid rgba(239, 68, 68, 0.3)',
  },
  openDot: {
    width: '6px',
    height: '6px',
    borderRadius: '50%',
    background: 'rgba(16, 185, 129, 0.5)',
  },
  cellMiniChips: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
    overflow: 'hidden',
  },
  miniChip: {
    display: 'flex',
    alignItems: 'center',
    gap: '3px',
    fontSize: '9px',
    padding: '1px 3px',
    borderRadius: '3px',
    background: 'rgba(59, 130, 246, 0.12)',
    borderLeft: '2px solid var(--color-primary, #3b82f6)',
    color: 'var(--color-text-primary)',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  miniChipTime: {
    fontWeight: '700',
    fontSize: '8px',
    opacity: 0.9,
  },
  miniChipName: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  miniMoreText: {
    fontSize: '9px',
    color: 'var(--color-text-muted)',
    textAlign: 'center',
  },
  dayDetailCard: {
    display: 'flex',
    flexDirection: 'column',
    gap: '14px',
    padding: '16px',
    borderRadius: '10px',
    border: '1px solid var(--color-border)',
    background: 'var(--color-bg-card)',
  },
  dayDetailHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: '10px',
    paddingBottom: '12px',
    borderBottom: '1px solid var(--color-border)',
  },
  selectedDateInfo: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  selectedDateLabel: {
    fontSize: '11px',
    fontWeight: '700',
    color: 'var(--color-text-muted)',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  selectedDateValue: {
    fontSize: '16px',
    fontWeight: '700',
    color: 'var(--color-text-primary)',
  },
  dateStatusPill: {
    display: 'flex',
    alignItems: 'center',
  },
  statusPillOpen: {
    fontSize: '12px',
    fontWeight: '600',
    padding: '4px 10px',
    borderRadius: '20px',
    background: 'rgba(16, 185, 129, 0.15)',
    color: '#10b981',
    border: '1px solid rgba(16, 185, 129, 0.3)',
  },
  statusPillBusy: {
    fontSize: '12px',
    fontWeight: '600',
    padding: '4px 10px',
    borderRadius: '20px',
    background: 'rgba(239, 68, 68, 0.12)',
    color: '#ef4444',
    border: '1px solid rgba(239, 68, 68, 0.25)',
  },
  whoIsScheduledBox: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    padding: '12px',
    borderRadius: '8px',
    background: 'var(--color-bg-root, rgba(0,0,0,0.2))',
    border: '1px solid var(--color-border)',
  },
  whoIsScheduledTitle: {
    fontSize: '12px',
    fontWeight: '700',
    color: 'var(--color-text-secondary)',
    textTransform: 'uppercase',
    letterSpacing: '0.4px',
  },
  whoIsScheduledList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  whoRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '6px 10px',
    borderRadius: '6px',
    background: 'var(--color-bg-card)',
    border: '1px solid var(--color-border)',
    flexWrap: 'wrap',
  },
  whoTimeBadge: {
    fontSize: '12px',
    fontWeight: '700',
    color: 'var(--color-primary)',
    padding: '2px 8px',
    borderRadius: '4px',
    background: 'var(--color-primary-light, rgba(79, 70, 229, 0.12))',
  },
  whoInfo: {
    display: 'flex',
    flexDirection: 'column',
    flex: 1,
    gap: '2px',
    minWidth: '180px',
  },
  whoName: {
    fontSize: '13px',
    color: 'var(--color-text-primary)',
  },
  whoMeta: {
    fontSize: '11px',
    color: 'var(--color-text-muted)',
  },
  whoStatusChip: {
    fontSize: '11px',
    fontWeight: '600',
    color: 'var(--color-warning, #f59e0b)',
    padding: '2px 8px',
    borderRadius: '10px',
    background: 'rgba(245, 158, 11, 0.12)',
  },
  timeSlotsSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  },
  timeSlotsHeaderRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: '8px',
  },
  timeSlotsTitle: {
    fontSize: '13px',
    fontWeight: '700',
    color: 'var(--color-text-primary)',
    margin: 0,
  },
  timeSlotsHint: {
    fontSize: '11px',
    color: 'var(--color-text-muted)',
  },
  timeSlotsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))',
    gap: '8px',
  },
  timeSlotBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '6px',
    padding: '8px 10px',
    borderRadius: '8px',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-border)',
    background: 'var(--color-bg-root)',
    color: 'var(--color-text-primary)',
    fontSize: '12px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },
  timeSlotBtnSelected: {
    background: 'var(--color-primary)',
    color: '#ffffff',
    borderColor: 'var(--color-primary)',
    boxShadow: '0 2px 8px rgba(79, 70, 229, 0.35)',
  },
  timeSlotBtnDisabled: {
    background: 'rgba(239, 68, 68, 0.08)',
    borderColor: 'rgba(239, 68, 68, 0.25)',
    color: 'var(--color-text-muted)',
    cursor: 'not-allowed',
    opacity: 0.65,
  },
  timeSlotBtnPast: {
    background: 'rgba(255, 255, 255, 0.02)',
    borderColor: 'rgba(255, 255, 255, 0.07)',
    color: 'var(--color-text-muted)',
    cursor: 'not-allowed',
    opacity: 0.45,
  },
  slotPassedText: {
    fontSize: '9px',
    color: 'var(--color-text-muted)',
    fontWeight: '600',
    padding: '1px 5px',
    borderRadius: '4px',
    background: 'rgba(255, 255, 255, 0.06)',
    letterSpacing: '0.3px',
  },
  slotIndicator: {
    fontSize: '10px',
  },
  slotLabel: {
    whiteSpace: 'nowrap',
  },
  slotBookedBy: {
    fontSize: '10px',
    color: 'var(--color-danger, #ef4444)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    maxWidth: '55px',
  },
  conflictWarningBanner: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '10px',
    padding: '12px 14px',
    borderRadius: '8px',
    background: 'rgba(239, 68, 68, 0.12)',
    color: 'var(--color-danger, #ef4444)',
    border: '1px solid rgba(239, 68, 68, 0.35)',
    fontSize: '13px',
    lineHeight: '1.45',
  },
};
