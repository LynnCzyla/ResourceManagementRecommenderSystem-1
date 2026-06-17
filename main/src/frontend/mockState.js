// Shared mockState utility for persisting and synchronizing frontend state between different views and roles.

const DEFAULT_PROJECTS = [
  {
    id: 1,
    name: 'Customer Support Ticketing System (Phase 1)',
    description: 'The project involves building a web-based ticketing system that enables customers to submit support requests and allows support agents to manage, track, and resolve tickets efficiently. Phase 1 covers user authentication, ticket creation, ticket assignment workflows, and a basic admin dashboard. The goal is to streamline the support process and reduce manual handling.',
    status: 'Pending Approval',
    startDate: '2026-01-22',
    endDate: '2026-05-15',
    requiredSkills: ['React', 'Node.js', 'PostgreSQL', 'TailwindCSS'],
    manpowerNeeded: 4
  },
  {
    id: 2,
    name: 'Inventory and Supply Chain Tracker',
    description: 'Real-time tracking of heavy industrial components across three major distribution warehouses. Includes barcode integration, automated stock replenishment alerts, and predictive analytics for demand planning.',
    status: 'Active',
    startDate: '2026-03-01',
    endDate: '2026-09-30',
    requiredSkills: ['React', 'Python', 'Flask', 'OCR Scanner', 'FastAPI'],
    manpowerNeeded: 3
  }
];

const DEFAULT_EMPLOYEES = [
  {
    id: 'EMP-1014',
    name: 'Javier Santos',
    role: 'Senior Developer',
    email: 'employee@wea.com',
    avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&q=80&w=100',
    department: 'Engineering',
    skills: ['React', 'JavaScript', 'Node.js', 'PostgreSQL', 'Git'],
    certifications: [
      { id: 1, name: 'AWS Certified Solutions Architect', issuer: 'Amazon Web Services', date: '2025-08-14', expiry: '2028-08-14' },
      { id: 2, name: 'Professional Scrum Master I', issuer: 'Scrum.org', date: '2024-11-02', expiry: 'N/A' }
    ],
    resumeName: 'Javier_Santos_CV.pdf',
    resumeUploadedAt: '2026-03-12'
  },
  {
    id: 'EMP-1015',
    name: 'Vincent Miguel P. Soriano',
    role: 'Software Engineer',
    email: 'miguel.soriano@wea.com',
    avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&q=80&w=100',
    department: 'Engineering',
    skills: ['React', 'Python', 'TailwindCSS', 'Flask'],
    certifications: [
      { id: 1, name: 'Oracle Certified Associate, Java SE 8', issuer: 'Oracle', date: '2024-05-10', expiry: 'N/A' }
    ],
    resumeName: 'Vincent_Soriano_CV.pdf',
    resumeUploadedAt: '2026-03-05'
  },
  {
    id: 'EMP-1016',
    name: 'Engr. Juan Dela Cruz',
    role: 'Backend Developer',
    email: 'juan.cruz@wea.com',
    avatar: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?auto=format&fit=crop&q=80&w=100',
    department: 'Engineering',
    skills: ['Node.js', 'PostgreSQL', 'Docker', 'Python', 'FastAPI'],
    certifications: [
      { id: 1, name: 'Docker Certified Associate', issuer: 'Docker', date: '2025-02-18', expiry: '2027-02-18' }
    ],
    resumeName: 'Juan_Dela_Cruz_CV.pdf',
    resumeUploadedAt: '2026-04-12'
  }
];

const DEFAULT_REQUESTS = [
  {
    id: 1,
    projectName: 'Customer Support Ticketing System (Phase 1)',
    skills: ['React', 'Node.js'],
    timeline: 'Full-Time',
    duration: '48 days',
    startDate: '2026-05-01',
    endDate: '2026-06-18',
    status: 'Pending',
    quantity: 2
  },
  {
    id: 2,
    projectName: 'Inventory and Supply Chain Tracker',
    skills: ['OCR Scanner', 'FastAPI'],
    timeline: 'Full-Time',
    duration: '90 days',
    startDate: '2026-03-01',
    endDate: '2026-05-30',
    status: 'Approved',
    quantity: 1
  }
];

const DEFAULT_TASKS = [
  {
    id: 1,
    projectId: 2,
    projectName: 'Inventory and Supply Chain Tracker',
    employeeId: 'EMP-1014', // Javier Santos
    employeeName: 'Javier Santos',
    title: 'Setup FastAPI router endpoints',
    description: 'Create the core endpoints for handling warehouse stock levels and sync updates with frontend components.',
    priority: 'High',
    status: 'In Progress',
    dueDate: '2026-06-20'
  },
  {
    id: 2,
    projectId: 2,
    projectName: 'Inventory and Supply Chain Tracker',
    employeeId: 'EMP-1014', // Javier Santos
    employeeName: 'Javier Santos',
    title: 'Build Stock Table Dashboard UI',
    description: 'Design a responsive table showcasing product inventories, thresholds, and search tags.',
    priority: 'Medium',
    status: 'Completed',
    dueDate: '2026-06-16'
  },
  {
    id: 3,
    projectId: 2,
    projectName: 'Inventory and Supply Chain Tracker',
    employeeId: 'EMP-1015', // Vincent Miguel
    employeeName: 'Vincent Miguel P. Soriano',
    title: 'OCR Barcode Scanning Utility Integration',
    description: 'Integrate the image capture pipeline with OCR API to extract barcode numbers from packages.',
    priority: 'High',
    status: 'Pending',
    dueDate: '2026-06-25'
  }
];

const loadState = (key, defaults) => {
  try {
    const saved = localStorage.getItem(`wea_rm_${key}`);
    if (saved) return JSON.parse(saved);
  } catch (e) {
    console.error('Error reading localStorage', e);
  }
  return defaults;
};

const saveState = (key, data) => {
  try {
    localStorage.setItem(`wea_rm_${key}`, JSON.stringify(data));
  } catch (e) {
    console.error('Error writing localStorage', e);
  }
};

export const getProjects = () => loadState('projects', DEFAULT_PROJECTS);
export const saveProjects = (projects) => saveState('projects', projects);

export const getEmployees = () => loadState('employees', DEFAULT_EMPLOYEES);
export const saveEmployees = (employees) => saveState('employees', employees);

export const getRequests = () => loadState('requests', DEFAULT_REQUESTS);
export const saveRequests = (requests) => saveState('requests', requests);

export const getTasks = () => loadState('tasks', DEFAULT_TASKS);
export const saveTasks = (tasks) => saveState('tasks', tasks);
