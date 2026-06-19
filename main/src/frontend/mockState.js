// Shared mockState utility for persisting and synchronizing frontend state between different views and roles.

const DEFAULT_PROJECTS = [
  {
    id: 1,
    name: 'Substation Lighting & CAD Drafting Design',
    description: 'Create comprehensive electrical and lighting layouts for industrial substations. This includes designing product drawings, multi-cable transit systems, and performing detailed lighting calculations to meet compliance standards.',
    status: 'Pending Approval',
    startDate: '2026-01-22',
    endDate: '2026-05-15',
    requiredSkills: ['AutoCAD 2D & 3D', 'Dialux Lighting Calculation', 'Hawke Transit Design', 'Relux', 'AGI32'],
    manpowerNeeded: 3
  },
  {
    id: 2,
    name: 'Refinery UPS Installation & Relay Commissioning',
    description: 'Oversee the installation, testing, and commissioning of Uninterruptible Power Supply (UPS) systems and industrial motor controllers. Perform routine safety audits and troubleshoot protective relays.',
    status: 'Active',
    startDate: '2026-03-01',
    endDate: '2026-09-30',
    requiredSkills: ['UPS installation and Commissioning', 'Maintenance & Troubleshooting', 'Design and Application', 'Communication with client', 'Sales Quotation and Proposal preparation', 'Product Knowledge'],
    manpowerNeeded: 2
  }
];

const DEFAULT_EMPLOYEES = [
  {
    id: 'EMP-1014',
    name: 'Javier Santos',
    role: 'Senior Cad Drafter & Lighting Designer',
    email: 'javier.santos@wea.com',
    avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&q=80&w=100',
    department: 'Engineering & Design',
    skills: ['AutoCAD 2D & 3D', 'Dialux Lighting Calculation', 'Electrical drawings and product drawings using AutoCAD 2D', 'Lighting design and calculations using Dialux, Relux and AGI32', 'Multi-Cable Transit Design using Hawke Transit Software'],
    certifications: [
      { id: 1, name: 'NC II', issuer: 'Prepare Computer – Aided Drawings Leading to Technical Drafting (Using AutoCAD 2015)', date: '2025-08-14', expiry: 'N/A' },
      { id: 2, name: 'Dialux EVO User Training', issuer: 'Lighting Design Software Training', date: '2024-11-02', expiry: 'N/A' },
      { id: 3, name: 'BOSH 40hrs', issuer: 'Basic Occupational Safety and Health', date: '2025-01-10', expiry: 'N/A' }
    ],
    resumeName: 'Javier_Santos_CV.pdf',
    resumeUploadedAt: '2026-03-12'
  },
  {
    id: 'EMP-1015',
    name: 'Vincent Miguel P. Soriano',
    role: 'Inside Sales / UPS Technical Engineer',
    email: 'miguel.soriano@wea.com',
    avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&q=80&w=100',
    department: 'Sales & Service Engineering',
    skills: ['UPS installation and Commissioning', 'Maintenance & Troubleshooting', 'Design and Application', 'Communication with client', 'Sales Quotation and Proposal preparation', 'Product Knowledge'],
    certifications: [
      { id: 1, name: 'Registered Electrical Engineer License', issuer: 'PRC License', date: '2024-05-10', expiry: 'N/A' },
      { id: 2, name: 'Motor Control', issuer: 'Advance Industrial Motor Control', date: '2024-11-15', expiry: 'N/A' },
      { id: 3, name: 'BOSH', issuer: 'Basic Occupational Safety and Health', date: '2025-03-01', expiry: 'N/A' }
    ],
    resumeName: 'Vincent_Soriano_CV.pdf',
    resumeUploadedAt: '2026-03-05'
  },
  {
    id: 'EMP-1016',
    name: 'Engr. Juan Dela Cruz',
    role: 'Document Controller',
    email: 'juan.cruz@wea.com',
    avatar: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?auto=format&fit=crop&q=80&w=100',
    department: 'Project Management & Quality Control',
    skills: ['Expedites docs related activities by Vendors, Contractors and Engineering team', 'Utilizes a specific project software for document managing and performs clerical/administrative duities', 'Identifying different types of docs such as specifications, engineering drawings, financial records and project deliverables'],
    certifications: [
      { id: 1, name: 'Registered Electrical Engineer', issuer: 'PRC License', date: '2023-04-12', expiry: 'N/A' },
      { id: 2, name: 'Automotive Quality Management System, ISO 9001:2015 and IATF 16949:2016', issuer: 'Understanding Automotive Quality Management System, ISO 9001:2015 and IATF 16949:2016', date: '2025-02-18', expiry: 'N/A' },
      { id: 3, name: 'COSH', issuer: 'Construction Occupational Safety and Health', date: '2025-03-10', expiry: 'N/A' }
    ],
    resumeName: 'Juan_Dela_Cruz_CV.pdf',
    resumeUploadedAt: '2026-04-12'
  },
  {
    id: 'EMP-1017',
    name: 'Maria Santos',
    role: 'Proposal Engineer',
    email: 'maria.santos@wea.com',
    avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&q=80&w=100',
    department: 'Sales & Tendering',
    skills: ['Solution-oriented and problem solver, electrical cost estimator provides support to the Sales Team in preparation of proposal for customer while identifying cost reduction opportunities. Highly skilled in communication, collaboration, and technical documentation.'],
    certifications: [
      { id: 1, name: 'Dialux EVO User Training', issuer: 'Lighting Design Software Training', date: '2024-09-15', expiry: 'N/A' },
      { id: 2, name: 'Eaton’s GEIS Group Masters Club Training Event', issuer: 'Product Training', date: '2025-01-22', expiry: 'N/A' }
    ],
    resumeName: 'Maria_Santos_CV.pdf',
    resumeUploadedAt: '2026-02-28'
  },
  {
    id: 'EMP-1018',
    name: 'Ryan Cayabyab',
    role: 'Senior Design Engineer',
    email: 'ryan.cayabyab@wea.com',
    avatar: 'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?auto=format&fit=crop&q=80&w=100',
    department: 'Engineering & Design',
    skills: ['Electrical drawings and product drawings using AutoCAD 2D', 'Lighting design and calculations using Dialux, Relux and AGI32', 'Multi-Cable Transit Design using Hawke Transit Software'],
    certifications: [
      { id: 1, name: 'NC II', issuer: '3DS MAX - 3D STUDIO MAX 2016 for Architectural Design', date: '2024-05-12', expiry: 'N/A' }
    ],
    resumeName: 'Ryan_Cayabyab_CV.pdf',
    resumeUploadedAt: '2026-05-02'
  },
  {
    id: 'EMP-1019',
    name: 'Clarisse Valenzuela',
    role: 'Senior Sales Engineer',
    email: 'clarisse.valenzuela@wea.com',
    avatar: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?auto=format&fit=crop&q=80&w=100',
    department: 'Sales & Service Engineering',
    skills: ['Sales', 'Application Engineering', 'Service Engineering', 'Operations and Maintenance'],
    certifications: [
      { id: 1, name: 'Registered Electrical Engineer License', issuer: 'PRC License', date: '2023-08-11', expiry: 'N/A' },
      { id: 2, name: 'COSH', issuer: 'OSHC Construction Safety and Health Training', date: '2024-04-15', expiry: 'N/A' }
    ],
    resumeName: 'Clarisse_Valenzuela_CV.pdf',
    resumeUploadedAt: '2026-04-20'
  },
  {
    id: 'EMP-1020',
    name: 'David Lim',
    role: 'Sales Engineer',
    email: 'david.lim@wea.com',
    avatar: 'https://images.unsplash.com/photo-1492562080023-ab3db95bfbce?auto=format&fit=crop&q=80&w=100',
    department: 'Sales & Service Engineering',
    skills: ['Sales', 'Client relationship management', 'negotiation', 'UPS service support', 'Project coordination and support', 'Quality management', 'Process improvement'],
    certifications: [
      { id: 1, name: 'Registered Electrical Engineer', issuer: 'Registered Electrical Engineer', date: '2023-10-10', expiry: 'N/A' },
      { id: 2, name: 'NC II', issuer: 'Electrical Installation and Maintenance', date: '2024-02-12', expiry: 'N/A' },
      { id: 3, name: 'BOSH', issuer: 'Basic Occupational Safety and Health', date: '2024-06-01', expiry: 'N/A' }
    ],
    resumeName: 'David_Lim_CV.pdf',
    resumeUploadedAt: '2026-03-22'
  },
  {
    id: 'EMP-1021',
    name: 'Elena Guerrero',
    role: 'Inside Sales Engineer',
    email: 'elena.guerrero@wea.com',
    avatar: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&q=80&w=100',
    department: 'Sales & Service Engineering',
    skills: ['Sales, Quotations, Technical, Project Management, Coordination with client and supplier, Logistics, Documentation'],
    certifications: [
      { id: 1, name: 'CLSSYB', issuer: 'Lean Six Sigma Yellow Belt Certification', date: '2025-01-15', expiry: 'N/A' },
      { id: 2, name: 'BOSH', issuer: 'Basic Occupational Safety and Health', date: '2024-11-20', expiry: 'N/A' },
      { id: 3, name: 'PMFC', issuer: 'Project Management and Fundamentals Certification', date: '2025-03-05', expiry: 'N/A' }
    ],
    resumeName: 'Elena_Guerrero_CV.pdf',
    resumeUploadedAt: '2026-04-05'
  },
  {
    id: 'EMP-1022',
    name: 'Francis Tolentino',
    role: 'Design Engineer',
    email: 'francis.tolentino@wea.com',
    avatar: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&q=80&w=100',
    department: 'Engineering & Design',
    skills: ['Electrical drawings/layout preparation using industry-standard tools such as SmartPlant 3D, SmartSketch, MicroStation, AutoCAD, Revit', 'Lighting Calculation using DiaLux and Relux'],
    certifications: [
      { id: 1, name: 'Registered Electrical Engineer', issuer: 'Registered Electrical Engineer', date: '2022-09-18', expiry: 'N/A' },
      { id: 2, name: 'COSH', issuer: 'Construction Occupational Safety and Health', date: '2023-11-05', expiry: 'N/A' },
      { id: 3, name: 'BLS - CPR w/ AED', issuer: 'Standard First Aid and Basic Life Support', date: '2024-03-12', expiry: 'N/A' },
      { id: 4, name: 'Motor Control', issuer: 'Advance Industrial Motor Control', date: '2024-07-20', expiry: 'N/A' }
    ],
    resumeName: 'Francis_Tolentino_CV.pdf',
    resumeUploadedAt: '2026-01-15'
  },
  {
    id: 'EMP-1023',
    name: 'Grace Villanueva',
    role: 'Technical Associate',
    email: 'grace.villanueva@wea.com',
    avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=100',
    department: 'Engineering & Design',
    skills: ['AutoCAD 2D & 3D, Dialux Lighting Calculation'],
    certifications: [
      { id: 1, name: 'NC II', issuer: 'Electrical Installation and Maintenance', date: '2025-02-10', expiry: 'N/A' },
      { id: 2, name: 'BOSH 40hrs', issuer: 'Basic Occupational Safety and Health', date: '2025-05-15', expiry: 'N/A' }
    ],
    resumeName: 'Grace_Villanueva_CV.pdf',
    resumeUploadedAt: '2026-05-10'
  },
  {
    id: 'EMP-1024',
    name: 'Ian De Leon',
    role: 'Inside Sales Engineer',
    email: 'ian.deleon@wea.com',
    avatar: 'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?auto=format&fit=crop&q=80&w=100',
    department: 'Sales & Service Engineering',
    skills: ['Sales Coordination & Tendering, Electrical Construction Management, Quality Control & Assurance'],
    certifications: [
      { id: 1, name: 'Registered Electrical Engineer License', issuer: 'PRC License', date: '2023-05-15', expiry: 'N/A' },
      { id: 2, name: 'Career Service Examination - Professional Level', issuer: 'CSE Certification', date: '2024-01-10', expiry: 'N/A' }
    ],
    resumeName: 'Ian_De_Leon_CV.pdf',
    resumeUploadedAt: '2026-03-30'
  },
  {
    id: 'EMP-1025',
    name: 'Jack Forester',
    role: 'Senior Cad Drafter & Lighting Designer',
    email: 'jack.forester@wea.com',
    avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&q=80&w=100',
    department: 'Engineering & Design',
    skills: ['AutoCAD 2D & 3D, Dialux Lighting Calculation'],
    certifications: [
      { id: 1, name: 'Electrical Installation and Maintenance NC II', issuer: 'TESDA Online Program', date: '2024-03-12', expiry: 'N/A' },
      { id: 2, name: 'Photovoltaic Systems Installation NC II', issuer: 'TESDA Online Program', date: '2024-05-15', expiry: 'N/A' },
      { id: 3, name: 'Technical Drafting NC II', issuer: 'TESDA Online Program', date: '2024-07-20', expiry: 'N/A' },
      { id: 4, name: 'NC II', issuer: 'Electrical Installation and Maintenance', date: '2024-09-10', expiry: 'N/A' },
      { id: 5, name: 'NC II', issuer: 'Introduction to Photovoltaic Systems Installation', date: '2024-11-05', expiry: 'N/A' }
    ],
    resumeName: 'Jack_Forester_CV.pdf',
    resumeUploadedAt: '2026-04-02'
  }
];

const DEFAULT_REQUESTS = [
  {
    id: 1,
    projectName: 'Substation Lighting & CAD Drafting Design',
    skills: ['AutoCAD 2D & 3D', 'Dialux Lighting Calculation'],
    timeline: 'Full-Time',
    duration: '48 days',
    startDate: '2026-05-01',
    endDate: '2026-06-18',
    status: 'Pending',
    quantity: 2
  },
  {
    id: 2,
    projectName: 'Refinery UPS Installation & Relay Commissioning',
    skills: ['UPS installation and Commissioning', 'Maintenance & Troubleshooting'],
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
    projectName: 'Refinery UPS Installation & Relay Commissioning',
    employeeId: 'EMP-1014', // Javier Santos
    employeeName: 'Javier Santos',
    title: 'Design lighting calculations in Dialux',
    description: 'Use Dialux EVO to calculate lumen distribution and placement for the substation interior layout.',
    priority: 'High',
    status: 'In Progress',
    dueDate: '2026-06-20'
  },
  {
    id: 2,
    projectId: 2,
    projectName: 'Refinery UPS Installation & Relay Commissioning',
    employeeId: 'EMP-1014', // Javier Santos
    employeeName: 'Javier Santos',
    title: 'Map Hawke Cable Transit layout',
    description: 'Draft the multi-cable transit layout using Hawke software for containment boundaries.',
    priority: 'Medium',
    status: 'Completed',
    dueDate: '2026-06-16'
  },
  {
    id: 3,
    projectId: 2,
    projectName: 'Refinery UPS Installation & Relay Commissioning',
    employeeId: 'EMP-1015', // Vincent Miguel
    employeeName: 'Vincent Miguel P. Soriano',
    title: 'Troubleshoot substation UPS battery banks',
    description: 'Inspect voltage outputs and test high-voltage relays for standard compliance.',
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
