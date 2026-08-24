import React, { useState, useEffect } from 'react';
import { fetchDashboard } from './Rmapi';
import RMAvatar from './RMAvatar';

const BAR_COLORS = [
  'var(--color-primary)',
  'var(--color-accent)',
  'var(--color-success)',
  'var(--color-warning)',
  'var(--color-danger)',
];

const HIRING_COLOR = {
  high: 'var(--color-danger)',
  medium: 'var(--color-warning)',
  low: 'var(--color-success)',
};

const HIRING_BG = {
  high: 'rgba(239, 68, 68, 0.1)',
  medium: 'rgba(245, 158, 11, 0.1)',
  low: 'var(--color-primary-light)',
};

export default function RMDashboardTab() {
  const [employees, setEmployees] = useState([]);
  const [totalEmployees, setTotalEmployees] = useState(0);
  const [activeProjectsCount, setActiveProjectsCount] = useState(0);
  const [workloadCounts, setWorkloadCounts] = useState({ available: 0, limited: 0, fullyLoaded: 0 });

  // ✅ Real Resource Analytics data (previously hardcoded)
  const [departmentUtilization, setDepartmentUtilization] = useState([]);
  const [workloadDistributionPct, setWorkloadDistributionPct] = useState({ available: 0, limited: 0, fullyLoaded: 0 });
  const [monthlyTrend, setMonthlyTrend] = useState([]);
  const [demandVsAvailableCapacity, setDemandVsAvailableCapacity] = useState([]);
  const [hiringNeed, setHiringNeed] = useState(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showReport, setShowReport] = useState(false);
  const [workloadFilter, setWorkloadFilter] = useState('All');
  const [hoveredIndex, setHoveredIndex] = useState(null);

  useEffect(() => {
    loadDashboard();
  }, []);

  const loadDashboard = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchDashboard();
      setEmployees(data.employees || []);
      setTotalEmployees(data.totalEmployees || 0);
      setActiveProjectsCount(data.activeProjectsCount || 0);
      setWorkloadCounts(data.workloadCounts || { available: 0, limited: 0, fullyLoaded: 0 });

      // ✅ Wire in real analytics data returned by /api/rm/dashboard
      setDepartmentUtilization(data.departmentUtilization || []);
      setWorkloadDistributionPct(data.workloadDistributionPct || { available: 0, limited: 0, fullyLoaded: 0 });
      setMonthlyTrend(data.monthlyTrend || []);
      setDemandVsAvailableCapacity(data.demandVsAvailableCapacity || []);
      setHiringNeed(data.hiringNeed || null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const filteredEmployees = employees.filter((emp) => {
    if (workloadFilter === 'All') return true;
    return emp.workloadStatus === workloadFilter;
  });

  // Role distribution for the report modal, computed from live data.
  const roleDistribution = employees.reduce((acc, emp) => {
    acc[emp.role] = (acc[emp.role] || 0) + 1;
    return acc;
  }, {});

  const handleGenerateReport = () => setShowReport(true);

  // Calculations for Resource Analytics Statistics
  const employeesOnly = employees.filter(
    (e) => (e.rawRole || '').trim().toLowerCase() === 'employee' || (e.role || '').trim().toLowerCase() === 'employee'
  );
  const hasEmployeesData = employeesOnly.length > 0;
  const activeEmployeesCount = employeesOnly.filter((e) => e.workloadStatus !== 'Available').length;
  
  // Workforce Utilization % based on workloadStatus weighting or average utilization rates
  const avgUtilization = hasEmployeesData
    ? Math.round(employeesOnly.reduce((sum, e) => sum + (e.utilizationRate || 0), 0) / employeesOnly.length)
    : 0;

  const availablePoolCount = employeesOnly.filter((e) => e.workloadStatus === 'Available').length;
  const fullyUtilizedCount = employeesOnly.filter((e) => e.workloadStatus === 'Fully Utilized').length;

  const getUtilizationStatus = (val) => {
    if (val < 60) return { label: 'Underutilized', color: 'var(--color-warning)', bg: 'rgba(245, 158, 11, 0.1)' };
    if (val < 80) return { label: 'Normal', color: 'var(--color-success)', bg: 'var(--color-primary-light)' };
    if (val < 95) return { label: 'High', color: 'var(--color-danger)', bg: 'rgba(239, 68, 68, 0.1)' };
    return { label: 'Fully Utilized', color: 'var(--color-danger)', bg: 'rgba(239, 68, 68, 0.2)' };
  };

  const utilizationStatus = getUtilizationStatus(avgUtilization);

  // Workload Demand vs. Workforce Capacity line chart data
  const allValues = demandVsAvailableCapacity.flatMap(d => [d.openDemand || 0, d.availableCapacity || 0]);
  const maxVal = allValues.length > 0 ? Math.max(...allValues) : 0;
  const minVal = allValues.length > 0 ? Math.min(...allValues) : 0;
  const yMin = 0;
  const yMax = Math.max(10, Math.ceil((maxVal + 2) / 5) * 5);

  const svgWidth = 500;
  const svgHeight = 220;
  const paddingLeft = 40;
  const paddingRight = 20;
  const paddingTop = 20;
  const paddingBottom = 40;
  
  const chartWidth = svgWidth - paddingLeft - paddingRight;
  const chartHeight = svgHeight - paddingTop - paddingBottom;
  
  const getX = (index) => paddingLeft + (index * chartWidth) / Math.max(1, demandVsAvailableCapacity.length - 1);
  const getY = (val) => {
    const range = yMax - yMin;
    const pct = range > 0 ? (val - yMin) / range : 0.5;
    return paddingTop + chartHeight - (pct * chartHeight);
  };

  const isNearRightEdge = (index) => {
    const pointX = getX(index);
    const tooltipWidth = 190; // matches minWidth: '180px' + margin
    return (svgWidth - pointX) < tooltipWidth;
  };

  const capacityPoints = demandVsAvailableCapacity.map((d, i) => `${getX(i)},${getY(d.availableCapacity)}`).join(' ');
  const demandPoints = demandVsAvailableCapacity.map((d, i) => `${getX(i)},${getY(d.openDemand)}`).join(' ');

  if (loading) {
    return <div style={styles.container}><p>Loading dashboard…</p></div>;
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h1 style={styles.title}>Capacity & Productivity Overview</h1>
        <p style={styles.subtitle}>Monitor workforce allocation, utilization metrics, and address resource bottlenecks.</p>
      </div>

      {error && (
        <div className="glass-card" style={{ padding: '12px 16px', color: 'var(--color-danger)' }}>
          Couldn't load dashboard data: {error}
        </div>
      )}

      {/* Overview Cards */}
      <div style={styles.cardGrid}>
        <div className="glass-card" style={styles.overviewCard}>
          <div style={{ ...styles.cardIconWrapper, backgroundColor: 'rgba(59, 130, 246, 0.1)', color: 'var(--color-primary)' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
              <circle cx="12" cy="7" r="4"></circle>
            </svg>
          </div>
          <div>
            <div style={styles.cardVal}>{totalEmployees}</div>
            <div style={styles.cardLabel}>Total Employees</div>
          </div>
        </div>

        <div className="glass-card" style={styles.overviewCard}>
          <div style={{ ...styles.cardIconWrapper, backgroundColor: 'rgba(139, 92, 246, 0.1)', color: '#8b5cf6' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
            </svg>
          </div>
          <div>
            <div style={styles.cardVal}>{activeProjectsCount}</div>
            <div style={styles.cardLabel}>Active Projects</div>
          </div>
        </div>

        <div className="glass-card" style={styles.overviewCard}>
          <div style={{ ...styles.cardIconWrapper, backgroundColor: 'rgba(16, 185, 129, 0.1)', color: 'var(--color-success)' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" fill="currentColor"></circle>
            </svg>
          </div>
          <div>
            <div style={styles.cardVal}>{workloadCounts.available}</div>
            <div style={styles.cardLabel}>Available</div>
          </div>
        </div>

        <div className="glass-card" style={styles.overviewCard}>
          <div style={{ ...styles.cardIconWrapper, backgroundColor: 'rgba(245, 158, 11, 0.1)', color: 'var(--color-warning)' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" fill="currentColor"></circle>
            </svg>
          </div>
          <div>
            <div style={styles.cardVal}>{workloadCounts.limited}</div>
            <div style={styles.cardLabel}>Limited Availability</div>
          </div>
        </div>

        <div className="glass-card" style={styles.overviewCard}>
          <div style={{ ...styles.cardIconWrapper, backgroundColor: 'rgba(239, 68, 68, 0.1)', color: 'var(--color-danger)' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" fill="currentColor"></circle>
            </svg>
          </div>
          <div>
            <div style={styles.cardVal}>{workloadCounts.fullyLoaded}</div>
            <div style={styles.cardLabel}>Fully Utilized</div>
          </div>
        </div>
      </div>

      {/* Main Grid */}
      <div style={styles.mainGrid}>
        {/* Employee Utilization Panel */}
        <div className="glass-card" style={styles.panel}>
          <div style={styles.panelHeader}>
            <h2 style={styles.panelTitle}>Employee Utilization & Workload</h2>
            <button onClick={handleGenerateReport} style={styles.reportBtn}>Generate Utilization Report</button>
          </div>

          <div style={styles.filterRow}>
            <label style={styles.filterLabel}>Filter by workload:</label>
            <select
              value={workloadFilter}
              onChange={(e) => setWorkloadFilter(e.target.value)}
              style={styles.selectFilterCompact}
            >
              <option value="All">All</option>
              <option value="Available">Available</option>
              <option value="Limited Availability">Limited Availability</option>
              <option value="Fully Utilized">Fully Utilized</option>
            </select>
          </div>

          <div style={styles.tableWrapper}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Employee</th>
                  <th style={styles.th}>Role/Position</th>
                  <th style={styles.th}>Task</th>
                  <th style={styles.th}>Workload Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredEmployees.length === 0 ? (
                  <tr>
                    <td style={styles.td} colSpan={4}>No employees match this filter.</td>
                  </tr>
                ) : (
                  filteredEmployees.map((emp) => {
                    const statusColor =
                      emp.workloadStatus === 'Available' ? 'var(--color-success)' :
                      emp.workloadStatus === 'Limited Availability' ? 'var(--color-warning)' :
                      'var(--color-danger)';
                    const statusBg =
                      emp.workloadStatus === 'Available' ? 'var(--color-primary-light)' :
                      emp.workloadStatus === 'Limited Availability' ? 'rgba(245, 158, 11, 0.1)' :
                      'rgba(239, 68, 68, 0.1)';
                    const taskAssigned = emp.taskStatus === 'Assigned';
                    const taskColor = taskAssigned ? 'var(--color-success)' : 'var(--color-text-muted)';
                    const taskBg = taskAssigned ? 'var(--color-primary-light)' : 'rgba(100, 116, 139, 0.12)';
                    const roleLabel = emp.role || 'Employee';
                    return (
                      <tr key={emp.id} style={styles.tr}>
                        <td style={styles.td}>
                          <div style={styles.empInfo}>
                            <RMAvatar name={emp.name} src={emp.avatar} size={36} />
                            <div>
                              <div style={styles.empName}>{emp.name}</div>
                              <div style={styles.empEmail}>{emp.employeeId && emp.employeeId.trim() ? emp.employeeId : 'No ID on file'}</div>
                            </div>
                          </div>
                        </td>
                        <td style={styles.td}>
                          <span style={styles.roleBadge}>{roleLabel}</span>
                        </td>
                        <td style={styles.td}>
                          <span style={{ ...styles.statusBadge, color: taskColor, backgroundColor: taskBg }}>
                            {emp.taskStatus}
                          </span>
                        </td>
                        <td style={styles.td}>
                          <span style={{ ...styles.statusBadge, color: statusColor, backgroundColor: statusBg }}>
                            {emp.workloadStatus}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Data Analytics Panel */}
        <div className="glass-card" style={styles.panel}>
          <div style={styles.panelHeader}>
            <h2 style={styles.panelTitle}>Resource Analytics</h2>
          </div>

          {/* 1. Workforce Utilization Card */}
          <div style={styles.analyticsSection}>
            <h3 style={styles.analyticsTitle}>Workforce Utilization</h3>
            {!hasEmployeesData ? (
              <div style={styles.insufficientDataCard}>
                <span style={styles.insufficientDataText}>Insufficient data</span>
                <span style={styles.insufficientDataSubtext}>Add active employees to view utilization metrics.</span>
              </div>
            ) : (
              <div style={styles.metricCard}>
                <div style={styles.metricHeader}>
                  <span style={styles.metricVal}>{avgUtilization}%</span>
                  <span style={{
                    ...styles.metricBadge,
                    color: utilizationStatus.color,
                    backgroundColor: utilizationStatus.bg
                  }}>
                    {utilizationStatus.label}
                  </span>
                </div>
                <div style={styles.progressContainer}>
                  <div style={{
                    ...styles.progressBar,
                    width: `${avgUtilization}%`,
                    backgroundColor: utilizationStatus.color
                  }}></div>
                </div>
                <div style={styles.metricBreakdown}>
                  <div style={styles.breakdownItem}>
                    <span style={styles.breakdownLabel}>Assigned Employees</span>
                    <span style={styles.breakdownVal}>{activeEmployeesCount}</span>
                  </div>
                  <div style={styles.breakdownItem}>
                    <span style={styles.breakdownLabel}>Available Pool</span>
                    <span style={styles.breakdownVal}>{availablePoolCount}</span>
                  </div>
                  <div style={styles.breakdownItem}>
                    <span style={styles.breakdownLabel}>Fully Utilized</span>
                    <span style={styles.breakdownVal}>{fullyUtilizedCount}</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* 2. Workload Demand vs. Capacity Card (Line Chart) */}
          <div style={styles.analyticsSection}>
            <h3 style={styles.analyticsTitle}>Workload Demand vs. Capacity</h3>
            {demandVsAvailableCapacity.length === 0 ? (
              <div style={styles.insufficientDataCard}>
                <span style={styles.insufficientDataText}>Insufficient data</span>
                <span style={styles.insufficientDataSubtext}>No historical demand/capacity data available.</span>
              </div>
            ) : (
              <div style={styles.metricCard}>
                <div style={styles.chartTitleRow}>
                  <span style={styles.chartTitle}>Open Demand vs. Available Capacity</span>
                  <span style={styles.chartSubtitle}>Comparison of cumulative unfulfilled requests vs. currently available employees over time.</span>
                </div>
                
                 <div style={styles.chartWrapper}>
                  <svg viewBox={`0 0 ${svgWidth} ${svgHeight}`} width="100%" height="auto" style={{ display: 'block' }}>
                    {/* Horizontal gridlines */}
                    {[0, 0.25, 0.5, 0.75, 1.0].map((ratio, index) => {
                      const val = yMin + ratio * (yMax - yMin);
                      const y = getY(val);
                      return (
                        <g key={index}>
                          <line
                            x1={paddingLeft}
                            y1={y}
                            x2={paddingLeft + chartWidth}
                            y2={y}
                            stroke="rgba(255, 255, 255, 0.08)"
                            strokeWidth="1"
                            strokeDasharray="4 4"
                          />
                          <text
                            x={paddingLeft - 10}
                            y={y + 3}
                            fill="var(--color-text-muted)"
                            fontSize="10"
                            textAnchor="end"
                            fontFamily="inherit"
                          >
                            {Math.round(val)}
                          </text>
                        </g>
                      );
                    })}

                    {/* Vertical guideline on hover */}
                    {hoveredIndex !== null && (
                      <line
                        x1={getX(hoveredIndex)}
                        y1={paddingTop}
                        x2={getX(hoveredIndex)}
                        y2={paddingTop + chartHeight}
                        stroke="rgba(255, 255, 255, 0.15)"
                        strokeWidth="1.5"
                      />
                    )}

                    {/* Capacity Line (Green) */}
                    <polyline
                      fill="none"
                      stroke="#22c55e"
                      strokeWidth="2"
                      points={capacityPoints}
                    />
                    {/* Capacity Markers (Green dots) */}
                    {demandVsAvailableCapacity.map((d, i) => (
                      <circle
                        key={`cap-${i}`}
                        cx={getX(i)}
                        cy={getY(d.availableCapacity)}
                        r={hoveredIndex === i ? "6" : "4"}
                        fill="#22c55e"
                        stroke="var(--color-bg-card)"
                        strokeWidth="1.5"
                      />
                    ))}

                    {/* Demand Line (Blue) */}
                    <polyline
                      fill="none"
                      stroke="#3b82f6"
                      strokeWidth="2"
                      points={demandPoints}
                    />
                    {/* Demand Markers (Blue dots) */}
                    {demandVsAvailableCapacity.map((d, i) => (
                      <circle
                        key={`dem-${i}`}
                        cx={getX(i)}
                        cy={getY(d.openDemand)}
                        r={hoveredIndex === i ? "6" : "4"}
                        fill="#3b82f6"
                        stroke="var(--color-bg-card)"
                        strokeWidth="1.5"
                      />
                    ))}

                    {/* X-axis Month Labels */}
                    {demandVsAvailableCapacity.map((d, i) => (
                      <text
                        key={`month-${i}`}
                        x={getX(i)}
                        y={svgHeight - 15}
                        fill="var(--color-text-muted)"
                        fontSize="10"
                        textAnchor="middle"
                        fontFamily="inherit"
                      >
                        {d.month}
                      </text>
                    ))}

                    {/* Invisible Vertical rectangles for month hover slices */}
                    {demandVsAvailableCapacity.map((d, i) => {
                      const x = getX(i);
                      const colWidth = chartWidth / Math.max(1, demandVsAvailableCapacity.length - 1);
                      return (
                        <rect
                          key={`hover-rect-${i}`}
                          x={x - colWidth / 2}
                          y={paddingTop}
                          width={colWidth}
                          height={chartHeight}
                          fill="transparent"
                          style={{ cursor: 'pointer' }}
                          onMouseEnter={() => setHoveredIndex(i)}
                          onMouseLeave={() => setHoveredIndex(null)}
                        />
                      );
                    })}
                  </svg>

                  {/* Hover Tooltip Card */}
                  {hoveredIndex !== null && (() => {
                    const hoveredData = demandVsAvailableCapacity[hoveredIndex];
                    return (
                      <div
                        style={{
                          position: 'absolute',
                          left: `${(getX(hoveredIndex) / svgWidth) * 100}%`,
                          top: `${(getY((hoveredData.openDemand + hoveredData.availableCapacity) / 2) / svgHeight) * 100}%`,
                          transform: isNearRightEdge(hoveredIndex) 
                            ? 'translate(calc(-100% - 12px), -30%)' 
                            : 'translate(12px, -30%)',
                          pointerEvents: 'none',
                          backgroundColor: '#ffffff',
                          color: '#1f2937',
                          borderRadius: '8px',
                          padding: '12px 16px',
                          boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
                          border: '1px solid rgba(0, 0, 0, 0.08)',
                          zIndex: 10,
                          minWidth: '180px',
                        }}
                      >
                        <div style={styles.tooltipHeader}>{hoveredData.month}</div>
                        <div style={styles.tooltipRow}>
                          <div style={styles.tooltipLabelCol}>
                            <span style={{ ...styles.tooltipDot, backgroundColor: '#3b82f6' }}></span>
                            <span>Open demand</span>
                          </div>
                          <span style={styles.tooltipVal}>{hoveredData.openDemand}</span>
                        </div>
                        <div style={styles.tooltipRow}>
                          <div style={styles.tooltipLabelCol}>
                            <span style={{ ...styles.tooltipDot, backgroundColor: '#22c55e' }}></span>
                            <span>Available capacity</span>
                          </div>
                          <span style={styles.tooltipVal}>{hoveredData.availableCapacity}</span>
                        </div>
                      </div>
                    );
                  })()}
                </div>

                <div style={styles.chartLegend}>
                  <div style={styles.legendItem}>
                    <span style={{ ...styles.legendDot, backgroundColor: '#3b82f6' }}></span>
                    <span style={styles.legendLabel}>Open demand</span>
                  </div>
                  <div style={styles.legendItem}>
                    <span style={{ ...styles.legendDot, backgroundColor: '#22c55e' }}></span>
                    <span style={styles.legendLabel}>Available capacity</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* 3. Resource Utilization by Department Card */}
          <div style={styles.analyticsSection}>
            <h3 style={styles.analyticsTitle}>Resource Utilization by Department</h3>
            {departmentUtilization.length === 0 ? (
              <div style={styles.insufficientDataCard}>
                <span style={styles.insufficientDataText}>Insufficient data</span>
                <span style={styles.insufficientDataSubtext}>No department utilization data available.</span>
              </div>
            ) : (
              <div style={styles.metricCard}>
                <div style={styles.deptList}>
                  {departmentUtilization.map((dept, i) => (
                    <div key={dept.department} style={styles.deptRow}>
                      <div style={styles.deptHeader}>
                        <span style={styles.deptName}>{dept.department} ({dept.employeeCount} staff)</span>
                        <span style={styles.deptVal}>{dept.utilization}%</span>
                      </div>
                      <div style={styles.progressContainer}>
                        <div style={{
                          ...styles.progressBar,
                          width: `${dept.utilization}%`,
                          backgroundColor: dept.utilization >= 85 ? 'var(--color-danger)' : dept.utilization >= 60 ? 'var(--color-warning)' : 'var(--color-success)'
                        }}></div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Workforce Report Modal */}
      {showReport && (
        <div style={styles.modalOverlay}>
          <div className="glass-card" style={styles.modalCard}>
            <div style={styles.modalHeader}>
              <h2 style={{ margin: 0, fontSize: '20px' }}>Workforce Allocation & Utilization Report</h2>
              <button onClick={() => setShowReport(false)} style={styles.closeModalBtn}>&times;</button>
            </div>
            <div style={styles.reportContent}>
              <div style={styles.reportSection}>
                <h3>Summary Metrics</h3>
                <div style={styles.reportMetaGrid}>
                  <div><strong>Total Pool Size:</strong> {totalEmployees} employees</div>
                  <div><strong>Available Count:</strong> {workloadCounts.available} employees</div>
                  <div><strong>Fully Loaded:</strong> {workloadCounts.fullyLoaded} employees</div>
                </div>
              </div>

              <div style={styles.reportSection}>
                <h3>Resource Distribution by Role</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px' }}>
                  {Object.entries(roleDistribution).length === 0 ? (
                    <div style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>No role data available.</div>
                  ) : (
                    Object.entries(roleDistribution).map(([role, count]) => (
                      <div key={role} style={styles.reportRow}><span>{role}</span><span>{count} Allocated</span></div>
                    ))
                  )}
                </div>
              </div>

              <button onClick={() => { alert('Report downloaded successfully!'); setShowReport(false); }} style={{ ...styles.downloadBtn, display: 'inline-flex', alignItems: 'center', gap: '8px', justifyContent: 'center' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                  <polyline points="7 10 12 15 17 10"></polyline>
                  <line x1="12" y1="15" x2="12" y2="3"></line>
                </svg>
                Download PDF Report
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: '24px',
    textAlign: 'left',
  },
  header: {
    marginBottom: '8px',
  },
  title: {
    fontSize: '28px',
    fontWeight: '800',
    letterSpacing: '-0.75px',
    marginBottom: '4px',
  },
  subtitle: {
    fontSize: '15px',
    color: 'var(--color-text-secondary)',
  },
  cardGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(5, 1fr)',
    gap: '16px',
  },
  overviewCard: {
    padding: '20px',
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
  },
  cardIconWrapper: {
    width: '44px',
    height: '44px',
    borderRadius: '12px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '20px',
  },
  cardVal: {
    fontSize: '24px',
    fontWeight: '800',
  },
  cardLabel: {
    fontSize: '11px',
    color: 'var(--color-text-muted)',
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  mainGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '24px',
  },
  panel: {
    padding: '24px',
  },
  panelHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '16px',
  },
  panelTitle: {
    fontSize: '18px',
    fontWeight: '700',
    margin: 0,
  },
  reportBtn: {
    backgroundColor: 'var(--color-primary)',
    color: '#ffffff',
    border: 'none',
    padding: '8px 14px',
    borderRadius: '6px',
    fontWeight: '700',
    fontSize: '12px',
    cursor: 'pointer',
  },
  analyticsSection: {
    marginBottom: '32px',
  },
  analyticsTitle: {
    fontSize: '14px',
    fontWeight: '600',
    color: 'var(--color-text-secondary)',
    marginBottom: '12px',
  },
  metricCard: {
    border: '1px solid var(--color-border)',
    borderRadius: '12px',
    padding: '20px',
    backgroundColor: 'rgba(255, 255, 255, 0.015)',
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
    marginTop: '8px',
  },
  metricHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  metricVal: {
    fontSize: '28px',
    fontWeight: '800',
    color: 'var(--color-text-primary)',
  },
  metricBadge: {
    fontSize: '11px',
    fontWeight: '700',
    padding: '4px 10px',
    borderRadius: '30px',
    textTransform: 'uppercase',
  },
  progressContainer: {
    width: '100%',
    height: '8px',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: '4px',
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    borderRadius: '4px',
    transition: 'width 0.3s ease',
  },
  metricBreakdown: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: '12px',
    borderTop: '1px solid var(--color-border)',
    paddingTop: '14px',
  },
  breakdownItem: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  breakdownLabel: {
    fontSize: '10px',
    fontWeight: '600',
    color: 'var(--color-text-muted)',
    textTransform: 'uppercase',
  },
  breakdownVal: {
    fontSize: '16px',
    fontWeight: '700',
    color: 'var(--color-text-primary)',
  },
  chartTitleRow: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    marginBottom: '16px',
    textAlign: 'left',
  },
  chartTitle: {
    fontSize: '15px',
    fontWeight: '700',
    color: 'var(--color-text-primary)',
  },
  chartSubtitle: {
    fontSize: '11px',
    color: 'var(--color-text-muted)',
    lineHeight: '1.4',
  },
  chartWrapper: {
    width: '100%',
    margin: '10px 0',
    position: 'relative',
  },
  tooltipHeader: {
    fontWeight: '700',
    fontSize: '13px',
    marginBottom: '8px',
    color: '#1f2937',
    textAlign: 'left',
  },
  tooltipRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '24px',
    fontSize: '12px',
    marginTop: '6px',
    color: '#4b5563',
  },
  tooltipLabelCol: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  tooltipDot: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    display: 'inline-block',
  },
  tooltipVal: {
    fontWeight: '700',
    color: '#111827',
  },
  chartLegend: {
    display: 'flex',
    justifyContent: 'center',
    gap: '24px',
    marginTop: '12px',
    paddingTop: '12px',
    borderTop: '1px solid var(--color-border)',
  },
  legendItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  legendDot: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    display: 'inline-block',
  },
  legendLabel: {
    fontSize: '12px',
    color: 'var(--color-text-secondary)',
    fontWeight: '500',
  },
  deptList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  deptRow: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  deptHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  deptName: {
    fontSize: '12px',
    fontWeight: '600',
    color: 'var(--color-text-secondary)',
  },
  deptVal: {
    fontSize: '12px',
    fontWeight: '700',
    color: 'var(--color-text-primary)',
  },
  insufficientDataCard: {
    border: '1px dashed var(--color-border)',
    borderRadius: '10px',
    padding: '24px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '6px',
    backgroundColor: 'rgba(255, 255, 255, 0.01)',
  },
  insufficientDataText: {
    fontSize: '13px',
    fontWeight: '700',
    color: 'var(--color-text-secondary)',
  },
  insufficientDataSubtext: {
    fontSize: '11px',
    color: 'var(--color-text-muted)',
    textAlign: 'center',
  },
  filterRow: {
    display: 'flex',
    alignItems: 'center',
    marginBottom: '12px',
  },
  tableWrapper: {
    overflowX: 'auto',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
  },
  th: {
    padding: '12px',
    borderBottom: '2px solid var(--color-border)',
    fontSize: '12px',
    fontWeight: '700',
    color: 'var(--color-text-muted)',
    textTransform: 'uppercase',
    textAlign: 'left',
  },
  tr: {
    borderBottom: '1px solid var(--color-border)',
  },
  td: {
    padding: '14px 12px',
    fontSize: '13px',
    verticalAlign: 'middle',
  },
  empInfo: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  empName: {
    fontWeight: '700',
  },
  empEmail: {
    fontSize: '11px',
    color: 'var(--color-text-muted)',
  },
  roleBadge: {
    fontSize: '11px',
    fontWeight: '700',
    letterSpacing: '0.3px',
    color: 'var(--color-text-secondary)',
  },
  statusBadge: {
    fontSize: '10px',
    fontWeight: '700',
    padding: '3px 8px',
    borderRadius: '30px',
    display: 'inline-block',
  },
  modalOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 999,
  },
  modalCard: {
    width: '100%',
    maxWidth: '520px',
    padding: '28px',
  },
  modalHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottom: '1px solid var(--color-border)',
    paddingBottom: '12px',
  },
  closeModalBtn: {
    background: 'transparent',
    border: 'none',
    fontSize: '24px',
    cursor: 'pointer',
    color: 'var(--color-text-muted)',
  },
  reportContent: {
    marginTop: '16px',
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
  },
  reportSection: {
    textAlign: 'left',
  },
  reportMetaGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '12px',
    fontSize: '13px',
    background: 'var(--color-bg-card-hover)',
    padding: '12px',
    borderRadius: '6px',
    border: '1px solid var(--color-border)',
  },
  filterLabel: {
    fontSize: '12px',
    fontWeight: '700',
    color: 'var(--color-text-secondary)',
    marginRight: '10px',
  },
  selectFilterCompact: {
    padding: '8px 12px',
    borderRadius: '8px',
    border: '1px solid var(--color-border)',
    background: 'var(--color-bg-card)',
    color: 'var(--color-text-primary)',
    outline: 'none',
    fontSize: '13px',
  },
  reportRow: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '12px',
    color: 'var(--color-text-secondary)',
    borderBottom: '1px dashed var(--color-border)',
    paddingBottom: '4px',
  },
  downloadBtn: {
    backgroundColor: 'var(--color-primary)',
    color: '#ffffff',
    border: 'none',
    padding: '12px',
    borderRadius: '6px',
    fontWeight: '700',
    fontSize: '14px',
    cursor: 'pointer',
    marginTop: '10px',
  }
};