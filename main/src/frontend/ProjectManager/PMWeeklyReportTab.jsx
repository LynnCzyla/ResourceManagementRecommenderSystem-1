import React, { useState, useEffect, useMemo } from 'react';
import ExcelJS from 'exceljs';
import { getTasks, getProjects } from './pmApi';

export default function PMWeeklyReportTab({ user }) {
    const [tasks, setTasks] = useState([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState('');
    const [exporting, setExporting] = useState(false);

    const [searchQuery, setSearchQuery] = useState('');
    const [employeeFilter, setEmployeeFilter] = useState('all');
    const [projectFilter, setProjectFilter] = useState('all');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const [pageJumpValue, setPageJumpValue] = useState('');
    const rowsPerPage = 10;

    const loadData = async () => {
        setLoading(true);
        try {
            const [projectsData, tasksData] = await Promise.all([
                getProjects(user?.id),
                getTasks()
            ]);
            const myProjectIds = new Set(projectsData.map(p => p.id));
            const myTasks = (tasksData || []).filter(t => myProjectIds.has(t.projectId));
            setTasks(myTasks);
            setLoadError('');
        } catch (err) {
            console.error('Failed to load weekly report data:', err);
            setLoadError(err.message || 'Failed to load report data');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadData();
    }, [user]);

    // Flatten: one row per progress-log entry, not per task.
    // projectName / employeeName already come straight off each task from
    // transformTask() in backend/routes/ProjectManager/tasks.js, so no
    // extra lookups are needed here.
    const reportRows = useMemo(() => {
        const rows = [];
        tasks.forEach(task => {
            const logs = task.progressLogs || [];
            if (logs.length === 0) {
                // Still show tasks with no logs yet, so PMs see idle work
                rows.push({
                    id: `${task.id}-none`,
                    taskTitle: task.title,
                    taskDesc: task.description,
                    percentage: null,
                    date: null,
                    rawDate: null,
                    employee: task.employeeName,
                    project: task.projectName,
                });
                return;
            }

            let runningCumulative = 0;
            logs.forEach((log, idx) => {
                runningCumulative += (parseInt(log.percentage, 10) || 0);
                rows.push({
                    id: `${task.id}-${idx}`,
                    taskTitle: task.title,
                    taskDesc: task.description,
                    percentage: Math.min(100, runningCumulative),
                    date: log.date ? new Date(log.date).toLocaleDateString() : '—',
                    rawDate: log.date ? log.date.split('T')[0] : null, // YYYY-MM-DD
                    employee: task.employeeName,
                    project: task.projectName,
                });
            });
        });
        return rows;
    }, [tasks]);

    const employeeOptions = useMemo(() => {
        return Array.from(new Set(tasks.map(t => t.employeeName).filter(Boolean))).sort();
    }, [tasks]);

    const projectOptions = useMemo(() => {
        return Array.from(new Set(tasks.map(t => t.projectName).filter(Boolean))).sort();
    }, [tasks]);

    const filteredRows = reportRows.filter(row => {
        const matchesSearch =
            row.taskTitle.toLowerCase().includes(searchQuery.toLowerCase()) ||
            (row.taskDesc || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
            row.employee.toLowerCase().includes(searchQuery.toLowerCase()) ||
            row.project.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesEmployee = employeeFilter === 'all' || row.employee === employeeFilter;
        const matchesProject = projectFilter === 'all' || row.project === projectFilter;

        // From/To Date filter
        const matchesStartDate = !startDate || (row.rawDate && row.rawDate >= startDate);
        const matchesEndDate = !endDate || (row.rawDate && row.rawDate <= endDate);

        return matchesSearch && matchesEmployee && matchesProject && matchesStartDate && matchesEndDate;
    });

    const clearFilters = () => {
        setSearchQuery('');
        setEmployeeFilter('all');
        setProjectFilter('all');
        setStartDate('');
        setEndDate('');
    };

    const totalPages = Math.max(1, Math.ceil(filteredRows.length / rowsPerPage));
    const safeCurrentPage = Math.min(currentPage, totalPages);
    const paginatedRows = filteredRows.slice(
        (safeCurrentPage - 1) * rowsPerPage,
        safeCurrentPage * rowsPerPage
    );

    useEffect(() => {
        setCurrentPage(1);
    }, [searchQuery, employeeFilter, projectFilter, startDate, endDate]);

    const goToPage = (page) => {
        const clamped = Math.min(Math.max(1, page), totalPages);
        setCurrentPage(clamped);
        setPageJumpValue('');
    };

    const handlePageJumpSubmit = (e) => {
        e.preventDefault();
        const page = parseInt(pageJumpValue, 10);
        if (!isNaN(page)) goToPage(page);
    };

    // ---- Color palette used for the Excel export ----
    // Navy + gold reads as a utility/engineering-company palette (fits WEA).
    const XLSX_COLORS = {
        titleBg: 'FF0B1220',       // near-black navy
        titleAccent: 'FFF5B700',   // gold accent bar
        titleText: 'FFFFFFFF',
        subBg: 'FFF1F5F9',
        subText: 'FF475569',
        headerBg: 'FF1E3A5F',      // deep navy blue
        headerText: 'FFFFFFFF',
        rowEven: 'FFFFFFFF',
        rowOdd: 'FFF6F8FA',
        border: 'FFD9DEE4',
        outerBorder: 'FF1E3A5F',
        completedBg: 'FFDCFCE7',
        completedText: 'FF15803D',
        progressBg: 'FFDBEAFE',
        progressText: 'FF1D4ED8',
        pendingBg: 'FFF1F5F9',
        pendingText: 'FF64748B',
    };

    const statusStyleFor = (percentage) => {
        if (percentage === 100) return { bg: XLSX_COLORS.completedBg, text: XLSX_COLORS.completedText, label: 'Completed' };
        if (percentage > 0) return { bg: XLSX_COLORS.progressBg, text: XLSX_COLORS.progressText, label: 'In Progress' };
        return { bg: XLSX_COLORS.pendingBg, text: XLSX_COLORS.pendingText, label: 'Pending' };
    };

    // Rough estimate of how many wrapped lines a string needs at a given column width.
    const estimateWrappedLines = (text, charsPerLine) => {
        if (!text) return 1;
        // account for existing newlines plus wrapping within each segment
        return text.split('\n').reduce((sum, seg) => sum + Math.max(1, Math.ceil(seg.length / charsPerLine)), 0);
    };

    const exportExcel = async () => {
        setExporting(true);
        try {
            const workbook = new ExcelJS.Workbook();
            workbook.creator = user?.name || 'RMRS';
            workbook.created = new Date();

            const sheet = workbook.addWorksheet('Weekly Report', {
                views: [{ state: 'frozen', ySplit: 5, showGridLines: false }],
            });

            const columns = [
                { header: 'Task Name', width: 46, key: 'task' },
                { header: '% Complete', width: 13, key: 'pct' },
                { header: 'Status', width: 15, key: 'status' },
                { header: 'Log Date', width: 14, key: 'date' },
                { header: 'Assigned Employee', width: 22, key: 'employee' },
                { header: 'Project Name', width: 30, key: 'project' },
            ];
            sheet.columns = columns.map(c => ({ width: c.width }));
            const totalCols = columns.length;
            const taskColCharsPerLine = 44; // roughly matches column A's rendered width

            // --- Title band (row 1), with a thin gold accent row underneath it ---
            sheet.mergeCells(1, 1, 1, totalCols);
            const titleCell = sheet.getCell(1, 1);
            titleCell.value = 'WEA  •  WEEKLY PROGRESS REPORT';
            titleCell.font = { bold: true, size: 15, color: { argb: XLSX_COLORS.titleText }, name: 'Calibri' };
            titleCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
            sheet.getRow(1).height = 30;
            sheet.getRow(1).eachCell({ includeEmpty: true }, cell => {
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: XLSX_COLORS.titleBg } };
            });

            sheet.mergeCells(2, 1, 2, totalCols);
            const accentCell = sheet.getCell(2, 1);
            sheet.getRow(2).height = 4;
            sheet.getRow(2).eachCell({ includeEmpty: true }, cell => {
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: XLSX_COLORS.titleAccent } };
            });

            // --- Subtitle row: generated date + scope, combined on one line ---
            const dateStr = `Generated ${new Date().toLocaleString()}`;
            const scopeStr = `Project: ${projectFilter === 'all' ? 'All' : projectFilter}   |   Employee: ${employeeFilter === 'all' ? 'All' : employeeFilter}`;
            sheet.mergeCells(3, 1, 3, totalCols);
            const subCell = sheet.getCell(3, 1);
            subCell.value = `${dateStr}      ${scopeStr}`;
            subCell.font = { italic: true, size: 10, color: { argb: XLSX_COLORS.subText } };
            subCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
            sheet.getRow(3).height = 20;
            sheet.getRow(3).eachCell({ includeEmpty: true }, cell => {
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: XLSX_COLORS.subBg } };
            });

            // Row 4 is a blank spacer
            sheet.getRow(4).height = 8;

            // --- Header row (row 5) ---
            const headerRowIdx = 5;
            const headerRow = sheet.getRow(headerRowIdx);
            columns.forEach((c, i) => {
                const cell = headerRow.getCell(i + 1);
                cell.value = c.header;
                cell.font = { bold: true, size: 11, color: { argb: XLSX_COLORS.headerText } };
                cell.alignment = { vertical: 'middle', horizontal: i === 1 || i === 2 ? 'center' : 'left', indent: i === 0 || i === 4 || i === 5 ? 1 : 0 };
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: XLSX_COLORS.headerBg } };
                cell.border = {
                    top: { style: 'thin', color: { argb: XLSX_COLORS.outerBorder } },
                    bottom: { style: 'medium', color: { argb: XLSX_COLORS.outerBorder } },
                    left: { style: 'thin', color: { argb: XLSX_COLORS.outerBorder } },
                    right: { style: 'thin', color: { argb: XLSX_COLORS.outerBorder } },
                };
            });
            headerRow.height = 24;

            // --- Data rows ---
            filteredRows.forEach((row, idx) => {
                const excelRowIdx = headerRowIdx + 1 + idx;
                const status = statusStyleFor(row.percentage);
                const dataRow = sheet.getRow(excelRowIdx);
                const taskText = row.taskDesc ? `${row.taskTitle}\n${row.taskDesc}` : row.taskTitle;

                const cellDefs = [
                    { value: taskText, wrap: true, align: 'left' },
                    { value: row.percentage != null ? row.percentage / 100 : 0, align: 'center', numFmt: '0%' },
                    { value: status.label, align: 'center' },
                    { value: row.rawDate ? new Date(row.rawDate) : null, align: 'center', numFmt: 'mm/dd/yyyy' },
                    { value: row.employee, align: 'left', indent: 1 },
                    { value: row.project, align: 'left', indent: 1 },
                ];

                cellDefs.forEach((def, colIdx) => {
                    const cell = dataRow.getCell(colIdx + 1);
                    cell.value = def.value === null ? '—' : def.value;
                    if (def.numFmt) cell.numFmt = def.numFmt;
                    cell.alignment = { vertical: 'middle', horizontal: def.align, wrapText: !!def.wrap, indent: def.indent || 0 };
                    cell.border = {
                        top: { style: 'hair', color: { argb: XLSX_COLORS.border } },
                        bottom: { style: 'hair', color: { argb: XLSX_COLORS.border } },
                        left: { style: 'thin', color: { argb: XLSX_COLORS.outerBorder } },
                        right: { style: 'thin', color: { argb: XLSX_COLORS.outerBorder } },
                    };
                    const baseFill = idx % 2 === 0 ? XLSX_COLORS.rowEven : XLSX_COLORS.rowOdd;
                    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: baseFill } };
                });

                // Task name: slightly bold title line
                dataRow.getCell(1).font = { size: 11 };

                // % Complete: bold + status color
                const pctCell = dataRow.getCell(2);
                pctCell.font = { bold: true, color: { argb: status.text } };
                pctCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: status.bg } };

                // Status: bold + status color badge look
                const statusCell = dataRow.getCell(3);
                statusCell.font = { bold: true, size: 10, color: { argb: status.text } };
                statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: status.bg } };

                // Dynamic row height so wrapped task names never get clipped
                const lines = estimateWrappedLines(taskText, taskColCharsPerLine);
                dataRow.height = Math.max(20, lines * 14 + 6);
            });

            // Give the whole table a strong outer border
            const lastDataRow = headerRowIdx + filteredRows.length;
            for (let r = headerRowIdx; r <= lastDataRow; r++) {
                const row = sheet.getRow(r);
                [1, totalCols].forEach(colIdx => {
                    const cell = row.getCell(colIdx);
                    cell.border = {
                        ...cell.border,
                        left: colIdx === 1 ? { style: 'medium', color: { argb: XLSX_COLORS.outerBorder } } : cell.border.left,
                        right: colIdx === totalCols ? { style: 'medium', color: { argb: XLSX_COLORS.outerBorder } } : cell.border.right,
                    };
                });
            }
            sheet.getRow(lastDataRow).eachCell(cell => {
                cell.border = { ...cell.border, bottom: { style: 'medium', color: { argb: XLSX_COLORS.outerBorder } } };
            });

            // Autofilter on the header row so the person can sort/filter in Excel
            sheet.autoFilter = {
                from: { row: headerRowIdx, column: 1 },
                to: { row: headerRowIdx, column: totalCols },
            };

            // --- Footer: row count + legend ---
            const footerRowIdx = lastDataRow + 2;
            sheet.mergeCells(footerRowIdx, 1, footerRowIdx, totalCols);
            const footerCell = sheet.getCell(footerRowIdx, 1);
            footerCell.value = `${filteredRows.length} row(s)  —  Completed / In Progress / Pending are color-coded above`;
            footerCell.font = { italic: true, size: 9, color: { argb: XLSX_COLORS.subText } };
            footerCell.alignment = { horizontal: 'left', indent: 1 };

            const buffer = await workbook.xlsx.writeBuffer();
            const blob = new Blob([buffer], {
                type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `weekly-report-${new Date().toISOString().slice(0, 10)}.xlsx`;
            link.click();
            URL.revokeObjectURL(url);
        } catch (err) {
            console.error('Failed to export Excel report:', err);
            setLoadError('Failed to generate Excel export');
        } finally {
            setExporting(false);
        }
    };

    if (loading) return <div style={{ padding: '24px', color: 'var(--color-text-secondary)' }}>Loading report...</div>;

    return (
        <div style={styles.container}>
            <style>{`
        .report-table-row {
          transition: background-color 0.15s ease;
        }
        .report-table-row:hover {
          background-color: var(--color-bg-card-hover) !important;
        }
        .task-badge {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 6px 12px;
          border-radius: 20px;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.3px;
          min-width: 60px;
        }
        .task-badge-completed {
          background-color: rgba(16, 185, 129, 0.12);
          color: var(--color-success);
          border: 1px solid rgba(16, 185, 129, 0.2);
        }
        .task-badge-progress {
          background-color: rgba(2, 132, 199, 0.12);
          color: var(--color-accent);
          border: 1px solid rgba(2, 132, 199, 0.2);
        }
        .task-badge-pending {
          background-color: var(--color-bg-root);
          color: var(--color-text-muted);
          border: 1px solid var(--color-border);
        }
      `}</style>

            <div style={styles.header}>
                <h1 style={styles.title}>Weekly Progress Report</h1>
                <p style={styles.subtitle}>Task-level progress across your team, by week.</p>
            </div>

            {loadError && (
                <div className="glass-card" style={styles.errorBanner}>{loadError}</div>
            )}

            <div className="glass-card" style={styles.card}>
                <div style={styles.controls}>
                    <input
                        type="text"
                        placeholder="Search task, employee, or project..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        style={styles.searchInput}
                    />
                    <select value={employeeFilter} onChange={(e) => setEmployeeFilter(e.target.value)} style={styles.select}>
                        <option value="all">All Employees</option>
                        {employeeOptions.map(name => (
                            <option key={name} value={name}>{name}</option>
                        ))}
                    </select>
                    <select value={projectFilter} onChange={(e) => setProjectFilter(e.target.value)} style={styles.select}>
                        <option value="all">All Projects</option>
                        {projectOptions.map(name => (
                            <option key={name} value={name}>{name}</option>
                        ))}
                    </select>
                    <div style={styles.dateFilterContainer}>
                        <label style={styles.dateLabel}>From:</label>
                        <input
                            type="date"
                            value={startDate}
                            onChange={(e) => setStartDate(e.target.value)}
                            style={styles.dateInput}
                        />
                    </div>
                    <div style={styles.dateFilterContainer}>
                        <label style={styles.dateLabel}>To:</label>
                        <input
                            type="date"
                            value={endDate}
                            onChange={(e) => setEndDate(e.target.value)}
                            style={styles.dateInput}
                        />
                    </div>
                    <button onClick={clearFilters} style={styles.clearBtn} className="hover-sidebar-item">Clear Filters</button>
                    <button onClick={exportExcel} disabled={exporting} style={{ ...styles.exportBtn, opacity: exporting ? 0.6 : 1, cursor: exporting ? 'wait' : 'pointer' }}>
                        {exporting ? 'Generating...' : 'Export Excel'}
                    </button>
                </div>

                <div style={styles.tableWrapper}>
                    <table style={styles.table}>
                        <thead>
                            <tr style={styles.trHeader}>
                                <th style={styles.thTask}>Task</th>
                                <th style={styles.thPercent}>% Complete</th>
                                <th style={styles.thDate}>Date</th>
                                <th style={styles.thEmployee}>Employee</th>
                                <th style={styles.thProject}>Project</th>
                            </tr>
                        </thead>
                        <tbody>
                            {paginatedRows.length === 0 ? (
                                <tr><td colSpan={5} style={styles.emptyCell}>No progress logs match your filters.</td></tr>
                            ) : (
                                paginatedRows.map((row, idx) => {
                                    let badgeClass = 'task-badge task-badge-pending';
                                    if (row.percentage === 100) {
                                        badgeClass = 'task-badge task-badge-completed';
                                    } else if (row.percentage > 0) {
                                        badgeClass = 'task-badge task-badge-progress';
                                    }

                                    const rowBg = idx % 2 === 0 ? 'transparent' : 'rgba(128, 128, 128, 0.02)';

                                    return (
                                        <tr
                                            key={row.id}
                                            className="report-table-row"
                                            style={{ ...styles.trRow, backgroundColor: rowBg }}
                                        >
                                            <td style={styles.tdTask}>
                                                <div style={{ fontWeight: '700', color: 'var(--color-text-primary)' }}>{row.taskTitle}</div>
                                                {row.taskDesc && (
                                                    <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginTop: '4px', fontStyle: 'italic' }}>
                                                        {row.taskDesc}
                                                    </div>
                                                )}
                                            </td>
                                            <td style={styles.tdPercent}>
                                                <span className={badgeClass}>
                                                    {row.percentage != null ? `${row.percentage}%` : '—'}
                                                </span>
                                            </td>
                                            <td style={styles.tdDate}>{row.date || '—'}</td>
                                            <td style={styles.tdEmployee}>{row.employee}</td>
                                            <td style={styles.tdProject}>{row.project}</td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>

                {filteredRows.length > 0 && (
                    <div style={styles.paginationBar}>
                        <span style={styles.paginationInfo}>
                            Showing {(safeCurrentPage - 1) * rowsPerPage + 1}
                            -{Math.min(safeCurrentPage * rowsPerPage, filteredRows.length)} of {filteredRows.length}
                        </span>
                        <div style={styles.paginationControls}>
                            <button
                                type="button"
                                onClick={() => goToPage(safeCurrentPage - 1)}
                                disabled={safeCurrentPage === 1}
                                style={{ ...styles.pageBtn, ...(safeCurrentPage === 1 ? styles.pageBtnDisabled : {}) }}
                            >
                                &lt;
                            </button>
                            {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                                <button
                                    key={page}
                                    type="button"
                                    onClick={() => goToPage(page)}
                                    style={{ ...styles.pageBtn, ...(page === safeCurrentPage ? styles.pageBtnActive : {}) }}
                                >
                                    {page}
                                </button>
                            ))}
                            <button
                                type="button"
                                onClick={() => goToPage(safeCurrentPage + 1)}
                                disabled={safeCurrentPage === totalPages}
                                style={{ ...styles.pageBtn, ...(safeCurrentPage === totalPages ? styles.pageBtnDisabled : {}) }}
                            >
                                &gt;
                            </button>
                            <form onSubmit={handlePageJumpSubmit} style={styles.pageJumpForm}>
                                <input
                                    type="number"
                                    min="1"
                                    max={totalPages}
                                    value={pageJumpValue}
                                    onChange={(e) => setPageJumpValue(e.target.value)}
                                    placeholder="Go to"
                                    style={styles.pageJumpInput}
                                />
                            </form>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

const styles = {
    container: { display: 'flex', flexDirection: 'column', gap: '24px' },
    header: { marginBottom: '8px' },
    title: { fontSize: '28px', fontWeight: '800', letterSpacing: '-0.75px', marginBottom: '4px' },
    subtitle: { fontSize: '15px', color: 'var(--color-text-secondary)' },
    errorBanner: { padding: '12px 16px', color: 'var(--color-danger)', fontSize: '13px', fontWeight: '600' },
    card: { padding: '24px' },
    controls: { display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '20px' },
    searchInput: {
        padding: '8px 12px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)',
        background: 'var(--color-bg-root)', color: 'var(--color-text-primary)', fontSize: '13px',
        outline: 'none', minWidth: '220px', flex: 1,
    },
    select: {
        padding: '8px 12px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)',
        background: 'var(--color-bg-root)', color: 'var(--color-text-primary)', fontSize: '13px', outline: 'none',
    },
    exportBtn: {
        padding: '8px 16px', borderRadius: 'var(--radius-md)', border: 'none',
        backgroundColor: 'var(--color-primary)', color: '#fff', fontWeight: '700', fontSize: '13px', cursor: 'pointer',
    },
    tableWrapper: { overflowX: 'auto', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', background: 'var(--color-bg-card)' },
    table: { width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '850px' },
    trHeader: { borderBottom: '2px solid var(--color-border)', background: 'var(--color-bg-card-hover)' },
    thTask: { padding: '16px 12px', fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', color: 'var(--color-text-secondary)', width: '40%', minWidth: '320px' },
    thPercent: { padding: '16px 12px', fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', color: 'var(--color-text-secondary)', width: '12%', minWidth: '120px', textAlign: 'center' },
    thDate: { padding: '16px 12px', fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', color: 'var(--color-text-secondary)', width: '13%', minWidth: '110px' },
    thEmployee: { padding: '16px 12px', fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', color: 'var(--color-text-secondary)', width: '15%', minWidth: '150px' },
    thProject: { padding: '16px 12px', fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', color: 'var(--color-text-secondary)', width: '20%', minWidth: '200px' },
    trRow: { borderBottom: '1px solid var(--color-border)', transition: 'background-color 0.15s ease' },
    tdTask: { padding: '14px 12px', fontSize: '13px', color: 'var(--color-text-primary)', fontWeight: '600', whiteSpace: 'normal', wordBreak: 'break-word', lineHeight: '1.45', verticalAlign: 'middle' },
    tdPercent: { padding: '14px 12px', fontSize: '13px', color: 'var(--color-text-secondary)', textAlign: 'center', verticalAlign: 'middle' },
    tdDate: { padding: '14px 12px', fontSize: '12px', color: 'var(--color-text-muted)', fontFamily: 'monospace', verticalAlign: 'middle', whiteSpace: 'nowrap' },
    tdEmployee: { padding: '14px 12px', fontSize: '13px', color: 'var(--color-text-secondary)', fontWeight: '500', verticalAlign: 'middle' },
    tdProject: { padding: '14px 12px', fontSize: '13px', color: 'var(--color-text-secondary)', verticalAlign: 'middle', lineHeight: '1.4' },
    emptyCell: { padding: '36px', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '14px' },
    dateFilterContainer: { display: 'flex', alignItems: 'center', gap: '6px' },
    dateLabel: { fontSize: '11px', fontWeight: '700', color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' },
    dateInput: {
        padding: '8px 12px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)',
        background: 'var(--color-bg-root)', color: 'var(--color-text-primary)', fontSize: '13px', outline: 'none',
    },
    clearBtn: {
        padding: '8px 16px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)',
        backgroundColor: 'var(--color-bg-card-hover)', color: 'var(--color-text-primary)', fontWeight: '700', fontSize: '13px', cursor: 'pointer',
        transition: 'all 0.15s ease',
    },
    paginationBar: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '12px',
        padding: '16px 8px 4px',
        borderTop: '1px solid var(--color-border)',
        marginTop: '12px',
    },
    paginationInfo: {
        fontSize: '13px',
        color: 'var(--color-text-muted)',
    },
    paginationControls: {
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
    },
    pageBtn: {
        minWidth: '32px',
        height: '32px',
        padding: '0 8px',
        borderRadius: 'var(--radius-md)',
        border: '1px solid var(--color-border)',
        background: 'var(--color-bg-root)',
        color: 'var(--color-text-primary)',
        fontSize: '13px',
        cursor: 'pointer',
    },
    pageBtnActive: {
        background: 'var(--color-primary)',
        borderColor: 'var(--color-primary)',
        color: '#ffffff',
        fontWeight: '700',
    },
    pageBtnDisabled: {
        opacity: 0.4,
        cursor: 'not-allowed',
    },
    pageJumpForm: {
        marginLeft: '4px',
    },
    pageJumpInput: {
        width: '60px',
        height: '32px',
        padding: '0 8px',
        borderRadius: 'var(--radius-md)',
        border: '1px solid var(--color-border)',
        background: 'var(--color-bg-root)',
        color: 'var(--color-text-primary)',
        fontSize: '13px',
        outline: 'none',
    },
};