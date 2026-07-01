# train_ml.py
"""
Train the ML Skill Classifier
Run this ONCE before processing documents to give ML basic knowledge
"""
import sys
from pathlib import Path

# Add modules path
sys.path.append(str(Path(__file__).parent / 'modules'))

from modules.skill_classifier import SkillClassifier

print("=" * 70)
print("🧠 TRAINING ML SKILL CLASSIFIER")
print("=" * 70)
print()

# ============================================================
# SAMPLE TRAINING DATA - 50 SKILLS + 74 NON-SKILLS
# This gives the ML basic knowledge before you upload documents
# ============================================================

training_texts = [
    # ========== SKILLS (label = 1) ==========
    # Software & Tools
    "AutoCAD", "AutoCAD 2D", "AutoCAD 3D", "Dialux", "Relux", "AGI32",
    "Microsoft Excel", "Microsoft Word", "Microsoft PowerPoint",
    "Python", "Java", "SQL", "ERP", "Bid Management Tools",
    
    # Engineering & Technical
    "Electrical Engineering", "Mechanical Engineering", "Civil Engineering",
    "Lighting Design", "Lighting Calculations", "Electrical Drawings",
    "Technical Drafting", "Product Drawings", "Technical Documentation",
    "Proposal Engineering", "Cost Estimation", "Sales Engineering",
    "Project Management", "Data Analysis", "Machine Learning",
    
    # Soft Skills
    "Leadership", "Communication", "Problem Solving", 
    "Cross-functional Collaboration", "Team Management",
    "Client Requirements", "Technical Support", "Project Coordination",
    
    # Industry-specific
    "Multi-Cable Transit", "Hawke Transit", "Electrical Switchgear",
    "Bid Management", "Tendering Process", "Technical Bidding",
    "Industrial Proposal", "Medium Voltage Projects", "Power Systems",
    
    # Resume Skills (from your actual resumes)
    "Proposal Engineering", "Electrical Cost Estimation", "Technical Sales Support",
    "Client Requirement Analysis", "Engineering Coordination", "Project Support",
    "Value Engineering", "Cost Optimization", "Technical Specification Review",
    
    # ========== NOT SKILLS (label = 0) ==========
    # Personal Information
    "Philippines", "Manila", "Pasig", "Quezon City",
    "Patrick Lawrence Cruz", "Carlo Miguel Reyes", "Engr. John Doe",
    "Full Name", "Employee ID", "Date of Birth", "Nationality", "Email", "Phone",
    "Address", "Contact", "Signature", "Photo",
    
    # Document Structure
    "Company Logo", "WEA Employee Competency Profile", "Confidential",
    "Internal Use Only", "Professional Summary", "Educational Background",
    "Technical Competencies", "Software Proficiency", "Industry Experience",
    "Areas of Specialization", "Product and Technical Knowledge",
    "Relevant Project Experience", "Competency Classification",
    "Manager Remarks", "License", "Certificate",
    
    # Education & Institutions
    "University", "College", "Mapúa University", "Batangas State University",
    "Bachelor of Science", "Master of Science", "Doctor of Philosophy",
    "Graduate", "Undergraduate", "Alumnus", "Dean's List", "Institution",
    "Year Completed", "Degree", "Course", "Professional License",
    
    # Dates & Numbers
    "2024", "2023", "2022", "January", "February", "March",
    "10 years", "5 years", "2015", "2016", "2019", "June 15, 2016",
    "March 11, 2020", "Date Hired", "Employment Status", "Regular", 
    
    # Job Titles & Roles (not skills)
    "Proposal Engineer", "Senior Design Engineer", "Project Manager",
    "Supervisor", "General Manager", "Department Head",
    "Position", "Department", "Immediate Supervisor", "Primary Role",
    "Experience Category", "Senior-Level", "Functional Area",
    
    # Licenses & IDs
    "PRC", "License Number", "REE-003-78421", "REE-003-78422",
    "Employee ID", "EMP-005", "EMP-006", "ID", "Number", "Year Obtained",
    "Registered Electrical Engineer", "Registered Electrical",
    
    # More noise
    "Employee Photo", "Insert 2x2 Photo Here", "COMPANY LOGO",
    "WEA", "EMPLOYEE COMPETENCY PROFILE", "Confidential – Internal Use Only",
    "Professional Summary", "Educational Background", "Technical Competencies"
]

# ============================================================
# COUNT: Skills = 50, Not Skills = 74 (124 - 50)
# ============================================================

# Labels: 1 = Skill, 0 = Not Skill
# Count how many skills you have in training_texts (first 50 are skills)
skill_count = 50
not_skill_count = len(training_texts) - skill_count

training_labels = [1] * skill_count + [0] * not_skill_count

print(f"📊 Training Data: {len(training_texts)} samples")
print(f"   Skills: {sum(training_labels)}")
print(f"   Not Skills: {len(training_labels) - sum(training_labels)}")
print()

# ============================================================
# TRAIN THE CLASSIFIER
# ============================================================

print("🔄 Training classifier...")
print()

classifier = SkillClassifier()
success = classifier.train(training_texts, training_labels)

if success:
    print()
    print("=" * 70)
    print("✅ ML CLASSIFIER TRAINED SUCCESSFULLY!")
    print("=" * 70)
    print(f"📁 Model saved to: {classifier.model_path}")
    print()
    
    # ============================================================
    # TEST THE CLASSIFIER
    # ============================================================
    
    print("🧪 Testing the classifier...")
    print("-" * 70)
    
    test_phrases = [
        # Should be Skills
        "AutoCAD", "Project Management", "Microsoft Excel", "Lighting Design",
        "Proposal Engineering", "Cross-functional Collaboration", "Python",
        "Bid Management Tools", "Electrical Engineering",
        
        # Should NOT be Skills
        "Philippines", "Certificate", "Mapúa University", "Patrick Cruz",
        "10 years", "Company Logo", "Full Name", "License Number",
        "Employee ID", "Date Hired", "Proposal Engineer", "EMP-006"
    ]
    
    print(f"{'Phrase':<35} {'Result':<15} {'Confidence'}")
    print("-" * 70)
    
    for phrase in test_phrases:
        result = classifier.predict(phrase)
        status = "✅ SKILL" if result['prediction'] == 1 else "❌ NOT SKILL"
        conf = result['confidence']
        print(f"{phrase:<35} {status:<15} {conf:.2%}")
    
    print()
    print("=" * 70)
    print("🎯 ML Classifier is ready to use!")
    print("📤 Now upload your documents and see it in action!")
    print("=" * 70)
    
else:
    print()
    print("❌ Training failed. Please check your data.")