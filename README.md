# El Diablo MES (Metromont CastLink)

**El Diablo** is Metromont's comprehensive Manufacturing Execution System (MES) and BIM-integrated production platform that unifies production scheduling, erection sequencing, quality control, and model-driven reporting into one APS-connected web environment.

## 🏗️ Overview

El Diablo bridges the gap between digital design data and manufacturing operations, providing real-time synchronization between Autodesk Construction Cloud (ACC) projects and Metromont's production workflows. The platform integrates advanced property normalization, 4D sequencing, AI-powered analytics, and comprehensive data management.

## 🚀 Core Modules

### ✅ **Production Scheduling** 
- **Status:** Active
- **Features:** Bed occupancy management, pour schedules, resource allocation
- **Integration:** Real-time capacity planning across multiple plants

### ✅ **Erection Sequence Scheduling** 
- **Status:** Active (Fully Refactored)
- **Features:** 
  - 4D sequencing with CONTROL_NUMBER-based matching
  - Advanced property normalization pipeline
  - Parameter Service integration with custom column picker
  - CSV schedule import with hit-rate reporting
  - Interactive 3D viewer with element isolation
- **Technology:** AEC Data Model GraphQL, APS Viewer, Property System

### ✅ **Quality Control**
- **Status:** Active  
- **Features:** Engineering calculations, stressing protocols, compliance tracking
- **Integration:** AI-powered quality insights and predictive analytics

### ✅ **Design Development**
- **Status:** Active
- **Features:** Technical drawing management, CAD integration, engineering calculations
- **Integration:** Real-time design revision control

### ✅ **Metromont DB (Admin)**
- **Status:** Active
- **Features:** 
  - Pseudo-database built on APS Object Storage Service (OSS)
  - AI-powered data management with GPT-4o integration
  - Relational data with foreign key constraints
  - Admin-only access for data governance
- **Technology:** Netlify Functions, OpenAI API, OSS storage

### 🔄 **Inventory Tracking**
- **Status:** In Development (Q1 2025)
- **Features:** Real-time inventory management, WIP tracking

### 🔄 **Haul Management** 
- **Status:** In Planning (Q3 2025)
- **Features:** Transportation coordination, delivery scheduling

## 🏛️ Architecture

```
metromont_elDiablo/
├── index.html                    # Main dashboard
├── production-scheduling.html    # Production bed management
├── erection-sequencing.html      # 4D sequencing interface  
├── quality-control.html          # Quality management
├── engineering.html              # Design development
├── db-manager.html               # Data management (Admin)
├── clear-cache.html              # Developer tools
├── scripts/
│   ├── config/
│   │   └── property-map.js       # Centralized property mapping
│   ├── services/
│   │   └── parameter-service.js  # Extended parameters API
│   ├── utils/
│   │   ├── model-normalize.js    # Data normalization pipeline
│   │   ├── viewer-mapping.js     # Viewer integration
│   │   └── csv-schedule.js       # Schedule processing
│   ├── aecdm-graphql.js          # AEC Data Model integration
│   ├── erection-sequencing.js    # Main sequencing logic
│   ├── production-scheduling.js  # Production management
│   ├── quality-control.js        # Quality workflows
│   └── db-manager.js             # Data management
├── netlify/functions/            # Serverless backend
│   ├── auth.js                   # Authentication
│   ├── ai-db.js                  # AI-powered data operations
│   ├── db-*.js                   # Database operations
│   └── oss-storage.js           # Object storage
└── docs/                        # Comprehensive documentation
```

## 🔧 Key Features

### 🔄 **ACC Integration**
- Secure OAuth 2.0 authentication with Autodesk Construction Cloud
- Real-time project and model synchronization
- AEC Data Model GraphQL API integration
- Multi-tenant support with hub-based data isolation

### 🧩 **Advanced Property System**
- **Centralized Mapping:** All property names defined in `property-map.js`
- **Normalization Pipeline:** Automatic data cleaning and standardization
- **Winner Selection:** Intelligent handling of duplicate elements (warped vs flat)
- **Validation:** Comprehensive identity checking with detailed logging
- **Extensibility:** Easy addition of new properties via Parameter Service

### 🕓 **4D Sequencing Engine**
- **CONTROL_NUMBER-based matching:** Robust element identification
- **Interactive Timeline:** Play, pause, step through construction phases
- **Element Isolation:** Click-to-isolate elements in 3D viewer
- **Hit Rate Reporting:** Visual feedback on schedule-to-model matching
- **Custom Columns:** Dynamic property selection via "+ Column" picker

### 🤖 **AI-Powered Analytics**
- **GPT-4o Integration:** Natural language data queries
- **Predictive Quality Insights:** AI-driven quality recommendations
- **Automated Data Operations:** AI-assisted database management
- **Smart Property Mapping:** Automatic candidate property detection

### 📊 **Data Management**
- **Pseudo-Database:** Built on APS Object Storage Service (OSS)
- **Relational Integrity:** Foreign key constraints and referential integrity
- **Admin Controls:** Secure data governance with role-based access
- **Export/Import:** CSV compatibility with advanced data transformation

### 🎯 **Developer Experience**
- **Comprehensive Logging:** Full pipeline visibility with performance metrics
- **Cache Management:** Advanced caching with developer tools
- **Error Handling:** Detailed error reporting and recovery
- **Documentation:** Extensive guides and troubleshooting resources

## 🚀 Getting Started

### Prerequisites
- **Autodesk Account** with AEC Data Model enabled
- **Revit 2024+** models published to ACC with AEC DM activation
- **APS Application** with scopes: `data:read`, `account:read`, `viewables:read`, `bucket:*`
- **Admin Access** (for DB Manager): Email must be in `ADMIN_EMAILS` environment variable

### Quick Start
1. **Navigate to El Diablo:** Access via your organization's deployment
2. **Authenticate:** Log in with your Autodesk credentials
3. **Select Module:** Choose from Production, Erection, Quality, or Design
4. **Load Project:** Select ACC project and model
5. **Configure:** Set up properties and filters
6. **Execute:** Run sequences, manage production, or analyze quality

### For Erection Sequencing:
1. **Load Model:** Select project and element group
2. **Load Properties:** Click "Load Properties Table" to run normalization pipeline
3. **Add Columns:** Use "+ Column" to add custom properties
4. **Load Schedule:** Upload CSV with CONTROL_NUMBER column
5. **Play Sequence:** Use timeline controls to visualize construction

## 📈 Advanced Capabilities

### Property System Implementation
- **Step 1-3:** ✅ Property mapping, normalization utilities, data pipelines
- **Step 4-7:** ✅ GraphQL integration, UI updates, CSV mapping, Parameter Service
- **Future:** AEC-DM write-back, persistent schedules, multi-model support

### Database Management
- **Admin Pack:** Complete relational schema with foreign keys
- **AI Operations:** Natural language database queries
- **Data Integrity:** Automatic validation and constraint enforcement
- **Backup/Restore:** Full data export and import capabilities

### Quality Control Integration
- **Engineering Calculations:** Advanced stressing and load analysis
- **Compliance Tracking:** Automated quality protocol management
- **AI Insights:** Predictive quality recommendations
- **Document Management:** Technical drawing and revision control

## 🔧 Technical Stack

- **Frontend:** Vanilla JavaScript (ES6 modules), HTML5, CSS3
- **Backend:** Netlify Functions (Node.js), OpenAI GPT-4o
- **Storage:** APS Object Storage Service (OSS)
- **Authentication:** Autodesk OAuth 2.0 (3LO + 2LO)
- **APIs:** AEC Data Model GraphQL, APS Viewer, OpenAI API
- **Deployment:** Netlify with edge functions and serverless architecture

## 📚 Documentation

- **[Property System Implementation](PROPERTY_SYSTEM_IMPLEMENTATION.md)** - Complete property mapping and normalization
- **[Erection Sequencing Refactor](ERECTION_SEQUENCING_REFACTOR_SUMMARY.md)** - Detailed module refactoring
- **[DB Manager Setup](DB_MANAGER_SETUP.md)** - Database configuration and administration
- **[Developer Tools](DEVELOPER_TOOLS.md)** - Cache management and debugging

## 🛠️ Development

### Environment Variables (Required)
```bash
OPENAI_API_KEY=sk-proj-...          # AI Assistant
APS_CLIENT_ID=your-aps-client-id    # 2LO OSS operations  
APS_CLIENT_SECRET=your-secret       # 2LO OSS operations
ACC_CLIENT_ID=your-acc-client-id    # 3LO user auth
ACC_CLIENT_SECRET=your-secret        # 3LO user auth
PSEUDO_DB_BUCKET=metromont-el-diablo-db-dev
ADMIN_EMAILS=mkeck@metromont.com
```

### Cache Management
- **Quick Clear:** Navigate to `/clear-cache.html`
- **Hard Reload:** `Ctrl + Shift + R` (Windows/Linux) or `Cmd + Shift + R` (Mac)
- **Developer Tools:** `F12` → Network → "Disable cache"

## 🎯 Roadmap

### Short Term (Q1 2025)
- ✅ Property grouping editor and saved view formats
- ✅ Color-coding by activity type  
- ✅ Export/import of sequences to ACC
- 🔄 Inventory tracking module
- 🔄 Enhanced AI analytics

### Long Term (Q2-Q4 2025)
- 🔄 Inline schedule editing
- 🔄 Persistent project-level sequence storage
- 🔄 Real-time collaboration across teams
- 🔄 Multi-model support and advanced filtering
- 🔄 ERP integration and advanced reporting

## 📞 Support

**Metromont LLC**  
📧 **Email:** helpdesk@metromont.com  
🌐 **Web:** https://www.metromont.com/  
📱 **Phone:** (123) 456-7890

---

## 📍 **MILESTONE: Rollback Point**
**Commit: `68f887d` - "fix: Add dual-path parser for db-rows function"**
- Database-backed ACL system fully functional
- User management working in DB Manager  
- API endpoints fixed and operational
- **ROLL BACK TO HERE IF NEXT REFACTOR FAILS**

---

**El Diablo MES** - *Connecting manufacturing excellence with project success through integrated technology solutions.*