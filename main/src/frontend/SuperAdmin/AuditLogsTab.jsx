import React, { useState, useEffect } from 'react';

export default function AuditLogsTab() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [actionFilter, setActionFilter] = useState('All');
  const [roleFilter, setRoleFilter] = useState('All');
  const [dateFilter, setDateFilter] = useState('All');

  // Mock data for now (frontend only)
  useEffect(() => {
    loadLogs();
  }, []);

  const loadLogs = () => {
    // Mock data - replace with actual API call when backend is ready
    // Super Admin should see ALL actions across the system
    setLogs([
      {
        id: 1,
        action: 'CREATE_ADMIN',
        actor: 'Super Admin',
        actor_role: 'Super Admin',
        target: 'John Doe (Admin)',
        target_role: 'Admin',
        details: 'Created new admin account for John Doe at Main Branch',
        timestamp: '2024-08-22 14:30:25',
      },
      {
        id: 2,
        action: 'UPDATE_BRANCH',
        actor: 'Super Admin',
        actor_role: 'Super Admin',
        target: 'North Branch',
        target_role: 'Branch',
        details: 'Updated branch manager to Jane Smith',
        timestamp: '2024-08-22 13:15:10',
      },
      {
        id: 3,
        action: 'DEACTIVATE_ACCOUNT',
        actor: 'Super Admin',
        actor_role: 'Super Admin',
        target: 'Michael Wilson (Employee)',
        target_role: 'Employee',
        details: 'Deactivated employee account',
        timestamp: '2024-08-22 11:45:30',
      },
      {
        id: 4,
        action: 'CREATE_BRANCH',
        actor: 'Super Admin',
        actor_role: 'Super Admin',
        target: 'South Branch',
        target_role: 'Branch',
        details: 'Created new branch at Makati',
        timestamp: '2024-08-22 10:20:15',
      },
      {
        id: 5,
        action: 'DELETE_ADMIN',
        actor: 'Super Admin',
        actor_role: 'Super Admin',
        target: 'Sarah Brown (Admin)',
        target_role: 'Admin',
        details: 'Deleted admin account',
        timestamp: '2024-08-21 16:30:45',
      },
      {
        id: 6,
        action: 'UPDATE_ACCOUNT',
        actor: 'Admin',
        actor_role: 'Admin',
        target: 'Robert Johnson (Employee)',
        target_role: 'Employee',
        details: 'Updated employee role to Resource Manager',
        timestamp: '2024-08-21 14:20:30',
      },
      {
        id: 7,
        action: 'LOGIN',
        actor: 'Jane Smith',
        actor_role: 'HR',
        target: 'System',
        target_role: 'N/A',
        details: 'User logged in successfully',
        timestamp: '2024-08-21 09:00:00',
      },
      {
        id: 8,
        action: 'ACTIVATE_ACCOUNT',
        actor: 'Super Admin',
        actor_role: 'Super Admin',
        target: 'Emily Davis (Project Manager)',
        target_role: 'Project Manager',
        details: 'Activated project manager account',
        timestamp: '2024-08-20 15:45:20',
      },
    ]);
  };

  const getActionColor = (action) => {
    const colors = {
      'CREATE_ADMIN': '#22c55e',
      'UPDATE_BRANCH': '#3b82f6',
      'DEACTIVATE_ACCOUNT': '#f59e0b',
      'CREATE_BRANCH': '#22c55e',
      'DELETE_ADMIN': '#ef4444',
      'UPDATE_ACCOUNT': '#3b82f6',
      'LOGIN': '#8b5cf6',
      'ACTIVATE_ACCOUNT': '#22c55e',
    };
    return colors[action] || '#6b7280';
  };

  const getActionIcon = (action) => {
    const style = { marginRight: '6px', verticalAlign: 'middle', display: 'inline-block' };
    const icons = {
      'CREATE_ADMIN': (
        <svg style={style} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <line x1="12" y1="5" x2="12" y2="19"></line>
          <line x1="5" y1="12" x2="19" y2="12"></line>
        </svg>
      ),
      'UPDATE_BRANCH': (
        <svg style={style} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
        </svg>
      ),
      'DEACTIVATE_ACCOUNT': (
        <svg style={style} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
          <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
        </svg>
      ),
      'CREATE_BRANCH': (
        <svg style={style} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <rect x="4" y="2" width="16" height="20" rx="2" ry="2"></rect>
          <line x1="9" y1="22" x2="9" y2="16"></line>
          <line x1="15" y1="22" x2="15" y2="16"></line>
          <line x1="9" y1="16" x2="15" y2="16"></line>
          <path d="M8 6h2v2H8V6zm4 0h2v2h-2V6zm4 0h2v2h-2V6zM8 10h2v2H8v-2zm4 0h2v2h-2v-2zm4 0h2v2h-2v-2z"></path>
        </svg>
      ),
      'DELETE_ADMIN': (
        <svg style={style} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <polyline points="3 6 5 6 21 6"></polyline>
          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2 2v2"></path>
          <line x1="10" y1="11" x2="10" y2="17"></line>
          <line x1="14" y1="11" x2="14" y2="17"></line>
        </svg>
      ),
      'UPDATE_ACCOUNT': (
        <svg style={style} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
        </svg>
      ),
      'LOGIN': (
        <svg style={style} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"></path>
        </svg>
      ),
      'ACTIVATE_ACCOUNT': (
        <svg style={style} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
          <path d="M7 11V7a5 5 0 0 1 9.9-1"></path>
        </svg>
      ),
    };
    return icons[action] || (
      <svg style={style} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
        <polyline points="14 2 14 8 20 8"></polyline>
        <line x1="16" y1="13" x2="8" y2="13"></line>
        <line x1="16" y1="17" x2="8" y2="17"></line>
        <polyline points="10 9 9 9 8 9"></polyline>
      </svg>
    );
  };

  const filteredLogs = logs.filter(log => {
    const matchesSearch =
      log.action.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.actor.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.target.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.details.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesAction = actionFilter === 'All' || log.action === actionFilter;
    const matchesRole = roleFilter === 'All' || log.actor_role === roleFilter;

    let matchesDate = true;
    if (dateFilter !== 'All') {
      const logDate = new Date(log.timestamp);
      const today = new Date();
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      const weekAgo = new Date(today);
      weekAgo.setDate(weekAgo.getDate() - 7);

      if (dateFilter === 'Today') {
        matchesDate = logDate.toDateString() === today.toDateString();
      } else if (dateFilter === 'Yesterday') {
        matchesDate = logDate.toDateString() === yesterday.toDateString();
      } else if (dateFilter === 'Last 7 Days') {
        matchesDate = logDate >= weekAgo;
      }
    }

    return matchesSearch && matchesAction && matchesRole && matchesDate;
  });

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h1 style={styles.title}>Audit Logs</h1>
        <p style={styles.subtitle}>Track all system activities and changes across all roles</p>
      </div>

      <div style={styles.stats}>
        <div style={styles.statCard}>
          <span style={styles.statLabel}>Total Logs</span>
          <span style={styles.statValue}>{logs.length}</span>
        </div>
        <div style={styles.statCard}>
          <span style={styles.statLabel}>Today</span>
          <span style={styles.statValue}>
            {logs.filter(log => {
              const logDate = new Date(log.timestamp);
              const today = new Date();
              return logDate.toDateString() === today.toDateString();
            }).length}
          </span>
        </div>
        <div style={styles.statCard}>
          <span style={styles.statLabel}>This Week</span>
          <span style={styles.statValue}>
            {logs.filter(log => {
              const logDate = new Date(log.timestamp);
              const weekAgo = new Date();
              weekAgo.setDate(weekAgo.getDate() - 7);
              return logDate >= weekAgo;
            }).length}
          </span>
        </div>
      </div>

      <div style={styles.controls}>
        <div style={styles.searchWrapper}>
          <svg style={styles.searchIcon} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          </svg>
          <input
            type="text"
            placeholder="Search logs..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={styles.searchInput}
          />
        </div>
        <select
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value)}
          style={styles.filterSelect}
        >
          <option value="All">All Actions</option>
          <option value="CREATE_ADMIN">Create Admin</option>
          <option value="UPDATE_BRANCH">Update Branch</option>
          <option value="DEACTIVATE_ACCOUNT">Deactivate Account</option>
          <option value="CREATE_BRANCH">Create Branch</option>
          <option value="DELETE_ADMIN">Delete Admin</option>
          <option value="UPDATE_ACCOUNT">Update Account</option>
          <option value="LOGIN">Login</option>
          <option value="ACTIVATE_ACCOUNT">Activate Account</option>
        </select>
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          style={styles.filterSelect}
        >
          <option value="All">All Roles</option>
          <option value="Super Admin">Super Admin</option>
          <option value="Admin">Admin</option>
          <option value="HR">HR</option>
          <option value="Resource Manager">Resource Manager</option>
          <option value="Project Manager">Project Manager</option>
          <option value="Employee">Employee</option>
        </select>
        <select
          value={dateFilter}
          onChange={(e) => setDateFilter(e.target.value)}
          style={styles.filterSelect}
        >
          <option value="All">All Time</option>
          <option value="Today">Today</option>
          <option value="Yesterday">Yesterday</option>
          <option value="Last 7 Days">Last 7 Days</option>
        </select>
      </div>

      <div style={styles.tableContainer}>
        <table style={styles.table}>
          <thead>
            <tr style={styles.tableHeader}>
              <th style={styles.tableHeaderCell}>Timestamp</th>
              <th style={styles.tableHeaderCell}>Action</th>
              <th style={styles.tableHeaderCell}>Actor</th>
              <th style={styles.tableHeaderCell}>Target</th>
              <th style={styles.tableHeaderCell}>Details</th>
            </tr>
          </thead>
          <tbody>
            {filteredLogs.length === 0 ? (
              <tr>
                <td colSpan="5" style={styles.emptyCell}>
                  No audit logs found
                </td>
              </tr>
            ) : (
              filteredLogs.map(log => (
                <tr key={log.id} style={styles.tableRow}>
                  <td style={styles.tableCell}>
                    <span style={styles.timestamp}>{log.timestamp}</span>
                  </td>
                  <td style={styles.tableCell}>
                    <span style={{
                      ...styles.actionBadge,
                      color: getActionColor(log.action),
                      backgroundColor: `${getActionColor(log.action)}15`,
                    }}>
                      {getActionIcon(log.action)} {log.action.replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td style={styles.tableCell}>
                    <div style={styles.actorCell}>
                      <span style={styles.actorName}>{log.actor}</span>
                      <span style={styles.actorRole}>{log.actor_role}</span>
                    </div>
                  </td>
                  <td style={styles.tableCell}>
                    <div style={styles.targetCell}>
                      <span style={styles.targetName}>{log.target}</span>
                      <span style={styles.targetRole}>{log.target_role}</span>
                    </div>
                  </td>
                  <td style={styles.tableCell}>
                    <span style={styles.details}>{log.details}</span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: '24px',
  },
  header: {
    marginBottom: '8px',
  },
  title: {
    fontSize: '28px',
    fontWeight: '800',
    letterSpacing: '-0.75px',
    marginBottom: '4px',
    color: 'var(--color-text-primary)',
  },
  subtitle: {
    fontSize: '14px',
    color: 'var(--color-text-secondary)',
  },
  controls: {
    display: 'flex',
    gap: '12px',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  searchWrapper: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    background: 'var(--color-bg-card)',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-md)',
    padding: '8px 12px',
    flex: 1,
    maxWidth: '400px',
  },
  searchIcon: {
    color: 'var(--color-text-muted)',
  },
  searchInput: {
    border: 'none',
    background: 'transparent',
    outline: 'none',
    flex: 1,
    fontSize: '14px',
    color: 'var(--color-text-primary)',
  },
  filterSelect: {
    padding: '8px 12px',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-md)',
    fontSize: '14px',
    background: 'var(--color-bg-card)',
    color: 'var(--color-text-primary)',
    outline: 'none',
  },
  tableContainer: {
    background: 'var(--color-bg-card)',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-md)',
    overflow: 'hidden',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
  },
  tableHeader: {
    background: 'var(--color-bg-card-hover)',
  },
  tableHeaderCell: {
    padding: '12px 16px',
    textAlign: 'left',
    fontSize: '12px',
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    color: 'var(--color-text-secondary)',
    borderBottom: '1px solid var(--color-border)',
  },
  tableRow: {
    borderBottom: '1px solid var(--color-border)',
    transition: 'background-color 0.2s',
  },
  tableCell: {
    padding: '12px 16px',
    fontSize: '14px',
    color: 'var(--color-text-primary)',
  },
  timestamp: {
    fontFamily: 'monospace',
    fontSize: '13px',
    color: 'var(--color-text-secondary)',
  },
  actionBadge: {
    padding: '4px 12px',
    borderRadius: '20px',
    fontSize: '11px',
    fontWeight: '600',
  },
  actorCell: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  actorName: {
    fontWeight: '600',
  },
  actorRole: {
    fontSize: '12px',
    color: 'var(--color-text-muted)',
  },
  targetCell: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  targetName: {
    fontWeight: '600',
  },
  targetRole: {
    fontSize: '12px',
    color: 'var(--color-text-muted)',
  },
  details: {
    maxWidth: '300px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  emptyCell: {
    padding: '32px',
    textAlign: 'center',
    color: 'var(--color-text-muted)',
    fontSize: '14px',
  },
  stats: {
    display: 'flex',
    gap: '16px',
  },
  statCard: {
    flex: 1,
    padding: '16px',
    background: 'var(--color-bg-card)',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-md)',
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  statLabel: {
    fontSize: '12px',
    color: 'var(--color-text-secondary)',
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  statValue: {
    fontSize: '24px',
    fontWeight: '700',
    color: 'var(--color-primary)',
  },
};
