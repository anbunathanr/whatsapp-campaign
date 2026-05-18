import pandas as pd
import numpy as np
from faker import Faker
import random
import uuid

def generate_synthetic_data(num_records=50000, output_file="synthetic_contacts.csv"):
    fake = Faker()
    
    # Industry to Job Title mapping (Expanded to ~50-60 roles per industry)
    industry_job_map = {
        "Technology": [
            "Software Engineer", "Data Scientist", "Cloud Architect", "DevOps Engineer", "Frontend Developer", 
            "Backend Developer", "Full Stack Developer", "Systems Architect", "Machine Learning Engineer", "Cybersecurity Analyst",
            "SRE (Site Reliability Engineer)", "Database Administrator", "IT Project Manager", "UX/UI Designer", "Mobile App Developer",
            "QA Automation Engineer", "Network Architect", "Data Architect", "Blockchain Developer", "Computer Vision Engineer",
            "Natural Language Processing Scientist", "Security Engineer", "Technical Support Engineer", "Web Developer", "App Architect",
            "Embedded Systems Engineer", "API Developer", "Cloud Security Specialist", "Scrum Master", "Product Owner (Tech)",
            "Solutions Architect", "Virtualization Engineer", "IT Systems Manager", "Software Development Manager", "Lead Developer",
            "Principal Engineer", "Junior Developer", "Senior Developer", "Staff Engineer", "IT Consultant",
            "ERP Specialist", "SAP Consultant", "Salesforce Developer", "Cloud Migration Specialist", "Infrastructure Engineer",
            "Big Data Engineer", "Data Warehouse Architect", "Analytics Engineer", "Bioinformatics Software Engineer", "Game Developer"
        ],
        "Healthcare": [
            "Doctor", "Nurse", "Pharmacist", "Medical Technician", "Surgeon", "Dentist", "Physiotherapist", "Radiologist",
            "General Practitioner", "Pediatrician", "Cardiologist", "Neurologist", "Oncology Nurse", "Medical Assistant",
            "Occupational Therapist", "Speech Pathologist", "Dietitian", "Nutritionist", "Paramedic", "Phlebotomist",
            "Medical Lab Scientist", "Health Informatics Specialist", "Clinical Research Coordinator", "Hospital Administrator", "Patient Care Coordinator",
            "Medical Transcriptionist", "Veterinarian", "Optometrist", "Chiropractor", "Dermatologist", "Psychiatrist",
            "Clinical Psychologist", "Mental Health Counselor", "Anesthesiologist", "Obstetrician", "Gynecologist", "Endocrinologist",
            "Infectious Disease Specialist", "Home Health Aide", "Medical Billing Specialist", "Healthcare Consultant", "Epidemiologist",
            "Public Health Officer", "Geriatric Nurse", "Surgical Technician", "Pharmacy Technician", "Orthopedic Surgeon", "Pathologist"
        ],
        "Banking and Financial Services": [
            "Bank Manager", "Financial Analyst", "Loan Officer", "Investment Banker", "Accountant", "Risk Analyst", "Compliance Officer",
            "Mortgage Broker", "Wealth Manager", "Portfolio Manager", "Treasury Analyst", "Internal Auditor", "Tax Consultant",
            "Credit Analyst", "Commercial Banker", "Stockbroker", "Equity Research Analyst", "Financial Planner", "Underwriter (Finance)",
            "Private Equity Associate", "Hedge Fund Manager", "Quantitative Analyst", "M&A Analyst", "Relationship Manager", "Branch Manager",
            "Bank Teller", "Customer Service Representative (Finance)", "Asset Manager", "Accounts Payable Clerk", "Accounts Receivable Clerk",
            "Controller", "Chief Financial Officer", "Anti-Money Laundering Specialist", "Fraud Investigator", "Venture Capitalist",
            "Investment Consultant", "Reinsurance Specialist", "Actuarial Assistant (Finance)", "Budget Analyst", "Payroll Specialist"
        ],
        "Agriculture": [
            "Farmer", "Agronomist", "Agricultural Engineer", "Farm Manager", "Soil Scientist", "Livestock Manager",
            "Crop Consultant", "Irrigation Specialist", "Horticulturist", "Plant Pathologist", "Agricultural Technician",
            "Farm Equipment Mechanic", "Pesticide Applicator", "Greenhouse Manager", "Viticulturist", "Beekeeper",
            "Rancher", "Dairy Manager", "Poultry Specialist", "Agricultural Economist", "Precision Ag Specialist",
            "Harvest Manager", "Seed Technologist", "Silviculturist", "Fisheries Manager", "Aquaculture Specialist",
            "Farm Labor Contractor", "Agribusiness Consultant", "Organic Farming Specialist", "Environmental Scientist (Ag)"
        ],
        "Education": [
            "Teacher", "Professor", "Academic Counselor", "Principal", "Education Consultant", "Lecturer", "Tutor",
            "School Administrator", "Dean of Students", "Instructional Designer", "Special Education Teacher", "ESL Instructor",
            "Preschool Teacher", "Kindergarten Teacher", "High School Teacher", "Middle School Teacher", "Elementary School Teacher",
            "Librarian", "Curriculum Developer", "School Psychologist", "Admissions Officer", "Registrar", "Superintendent",
            "Education Researcher", "Academic Advisor", "Training Coordinator", "Workshop Facilitator", "Online Course Instructor"
        ],
        "Manufacturing": [
            "Production Manager", "Quality Control Inspector", "Manufacturing Engineer", "Plant Supervisor", "Assembly Line Worker",
            "Mechanical Engineer", "Industrial Engineer", "Operations Manager", "Process Engineer", "Maintenance Technician",
            "Machinist", "Welder", "Tool and Die Maker", "Inventory Control Specialist", "Supply Chain Planner",
            "Lean Manufacturing Specialist", "Six Sigma Black Belt", "Production Scheduler", "safety Officer (Manufacturing)",
            "Product Designer", "Prototype Engineer", "Materials Scientist", "CNC Programmer", "Packaging Engineer"
        ],
        "Retail": [
            "Retail Store Manager", "Sales Associate", "Cashier", "Merchandiser", "Inventory Manager", "Store Clerk",
            "Visual Merchandiser", "Retail Buyer", "Store Supervisor", "Loss Prevention Specialist", "Department Manager",
            "Customer Experience Manager", "Purchasing Agent", "E-commerce Coordinator", "Retail Operations Manager",
            "Category Manager", "Retail Marketing Specialist", "Sales Floor Associate", "Customer Service Desk Lead"
        ],
        "Sales and Marketing": [
            "Sales Executive", "Business Development Manager", "Marketing Coordinator", "SEO Specialist", "Social Media Manager", 
            "Copywriter", "Sales Representative", "Marketing Manager", "Brand Manager", "Content Marketer", "Digital Strategist",
            "PPC Specialist", "Email Marketing Specialist", "Art Director", "Account Executive", "Account Manager",
            "Customer Success Manager", "Public Relations Specialist", "Market Researcher", "Sales Director", "Regional Sales Manager",
            "Inside Sales Representative", "Outside Sales Representative", "Growth Hacker", "Campaign Manager", "Media Planner"
        ],
        "Telecommunications": [
            "Network Engineer", "Telecom Technician", "Broadband Engineer", "Wireless Communication Specialist", "Network Administrator",
            "Fiber Optic Technician", "VoIP Engineer", "Satellite Communications Specialist", "RF Engineer", "Telecommunications Consultant",
            "Systems Integration Engineer (Telecom)", "Tower Technician", "Field Service Engineer", "NOC Technician", "Network Security Engineer"
        ],
        "Construction": [
            "Civil Engineer", "Construction Worker", "Site Supervisor", "Surveyor", "Architect", "Project Manager (Construction)",
            "Structural Engineer", "Carpenter", "Mason", "Plumber", "Heavy Equipment Operator", "estimator",
            "Construction Superintendent", "Safety Manager (Construction)", "Building Inspector", "CAD Designer",
            "Draftsperson", "Foreman", "Painter", "Roofer", "Drywall Installer", "Flooring Contractor"
        ],
        "Transportation and Logistics": [
            "Logistics Coordinator", "Supply Chain Manager", "Truck Driver", "Dispatcher", "Warehouse Manager", "Fleet Manager",
            "Freight Forwarder", "Import/Export Clerk", "Courier", "Delivery Driver", "Shipping Clerk", "Receiving Clerk",
            "Logistics Analyst", "Transportation Planner", "Inventory Specialist", "Port Operations Manager", "Terminal Manager"
        ],
        "Energy and Utilities": [
            "Energy Auditor", "Power Plant Engineer", "Solar Technician", "Electrical Engineer (Power)", "Renewable Energy Specialist",
            "Electrician", "Lineman", "Nuclear Engineer", "Wind Turbine Technician", "Gas Utility Worker", "Water Treatment Operator",
            "Energy Consultant", "Geothermal Technician", "Hydroelectric Plant Manager", "Grid Operations Manager"
        ],
        "Pharmaceuticals": [
            "Pharmacologist", "Clinical Research Associate", "Drug Safety Specialist", "Pharmaceutical Scientist", "Regulatory Affairs Manager",
            "Medical Science Liaison", "Lab Manager (Pharma)", "Formulation Scientist", "Analytical Chemist", "Biostatistician (Pharma)",
            "Quality Assurance Specialist (Pharma)", "Pharmaceutical Sales Rep", "Clinical Trial Manager"
        ],
        "Insurance": [
            "Insurance Agent", "Actuary", "Claims Adjuster", "Underwriter", "Insurance Broker", "Risk Solicitor",
            "Claims Manager", "Loss Adjuster", "Insurance Underwriter", "Risk Manager", "Compliance Specialist (Insurance)",
            "Insurance Sales Manager", "Customer Service (Insurance)"
        ],
        "Media and Entertainment": [
            "Video Editor", "Journalist", "Producer", "Content Creator", "Actor", "Graphic Designer", "Sound Engineer",
            "Film Director", "Animator", "Screenwriter", "Broadcast Engineer", "Publicist", "Talent Agent",
            "Social Media Influencer", "Photographer", "Art Curator", "Event Manager"
        ],
        "Hospitality and Tourism": [
            "Hotel Manager", "Tour Guide", "Travel Agent", "Receptionist", "Executive Chef", "Event Planner",
            "Concierge", "Housekeeping Supervisor", "Front Office Manager", "Flight Attendant", "Resort Manager",
            "Catering Manager", "Sommelier", "Pastry Chef", "Spa Manager"
        ],
        "Real Estate": [
            "Real Estate Agent", "Property Manager", "Real Estate Broker", "Appraiser", "Leasing Consultant",
            "Commercial Real Estate Advisor", "Real Estate Analyst", "Closing Coordinator", "Title Officer", "Facility Manager"
        ],
        "Automotive": [
            "Automotive Mechanic", "Car Designer", "Auto Sales Consultant", "Service Advisor", "Automotive Engineer",
            "Body Shop Manager", "Auto Parts Specialist", "Diesel Mechanic", "Fleet Maintenance Manager", "Auto Electrician"
        ],
        "Government and Public Sector": [
            "Public Policy Analyst", "Social Worker", "Urban Planner", "Public Relations Officer", "Administrative Assistant (Gov)",
            "Police Officer", "Firefighter", "Postal Worker", "Diplomat", "Intelligence Analyst", "Military Officer"
        ],
        "Legal Services": [
            "Lawyer", "Paralegal", "Legal Secretary", "Judge", "Compliance Officer (Legal)", "Notary Public",
            "Litigation Support Specialist", "Corporate Counsel", "Court Reporter", "Legal Assistant"
        ],
        "Consulting": [
            "Management Consultant", "Strategy Consultant", "IT Consultant", "Operations Consultant", "Business Analyst",
            "Change Management Consultant", "Human Capital Consultant", "Economic Consultant", "Risk Consultant"
        ],
        "Aerospace and Defense": [
            "Aerospace Engineer", "Aircraft Mechanic", "Defense Analyst", "Systems Engineer (Aerospace)", "Pilot",
            "Avionics Technician", "Propulsion Engineer", "Spacecraft Designer", "Flight Surgeon"
        ],
        "Biotechnology": [
            "Biotechnologist", "Bioinformatics Scientist", "Microbiologist", "Geneticist", "Lab Technician (Bio)",
            "Molecular Biologist", "Bioprocess Engineer", "Biomedical Engineer", "Clinical Data Manager"
        ],
        "E-commerce": [
            "E-commerce Manager", "Digital Marketing Specialist (E-com)", "Product Manager (E-com)", "Customer Support Specialist",
            "Dropshipping Specialist", "Online Store Owner", "Affiliate Marketer", "Marketplace Operations Manager"
        ],
        "Food and Beverage": [
            "Chef", "Restaurant Manager", "Waitstaff", "Barista", "Food Scientist", "Beverage Director",
            "Brewer", "Distiller", "Kitchen Manager", "Pastry Cook", "Line Cook", "Bartender"
        ],
        "Mining": [
            "Mining Engineer", "Geologist", "Driller", "Mine Safety Inspector", "Blaster",
            "Mine Geotechnologist", "Quarry Manager", "Resource Analyst"
        ],
        "Textiles and Apparel": [
            "Fashion Designer", "Textile Engineer", "Tailor", "Garment Worker", "Production Coordinator (Apparel)",
            "Fabric Buyer", "Apparel Designer", "Textile Chemist", "Pattern Maker"
        ],
        "Environmental Services": [
            "Environmental Consultant", "Conservationist", "Waste Management Specialist", "Sustainability Coordinator",
            "Ecologist", "Wildlife Biologist", "Environmental Engineer", "Recycling Coordinator"
        ],
        "Human Resources": [
            "HR Manager", "Recruiter", "Talent Acquisition Specialist", "Compensation Analyst", "HR Generalist",
            "Employee Relations Specialist", "Benefits Coordinator", "HRIS Analyst", "Director of Talent"
        ],
        "Information Technology Services": [
            "IT Support Specialist", "System Administrator", "Help Desk Technician", "IT Director", "Cybersecurity Analyst",
            "Service Desk Manager", "Cloud Support Engineer", "Network Operations Manager"
        ]
    }

    experience_levels = ["Entry", "Mid", "Senior", "Executive"]
    industries = list(industry_job_map.keys())
    
    data = []
    
    print(f"Generating {num_records} synthetic records...")
    
    for i in range(num_records):
        # Balanced industry distribution
        industry = industries[i % len(industries)]
        job_title = random.choice(industry_job_map[industry])
        
        record = {
            "ContactID": str(uuid.uuid4()),
            "Name": fake.name(),
            "Phone": fake.phone_number(),
            "Email": fake.email(),
            "JobTitle": job_title,
            "Industry": industry,
            "CompanyName": fake.company(),
            "Location": f"{fake.city()}, {fake.state()}",
            "ExperienceLevel": random.choice(experience_levels)
        }
        data.append(record)
        
        if (i + 1) % 10000 == 0:
            print(f"Generated {i + 1} records...")

    df = pd.DataFrame(data)
    df.to_csv(output_file, index=False)
    print(f"Successfully saved dataset to {output_file}")

if __name__ == "__main__":
    generate_synthetic_data(num_records=50000)
