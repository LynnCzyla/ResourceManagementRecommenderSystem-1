import React, { useState, useEffect } from 'react';
import hrClient from './Hrclient';


export default function HRDashboardTab() {
  const [stats, setStats] = useState({
    totalJobPostings: 0,
    activeJobPostings: 0,
    totalApplications: 0,
    pendingApplications: 0,
    recommendedForEmployment: 0,
    pendingResourceRequests: 0,
  });
  const [recentApplications, setRecentApplications] = useState([]);
  const [recentPostings, setRecentPostings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      setError(null);

      const [summaryRes, postingsRes, applicationsRes] = await Promise.all([
        hrClient.get(`/dashboard/summary`),
        hrClient.get(`/job-postings`),
        hrClient.get(`/applications`),
      ]);

      const summary = summaryRes.data?.data || {};
      const postings = postingsRes.data?.data || [];
      const applications = applicationsRes.data?.data || [];

      setStats({
        totalJobPostings: postings.length,
        activeJobPostings: summary.activeJobPostings || 0,
        totalApplications: applications.length,
        pendingApplications: summary.pendingApplications || 0,
        recommendedForEmployment: applications.filter(a => a.status === 'Recommended').length,
        // NOTE: no Resource Requests backend route was included in the uploaded backend,
        // so this stays at 0 until that endpoint exists. See HRResourceRequestsTab.jsx.
        pendingResourceRequests: 0,
      });

      setRecentApplications(
        applications.slice(0, 3).map(app => ({
          id: app.id,
          name: `${app.first_name} ${app.last_name}`,
          position: app.position_applied,
          status: app.status,
          date: app.applied_date,
        }))
      );

      setRecentPostings(
        postings.slice(0, 3).map(p => ({
          id: p.id,
          title: p.title,
          applications: p.applications || 0,
          status: p.status,
          date: p.posted_date,
        }))
      );
    } catch (err) {
      setError('Failed to load dashboard data');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div style={styles.container}>
        <div style={styles.loading}>Loading dashboard...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={styles.container}>
        <div style={styles.error}>{error}</div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h1 style={styles.title}>HR Dashboard</h1>
        <p style={styles.subtitle}>Overview of job postings, applications, and resource requests</p>
      </div>

      {/* Stats Grid */}
      <div style={styles.statsGrid}>
        <div className="glass-card" style={styles.statCard}>
          <div style={{ ...styles.iconWrapper, backgroundColor: 'rgba(16, 185, 129, 0.1)', color: 'var(--color-primary)' }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="2" y="7" width="20" height="14" rx="2"></rect>
              <path d="M16 7V5a2 2 0 0 0-4 0v2"></path>
            </svg>
          </div>
          <div>
            <div style={styles.statValue}>{stats.totalJobPostings}</div>
            <div style={styles.statLabel}>Total Job Postings</div>
          </div>
        </div>

        <div className="glass-card" style={styles.statCard}>
          <div style={{ ...styles.iconWrapper, backgroundColor: 'rgba(245, 158, 11, 0.1)', color: 'var(--color-warning)' }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
              <polyline points="14 2 14 8 20 8"></polyline>
              <line x1="16" y1="13" x2="8" y2="13"></line>
              <line x1="16" y1="17" x2="8" y2="17"></line>
            </svg>
          </div>
          <div>
            <div style={styles.statValue}>{stats.totalApplications}</div>
            <div style={styles.statLabel}>Total Applications</div>
          </div>
        </div>

        <div className="glass-card" style={styles.statCard}>
          <div style={{ ...styles.iconWrapper, backgroundColor: 'rgba(239, 68, 68, 0.1)', color: 'var(--color-danger)' }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"></circle>
              <polyline points="12 6 12 12 16 14"></polyline>
            </svg>
          </div>
          <div>
            <div style={styles.statValue}>{stats.pendingApplications}</div>
            <div style={styles.statLabel}>Pending Applications</div>
          </div>
        </div>

        <div className="glass-card" style={styles.statCard}>
          <div style={{ ...styles.iconWrapper, backgroundColor: 'rgba(59, 130, 246, 0.1)', color: 'var(--color-accent)' }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
              <circle cx="9" cy="7" r="4"></circle>
              <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
              <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
            </svg>
          </div>
          <div>
            <div style={styles.statValue}>{stats.recommendedForEmployment}</div>
            <div style={styles.statLabel}>Recommended for Employment</div>
          </div>
        </div>

        <div className="glass-card" style={styles.statCard}>
          <div style={{ ...styles.iconWrapper, backgroundColor: 'rgba(139, 92, 246, 0.1)', color: 'var(--color-primary)' }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="7 10 12 15 17 10"></polyline>
              <line x1="12" y1="15" x2="12" y2="3"></line>
            </svg>
          </div>
          <div>
            <div style={styles.statValue}>{stats.pendingResourceRequests}</div>
            <div style={styles.statLabel}>Pending Resource Requests</div>
          </div>
        </div>

        <div className="glass-card" style={styles.statCard}>
          <div style={{ ...styles.iconWrapper, backgroundColor: 'rgba(16, 185, 129, 0.1)', color: 'var(--color-success)' }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
              <polyline points="22 4 12 14.01 9 11.01"></polyline>
            </svg>
          </div>
          <div>
            <div style={styles.statValue}>{stats.activeJobPostings}</div>
            <div style={styles.statLabel}>Active Job Postings</div>
          </div>
        </div>
      </div>

      {/* Recent Activity Section */}
      <div style={styles.activitySection}>
        <div className="glass-card" style={styles.card}>
          <h3 style={styles.cardTitle}>Recent Applications</h3>
          <div style={styles.tableContainer}>
            <table style={styles.table}>
              <thead>
                <tr style={styles.tableHeader}>
                  <th style={styles.th}>Applicant</th>
                  <th style={styles.th}>Position</th>
                  <th style={styles.th}>Status</th>
                  <th style={styles.th}>Date</th>
                </tr>
              </thead>
              <tbody>
                {recentApplications.map(app => (
                  <tr key={app.id} style={styles.tableRow}>
                    <td style={styles.td}>{app.name}</td>
                    <td style={styles.td}>{app.position}</td>
                    <td style={styles.td}>
                      <span style={{
                        ...styles.statusBadge,
                        backgroundColor: app.status === 'Recommended' ? 'var(--color-primary-light)' : 
                                       app.status === 'Pending' ? 'var(--color-warning-light)' : 'var(--color-accent-light)',
                        color: app.status === 'Recommended' ? 'var(--color-primary)' : 
                               app.status === 'Pending' ? 'var(--color-warning)' : 'var(--color-accent)'
                      }}>
                        {app.status}
                      </span>
                    </td>
                    <td style={styles.td}>{app.date}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="glass-card" style={styles.card}>
          <h3 style={styles.cardTitle}>Recent Job Postings</h3>
          <div style={styles.tableContainer}>
            <table style={styles.table}>
              <thead>
                <tr style={styles.tableHeader}>
                  <th style={styles.th}>Position</th>
                  <th style={styles.th}>Applications</th>
                  <th style={styles.th}>Status</th>
                  <th style={styles.th}>Posted Date</th>
                </tr>
              </thead>
              <tbody>
                {recentPostings.map(posting => (
                  <tr key={posting.id} style={styles.tableRow}>
                    <td style={styles.td}>{posting.title}</td>
                    <td style={styles.td}>{posting.applications}</td>
                    <td style={styles.td}>
                      <span style={{
                        ...styles.statusBadge,
                        backgroundColor: 'var(--color-primary-light)',
                        color: 'var(--color-primary)'
                      }}>
                        {posting.status}
                      </span>
                    </td>
                    <td style={styles.td}>{posting.date}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

const styles = {
  container: {
    padding: '0',
  },
  loading: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    height: '400px',
    fontSize: '16px',
    color: 'var(--color-text-secondary)',
  },
  error: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    height: '400px',
    fontSize: '16px',
    color: 'var(--color-danger)',
  },
  header: {
    marginBottom: '32px',
  },
  title: {
    fontSize: '28px',
    fontWeight: '700',
    color: 'var(--color-text-primary)',
    marginBottom: '8px',
    letterSpacing: '-0.5px',
  },
  subtitle: {
    fontSize: '15px',
    color: 'var(--color-text-secondary)',
  },
  statsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
    gap: '20px',
    marginBottom: '32px',
  },
  statCard: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
    padding: '24px',
  },
  iconWrapper: {
    width: '48px',
    height: '48px',
    borderRadius: '12px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  statValue: {
    fontSize: '28px',
    fontWeight: '700',
    color: 'var(--color-text-primary)',
    marginBottom: '4px',
  },
  statLabel: {
    fontSize: '13px',
    color: 'var(--color-text-secondary)',
    fontWeight: '500',
  },
  activitySection: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(500px, 1fr))',
    gap: '20px',
  },
  card: {
    padding: '24px',
  },
  cardTitle: {
    fontSize: '18px',
    fontWeight: '600',
    color: 'var(--color-text-primary)',
    marginBottom: '16px',
  },
  tableContainer: {
    overflowX: 'auto',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
  },
  tableHeader: {
    borderBottom: '1px solid var(--color-border)',
  },
  th: {
    textAlign: 'left',
    padding: '12px 16px',
    fontSize: '12px',
    fontWeight: '600',
    color: 'var(--color-text-secondary)',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  tableRow: {
    borderBottom: '1px solid var(--color-border)',
  },
  td: {
    padding: '16px',
    fontSize: '14px',
    color: 'var(--color-text-primary)',
  },
  statusBadge: {
    padding: '4px 12px',
    borderRadius: '20px',
    fontSize: '12px',
    fontWeight: '600',
  },
};